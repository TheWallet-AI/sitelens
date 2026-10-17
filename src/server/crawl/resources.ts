import { LIMITS } from "../../core/limits";
import { RESOURCE_KINDS, type ResourceKind } from "../../core/contract";
import {
  validateResource,
  type ResourceIssue,
  type ResourceObservation,
} from "../../core/resources";
import { redactSensitive } from "../../core/sensitive";
import type { Evidence } from "../../core/schema";
import { safeFetch, DownloadBudget } from "./transport";
import { fetchRobotsFile, parseRobots, type RobotsCache } from "./robots";

/**
 * The machine-readable resource phase of an audit.
 *
 * Every request is a GET through `safeFetch` (SSRF checks, DNS pinning,
 * redirect revalidation, decoded byte caps) and shares the audit's download
 * budget. Probes respect robots.txt for SiteLens, stay on the audited host,
 * and run under their own deadline so a slow or hostile host cannot hold the
 * whole audit. Nothing here submits forms, signs in, or calls a declared tool.
 */

const ACCEPT: Record<string, string> = {
  text: "text/plain,text/markdown;q=0.9,*/*;q=0.1",
  markdown: "text/markdown,text/plain;q=0.9,*/*;q=0.1",
  json: "application/json,*/*;q=0.1",
  linkset: "application/linkset+json,application/json;q=0.9",
  xml: "application/xml,text/xml;q=0.9,*/*;q=0.1",
};

const sameHost = (a: URL, b: URL) =>
  a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");

export type ResourcePhase = {
  observations: ResourceObservation[];
  evidence: Evidence[];
  notes: string[];
};

function observation(
  kind: ResourceKind,
  url: string,
  partial: Partial<ResourceObservation> &
    Pick<ResourceObservation, "state" | "summary">,
): ResourceObservation {
  return {
    kind,
    url,
    finalUrl: null,
    httpStatus: null,
    contentType: null,
    bytes: 0,
    issues: [],
    declared: { links: [] },
    evidenceId: null,
    ...partial,
  };
}

async function inBatches<T>(
  items: T[],
  size: number,
  run: (item: T) => Promise<void>,
) {
  for (let i = 0; i < items.length; i += size)
    await Promise.all(items.slice(i, i + size).map(run));
}

function failureSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/too large/i.test(message))
    return `The file exceeds the ${Math.round(LIMITS.resourceBytes / 1024)} KiB inspection limit and was not inspected.`;
  if (/budget/i.test(message))
    return "The audit download budget was used up before this file.";
  if (/changes the website host|Cross-origin/i.test(message))
    return "The request redirected to another host and was not followed.";
  if (/non-public/i.test(message))
    return "The file redirected to a non-public address and was blocked.";
  return "The file could not be retrieved (network error or timeout).";
}

export async function probeResources(
  origin: URL,
  options: {
    signal: AbortSignal;
    budget: DownloadBudget;
    robots: RobotsCache;
    onResource?: (observation: ResourceObservation) => void;
  },
): Promise<ResourcePhase> {
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(LIMITS.resourcePhaseMs),
  ]);
  const root = new URL("/", origin);
  const evidence: Evidence[] = [];
  const notes: string[] = [];
  const results = new Map<ResourceKind, ResourceObservation>();
  const record = (obs: ResourceObservation) => {
    results.set(obs.kind, obs);
    options.onResource?.(obs);
  };
  const cite = (
    kind: ResourceKind,
    url: string,
    finalUrl: string,
    body: string,
  ) => {
    const id = `resource-${kind.replace(/_/g, "-")}`;
    const text = redactSensitive(
      body.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " "),
    );
    evidence.push({
      id,
      sourceUrl: url,
      finalUrl,
      retrievedAt: new Date().toISOString(),
      excerpt:
        text.slice(0, LIMITS.resourceExcerpt) +
        (text.length > LIMITS.resourceExcerpt ? "\n[truncated]" : ""),
      locationHint: `Machine-readable resource (${kind}); bounded excerpt, sensitive values redacted.`,
    });
    return id;
  };

  // robots.txt is both a resource and the policy for every other probe.
  const robotsUrl = new URL("/robots.txt", root).href;
  const robots = await fetchRobotsFile(root, {
    signal,
    budget: options.budget,
    cache: options.robots,
  });
  if (!robots)
    record(
      observation("robots_txt", robotsUrl, {
        state: "unknown",
        summary:
          "robots.txt could not be retrieved, so other resources were not requested.",
      }),
    );
  else {
    const verdict = validateResource(
      "robots_txt",
      {
        status: robots.status,
        contentType: robots.contentType,
        body: robots.body,
        finalUrl: robots.finalUrl,
      },
      root.href,
    );
    record(
      observation("robots_txt", robotsUrl, {
        ...verdict,
        finalUrl: robots.finalUrl,
        httpStatus: robots.status,
        contentType: robots.contentType || null,
        bytes: Buffer.byteLength(robots.body),
        evidenceId:
          robots.status >= 200 && robots.status < 300 && robots.body.trim()
            ? cite("robots_txt", robotsUrl, robots.finalUrl, robots.body)
            : null,
      }),
    );
  }

  const policy = (url: URL) =>
    robots
      ? parseRobots(robots.status, robots.body, url)
      : { status: "unknown" as const, reason: "Robots policy is unavailable." };

  const declaredSitemap = (
    results.get("robots_txt")?.declared.sitemaps ?? []
  ).find((s) => sameHost(new URL(s), root));
  const targets = RESOURCE_KINDS.filter((r) => r.kind !== "robots_txt").slice(
    0,
    LIMITS.resourceProbes - 1,
  );

  await inBatches([...targets], LIMITS.resourceConcurrency, async (spec) => {
    const kind = spec.kind as ResourceKind;
    const url =
      kind === "sitemap_xml" && declaredSitemap
        ? new URL(declaredSitemap)
        : new URL(spec.path, root);
    if (signal.aborted) {
      record(
        observation(kind, url.href, {
          state: "unknown",
          summary: "The resource phase ran out of time before this file.",
        }),
      );
      return;
    }
    const decision = policy(url);
    if (decision.status !== "allowed") {
      record(
        observation(kind, url.href, {
          state: decision.status === "disallowed" ? "blocked" : "unknown",
          summary:
            decision.status === "disallowed"
              ? "robots.txt disallows SiteLens from fetching this file; it was not requested."
              : "The robots policy is unavailable, so this file was not requested.",
        }),
      );
      return;
    }
    try {
      const response = await safeFetch(url, {
        signal,
        budget: options.budget,
        entryHost: root.hostname,
        accept: ACCEPT[spec.format],
        maxBytes: LIMITS.resourceBytes,
        requestMs: LIMITS.resourceMs,
        beforeRedirect: async (next) => {
          if (policy(next).status !== "allowed")
            throw new Error("Robots policy disallows the redirect target.");
        },
      });
      const contentType = response.headers["content-type"] ?? "";
      const verdict = validateResource(
        kind,
        {
          status: response.status,
          contentType,
          body: response.body,
          finalUrl: response.finalUrl,
        },
        root.href,
      );
      const found =
        verdict.state !== "not_found" &&
        response.status >= 200 &&
        response.status < 300;
      record(
        observation(kind, url.href, {
          ...verdict,
          finalUrl: response.finalUrl,
          httpStatus: response.status,
          contentType: contentType || null,
          bytes: Buffer.byteLength(response.body),
          evidenceId: found
            ? cite(kind, url.href, response.finalUrl, response.body)
            : null,
        }),
      );
    } catch (error) {
      record(
        observation(kind, url.href, {
          state: "unknown",
          summary: failureSummary(error),
        }),
      );
    }
  });

  // ── Declared MCP endpoint: reachability only ──────────────────────────
  const mcp = ["mcp_server_card", "mcp_discovery", "ai_json"]
    .map((k) => results.get(k as ResourceKind))
    .find(
      (o) =>
        o &&
        (o.state === "valid" || o.state === "inconsistent") &&
        o.declared.endpoints?.length,
    );
  const endpoint = mcp?.declared.endpoints?.find((e) =>
    sameHost(new URL(e), root),
  );
  if (
    mcp &&
    endpoint &&
    !signal.aborted &&
    policy(new URL(endpoint)).status === "allowed"
  ) {
    try {
      const response = await safeFetch(new URL(endpoint), {
        signal,
        budget: options.budget,
        entryHost: root.hostname,
        accept: "application/json, text/event-stream",
        requestMs: LIMITS.resourceMs,
        discardBody: true,
      });
      const status = response.status;
      const challenge = response.headers["www-authenticate"] ?? "";
      if (status === 404 || status === 410) {
        mcp.state = mcp.state === "valid" ? "inconsistent" : mcp.state;
        mcp.issues.push({
          code: "mcp_endpoint_unreachable",
          detail: `The declared MCP endpoint returned HTTP ${status}.`,
        });
      } else if (status === 401) {
        const metadata = /resource_metadata="([^"]+)"/i.exec(challenge)?.[1];
        mcp.summary += metadata
          ? " The endpoint requires authorization and advertises protected-resource metadata (RFC 9728)."
          : " The endpoint requires authorization but does not advertise protected-resource metadata.";
      } else
        mcp.summary += ` The endpoint answered a plain GET with HTTP ${status} (a POST-only Streamable HTTP endpoint commonly answers 405).`;
    } catch {
      mcp.summary += " The declared endpoint could not be reached.";
    }
  } else if (mcp && mcp.declared.endpoints?.length && !endpoint) {
    mcp.summary += " The endpoint is on another host and was not contacted.";
  }

  // ── Declared same-site links: status only ─────────────────────────────
  const owners: [ResourceKind, ResourceIssue["code"]][] = [
    ["llms_txt", "llms_txt_broken_links"],
    ["ai_json", "ai_json_inconsistent"],
    ["business_actions", "business_actions_inconsistent"],
  ];
  const probed = new Set([...results.values()].map((o) => o.finalUrl ?? o.url));
  const checks: {
    url: string;
    owner: ResourceKind;
    code: ResourceIssue["code"];
  }[] = [];
  for (const [owner, code] of owners) {
    const obs = results.get(owner);
    if (!obs || (obs.state !== "valid" && obs.state !== "inconsistent"))
      continue;
    for (const link of obs.declared.links) {
      const url = new URL(link);
      if (
        !sameHost(url, root) ||
        probed.has(url.href) ||
        url.href === root.href
      )
        continue;
      if (checks.some((c) => c.url === url.href)) continue;
      checks.push({ url: url.href, owner, code });
    }
  }
  const sample = checks.slice(0, LIMITS.resourceLinkChecks);
  if (checks.length > sample.length)
    notes.push(
      `Verified ${sample.length} of ${checks.length} declared same-site links; the rest were not requested.`,
    );
  await inBatches(sample, LIMITS.resourceConcurrency, async (check) => {
    if (signal.aborted || policy(new URL(check.url)).status !== "allowed")
      return;
    try {
      const response = await safeFetch(new URL(check.url), {
        signal,
        budget: options.budget,
        entryHost: root.hostname,
        requestMs: LIMITS.resourceMs,
        discardBody: true,
      });
      if (response.status === 404 || response.status === 410) {
        const obs = results.get(check.owner)!;
        if (obs.state === "valid") obs.state = "inconsistent";
        obs.issues.push({
          code: check.code,
          detail: `${new URL(check.url).pathname} returned HTTP ${response.status}.`,
        });
      }
    } catch {
      // An unreachable link is unknown, not broken; nothing is concluded.
    }
  });
  for (const obs of results.values())
    if (
      obs.state === "inconsistent" &&
      obs.issues.length &&
      !/Declared link/.test(obs.summary)
    ) {
      const broken = obs.issues.filter((i) =>
        /returned HTTP/.test(i.detail),
      ).length;
      if (broken)
        obs.summary += ` Declared link check: ${broken} link(s) did not resolve.`;
    }

  if (signal.aborted && !options.signal.aborted)
    notes.push(
      "The machine-readable resource phase reached its time limit; unfinished files are marked unknown.",
    );
  notes.push(
    "Machine-readable files were fetched with GET only. Declared tools, APIs, and actions were not invoked.",
  );
  // Probes finish in any order; keep evidence in contract order so reports are stable.
  const order = (id: string) =>
    RESOURCE_KINDS.findIndex(
      (r) => `resource-${r.kind.replace(/_/g, "-")}` === id,
    );
  evidence.sort((a, b) => order(a.id) - order(b.id));
  return {
    observations: RESOURCE_KINDS.map((r) =>
      results.get(r.kind as ResourceKind),
    ).filter((o): o is ResourceObservation => !!o),
    evidence,
    notes,
  };
}
