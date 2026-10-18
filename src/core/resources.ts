import robotsParser from "robots-parser";
import {
  resourceSpec,
  type FindingCode,
  type ResourceKind,
  type ResourceState,
} from "./contract";
import { sensitiveFindings } from "./sensitive";

/**
 * Deterministic validators for machine-readable resources. Everything here
 * is a pure function over bytes that were already fetched: no network, no
 * AI. The crawler decides what to fetch; these decide what it means.
 */

export type ResourceIssue = { code: FindingCode; detail: string };

export type DeclaredAction = { type: string; url: string; reach: string };

export type ResourceDeclarations = {
  /** Absolute http(s) URLs the resource points to. */
  links: string[];
  actions?: DeclaredAction[];
  /** Tool names a server card claims. Self-declared, never verified. */
  tools?: string[];
  /** MCP or API endpoints the resource advertises. */
  endpoints?: string[];
  /** Sitemap URLs listed in robots.txt. */
  sitemaps?: string[];
  /** AI crawler user agents disallowed at the site root. */
  blockedAgents?: string[];
  /** Number of URLs (sitemap) or operations (OpenAPI). */
  count?: number;
};

export type ResourceObservation = {
  kind: ResourceKind;
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  contentType: string | null;
  bytes: number;
  state: ResourceState;
  /** One short English sentence describing the observation. */
  summary: string;
  issues: ResourceIssue[];
  declared: ResourceDeclarations;
  evidenceId: string | null;
};

export type FetchedResource = {
  status: number;
  contentType: string;
  body: string;
  finalUrl: string;
};

export type Verdict = Pick<
  ResourceObservation,
  "state" | "summary" | "issues" | "declared"
>;

/** AI-related crawlers whose robots.txt treatment is worth reporting. */
export const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
] as const;

const MAX_LINKS = 200;
const MAX_WALK = 2000;

const looksLikeHtml = (body: string) =>
  /^\s*(?:<!doctype html|<html|<head|<body)/i.test(body.slice(0, 512));

const sameSite = (a: string, b: string) => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return (
      x.protocol.replace("http:", "https:") ===
        y.protocol.replace("http:", "https:") &&
      x.hostname.replace(/^www\./, "") === y.hostname.replace(/^www\./, "")
    );
  } catch {
    return false;
  }
};

/** Resolve a reference; keep http(s) only. Returns null for anything else. */
function absolute(ref: unknown, base: string): string | null {
  if (typeof ref !== "string" || !ref.trim() || ref.length > 2048) return null;
  try {
    const url = new URL(ref.trim(), base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

const unsafeScheme = (ref: unknown) =>
  typeof ref === "string" &&
  /^\s*(?:javascript|data|vbscript|file):/i.test(ref);

const verdict = (
  state: ResourceState,
  summary: string,
  issues: ResourceIssue[] = [],
  declared: ResourceDeclarations = { links: [] },
): Verdict => ({ state, summary, issues, declared });

/**
 * HTTP-level classification shared by every kind. Returns null when the
 * response is a candidate for content validation.
 */
export function classifyHttp(
  kind: ResourceKind,
  fetched: FetchedResource,
): Verdict | null {
  const { status } = fetched;
  if (status === 404 || status === 410)
    return verdict("not_found", `Not published (HTTP ${status}).`);
  if (status === 401 || status === 403)
    return verdict(
      "blocked",
      `The server refused access (HTTP ${status}); the content was not inspected.`,
    );
  if (status === 429 || status >= 500 || status < 200)
    return verdict(
      "unknown",
      `The server did not return the file (HTTP ${status}); try again later.`,
    );
  if (status >= 300)
    return verdict(
      "unknown",
      `Unexpected HTTP ${status}; content not inspected.`,
    );
  const spec = resourceSpec(kind);
  const html = /text\/html|application\/xhtml/i.test(fetched.contentType);
  if (spec && spec.format !== "xml" && (looksLikeHtml(fetched.body) || html))
    // A 200 HTML page at a machine-readable path is almost always the site's
    // fallback page (a "soft 404"). Treat it as absent, not as malformed, so
    // single-page apps are not penalized for every optional convention.
    return verdict(
      "not_found",
      "An HTML page was returned instead of the file (likely a fallback page), so it was treated as absent.",
    );
  if (!fetched.body.trim()) return verdict("malformed", "The file is empty.");
  return null;
}

function withSensitiveCheck(
  kind: ResourceKind,
  body: string,
  result: Verdict,
): Verdict {
  const found = sensitiveFindings(body);
  if (!found.length) return result;
  return {
    ...result,
    state: "unsafe",
    summary: `The file appears to expose sensitive data (${found.join(", ")}). Remove it and rotate any affected credentials.`,
    issues: [
      ...result.issues,
      {
        code: "machine_resource_unsafe",
        detail: `${kind} contains patterns resembling: ${found.join(", ")}.`,
      },
    ],
  };
}

const MARKDOWN_LINK =
  /\[([^\]\n]{0,300})\]\(\s*([^)\s]{1,2048})(?:\s+"[^"]*")?\s*\)/g;

export function validateLlmsTxt(
  kind: "llms_txt" | "llms_full_txt",
  fetched: FetchedResource,
): Verdict {
  const lines = fetched.body.split(/\r?\n/);
  const first = lines.find((l) => l.trim());
  const links: string[] = [];
  let unsafe = 0;
  for (const match of fetched.body.matchAll(MARKDOWN_LINK)) {
    if (unsafeScheme(match[2])) unsafe++;
    const url = absolute(match[2], fetched.finalUrl);
    if (url && links.length < MAX_LINKS && !links.includes(url))
      links.push(url);
  }
  const code: FindingCode =
    kind === "llms_txt" ? "llms_txt_malformed" : "llms_full_txt_malformed";
  const issues: ResourceIssue[] = [];
  if (!first || !/^#\s+\S/.test(first.trim()))
    issues.push({
      code,
      detail: 'The first line is not a Markdown H1 title ("# Name").',
    });
  if (unsafe)
    issues.push({
      code: "machine_resource_unsafe",
      detail: `${unsafe} link(s) use a script or data URL scheme.`,
    });
  const sections = lines.filter((l) => /^##\s+\S/.test(l)).length;
  const result = issues.length
    ? verdict(
        unsafe ? "unsafe" : "malformed",
        issues.map((i) => i.detail).join(" "),
        issues,
        { links },
      )
    : verdict(
        "valid",
        `Readable Markdown index with ${sections} section(s) and ${links.length} link(s).`,
        [],
        { links },
      );
  return withSensitiveCheck(kind, fetched.body, result);
}

export function validateAiTxt(fetched: FetchedResource): Verdict {
  const links: string[] = [];
  for (const match of fetched.body.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const url = absolute(match[0], fetched.finalUrl);
    if (url && links.length < MAX_LINKS && !links.includes(url))
      links.push(url);
  }
  return withSensitiveCheck(
    "ai_txt",
    fetched.body,
    verdict(
      "valid",
      `Plain-text notes for AI systems (${links.length} link(s)). ai.txt is a convention without a single standard; it does not override robots.txt or authorization.`,
      [],
      { links },
    ),
  );
}

function parseJson(body: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Collect every http(s) URL string in a JSON value (bounded walk). */
function urlsIn(value: unknown, base: string): string[] {
  const out: string[] = [];
  const queue: unknown[] = [value];
  for (let seen = 0; queue.length && seen < MAX_WALK; seen++) {
    const next = queue.shift();
    if (typeof next === "string") {
      if (/^https?:\/\//i.test(next)) {
        const url = absolute(next, base);
        if (url && out.length < MAX_LINKS && !out.includes(url)) out.push(url);
      }
    } else if (Array.isArray(next)) queue.push(...next.slice(0, 200));
    else if (isRecord(next)) queue.push(...Object.values(next).slice(0, 200));
  }
  return out;
}

function hasUnsafeUrl(value: unknown): boolean {
  const queue: unknown[] = [value];
  for (let seen = 0; queue.length && seen < MAX_WALK; seen++) {
    const next = queue.shift();
    if (unsafeScheme(next)) return true;
    if (Array.isArray(next)) queue.push(...next.slice(0, 200));
    else if (isRecord(next)) queue.push(...Object.values(next).slice(0, 200));
  }
  return false;
}

export const INFOHOLDER_AI_JSON = "infoholder-ai-json/1";
const ACTION_TYPES = new Set([
  "order",
  "reservation",
  "vip_reservation",
  "purchase",
  "event_booking",
  "membership",
  "contact",
  "visit",
]);
const REACH = new Set(["ai_readable", "ai_executable"]);

export function validateAiJson(
  fetched: FetchedResource,
  origin: string,
): Verdict {
  const parsed = parseJson(fetched.body);
  if (!parsed.ok || !isRecord(parsed.value))
    return verdict("malformed", "The file is not a valid JSON object.", [
      {
        code: "ai_json_malformed",
        detail: "JSON could not be parsed as an object.",
      },
    ]);
  const doc = parsed.value;
  const links = urlsIn(doc, fetched.finalUrl);
  const issues: ResourceIssue[] = [];
  if (hasUnsafeUrl(doc))
    issues.push({
      code: "machine_resource_unsafe",
      detail: "A value uses a script or data URL scheme.",
    });
  const declared: ResourceDeclarations = { links };
  if (doc.spec === INFOHOLDER_AI_JSON) {
    if (typeof doc.name !== "string" || !doc.name.trim())
      issues.push({ code: "ai_json_malformed", detail: '"name" is missing.' });
    const site = absolute(doc.url, fetched.finalUrl);
    if (!site)
      issues.push({
        code: "ai_json_malformed",
        detail: '"url" is not an absolute http(s) URL.',
      });
    else if (!sameSite(site, origin))
      issues.push({
        code: "machine_resource_wrong_origin",
        detail: `"url" names ${new URL(site).origin}, not the audited site.`,
      });
    if (!Array.isArray(doc.resources))
      issues.push({
        code: "ai_json_malformed",
        detail: '"resources" is not a list.',
      });
    const capabilities = Array.isArray(doc.capabilities)
      ? doc.capabilities
      : [];
    const actions: DeclaredAction[] = [];
    for (const c of capabilities.slice(0, 50)) {
      if (
        !isRecord(c) ||
        !ACTION_TYPES.has(String(c.type)) ||
        !REACH.has(String(c.reach)) ||
        !absolute(c.url, fetched.finalUrl)
      ) {
        issues.push({
          code: "ai_json_malformed",
          detail: "A capability entry has an unknown type, reach, or URL.",
        });
        break;
      }
      actions.push({
        type: String(c.type),
        url: absolute(c.url, fetched.finalUrl)!,
        reach: String(c.reach),
      });
    }
    declared.actions = actions;
    if (isRecord(doc.agent)) {
      const endpoint = absolute(doc.agent.url, fetched.finalUrl);
      if (!endpoint)
        issues.push({
          code: "ai_json_malformed",
          detail: '"agent.url" is not an absolute URL.',
        });
      else declared.endpoints = [endpoint];
      if (Array.isArray(doc.agent.tools))
        declared.tools = doc.agent.tools
          .filter((t): t is string => typeof t === "string")
          .slice(0, 50);
    }
  }
  const unsafe = issues.some((i) => i.code === "machine_resource_unsafe");
  const malformed = issues.some((i) => i.code === "ai_json_malformed");
  const result = issues.length
    ? verdict(
        unsafe ? "unsafe" : malformed ? "malformed" : "inconsistent",
        issues.map((i) => i.detail).join(" "),
        issues,
        declared,
      )
    : verdict(
        "valid",
        doc.spec === INFOHOLDER_AI_JSON
          ? `Structured site profile (${INFOHOLDER_AI_JSON}) with ${declared.actions?.length ?? 0} declared action(s).`
          : `Parseable JSON object with ${links.length} link(s); no known profile was declared, so only structure was checked.`,
        [],
        declared,
      );
  return withSensitiveCheck("ai_json", fetched.body, result);
}

/** The Infoholder Business Action Manifest, version 1. */
export function validateBusinessActions(
  fetched: FetchedResource,
  origin: string,
): Verdict {
  const parsed = parseJson(fetched.body);
  const malformed = (detail: string) =>
    verdict("malformed", detail, [
      { code: "business_actions_malformed", detail },
    ]);
  if (!parsed.ok || !isRecord(parsed.value))
    return malformed("The manifest is not a valid JSON object.");
  const doc = parsed.value;
  if (doc.version !== 1)
    return malformed("Unsupported manifest version (expected 1).");
  if (
    !isRecord(doc.business) ||
    typeof doc.business.name !== "string" ||
    !doc.business.name.trim()
  )
    return malformed('"business.name" is missing.');
  const businessUrl = absolute(doc.business.url, fetched.finalUrl);
  if (!businessUrl)
    return malformed('"business.url" is not an absolute http(s) URL.');
  if (!Array.isArray(doc.actions)) return malformed('"actions" is not a list.');
  const actions: DeclaredAction[] = [];
  const issues: ResourceIssue[] = [];
  for (const action of doc.actions.slice(0, 50)) {
    if (
      !isRecord(action) ||
      !ACTION_TYPES.has(String(action.type)) ||
      !REACH.has(String(action.reach))
    )
      return malformed("An action has an unknown type or reach.");
    if (unsafeScheme(action.url))
      return {
        ...verdict("unsafe", "An action URL uses a script or data scheme.", [
          {
            code: "machine_resource_unsafe",
            detail: "An action URL uses a script or data scheme.",
          },
        ]),
      };
    const url = absolute(action.url, fetched.finalUrl);
    if (!url) return malformed("An action URL is not an absolute http(s) URL.");
    actions.push({
      type: String(action.type),
      url,
      reach: String(action.reach),
    });
  }
  if (!sameSite(businessUrl, origin))
    issues.push({
      code: "machine_resource_wrong_origin",
      detail: `"business.url" names ${new URL(businessUrl).origin}, not the audited site.`,
    });
  const elsewhere = actions.filter((a) => !sameSite(a.url, origin)).length;
  if (elsewhere)
    issues.push({
      code: "business_actions_inconsistent",
      detail: `${elsewhere} action(s) start on another website.`,
    });
  const executable = actions.filter((a) => a.reach === "ai_executable").length;
  const declared: ResourceDeclarations = {
    links: actions.map((a) => a.url),
    actions,
  };
  const result = issues.length
    ? verdict(
        "inconsistent",
        issues.map((i) => i.detail).join(" "),
        issues,
        declared,
      )
    : verdict(
        "valid",
        `Declares ${actions.length} customer action(s)${executable ? `, ${executable} claimed as agent-executable (self-declared, not verified)` : ""}.`,
        [],
        declared,
      );
  return withSensitiveCheck("business_actions", fetched.body, result);
}

/** Endpoint-looking URLs in common MCP discovery shapes. */
function mcpEndpoints(doc: Record<string, unknown>, base: string): string[] {
  const out: string[] = [];
  // Only fully written http(s) URLs count. Resolving "streamable-http" (the
  // transport type) as a relative reference produced a fake endpoint that
  // then returned 404, so a correct declaration was reported unreachable.
  const push = (v: unknown) => {
    const url =
      typeof v === "string" && /^https?:\/\//i.test(v.trim())
        ? absolute(v, base)
        : null;
    if (url && !out.includes(url)) out.push(url);
  };
  push(doc.url);
  push(doc.endpoint);
  for (const key of ["transport", "endpoints"]) {
    const value = doc[key];
    if (isRecord(value))
      for (const v of Object.values(value)) push(isRecord(v) ? v.url : v);
  }
  for (const key of ["remotes", "servers"]) {
    const value = doc[key];
    if (Array.isArray(value))
      for (const v of value.slice(0, 20))
        if (isRecord(v)) push(v.url ?? v.endpoint);
  }
  return out.slice(0, 10);
}

export function validateMcpDeclaration(
  kind: "mcp_discovery" | "mcp_server_card",
  fetched: FetchedResource,
): Verdict {
  const parsed = parseJson(fetched.body);
  if (!parsed.ok || !isRecord(parsed.value))
    return verdict("malformed", "The declaration is not a valid JSON object.", [
      {
        code: "mcp_declaration_malformed",
        detail: "JSON could not be parsed as an object.",
      },
    ]);
  const doc = parsed.value;
  const endpoints = mcpEndpoints(doc, fetched.finalUrl);
  const tools = Array.isArray(doc.tools)
    ? doc.tools
        .map((t) =>
          typeof t === "string"
            ? t
            : isRecord(t) && typeof t.name === "string"
              ? t.name
              : null,
        )
        .filter((t): t is string => !!t)
        .slice(0, 50)
    : undefined;
  const declared: ResourceDeclarations = {
    links: endpoints,
    endpoints,
    ...(tools ? { tools } : {}),
  };
  const issues: ResourceIssue[] = [];
  if (!endpoints.length)
    issues.push({
      code: "mcp_declaration_malformed",
      detail: "No MCP endpoint URL was found in the declaration.",
    });
  if (endpoints.some((e) => e.startsWith("http:")))
    issues.push({
      code: "mcp_declaration_malformed",
      detail: "An MCP endpoint is not served over HTTPS.",
    });
  if (hasUnsafeUrl(doc))
    issues.push({
      code: "machine_resource_unsafe",
      detail: "A value uses a script or data URL scheme.",
    });
  const result = issues.length
    ? verdict(
        issues.some((i) => i.code === "machine_resource_unsafe")
          ? "unsafe"
          : "malformed",
        issues.map((i) => i.detail).join(" "),
        issues,
        declared,
      )
    : verdict(
        "valid",
        `Declares ${endpoints.length} MCP endpoint(s)${tools ? ` and ${tools.length} tool(s)` : ""}. Declared tools are self-reported; SiteLens does not call them.`,
        [
          {
            code: "mcp_declared_unverified",
            detail: "Tool availability and authorization were not tested.",
          },
        ],
        declared,
      );
  return withSensitiveCheck(kind, fetched.body, result);
}

export function validateApiCatalog(fetched: FetchedResource): Verdict {
  const parsed = parseJson(fetched.body);
  const malformed = (detail: string) =>
    verdict("malformed", detail, [{ code: "api_catalog_malformed", detail }]);
  if (!parsed.ok || !isRecord(parsed.value))
    return malformed("The API catalog is not a valid JSON object.");
  const linkset = parsed.value.linkset;
  if (!Array.isArray(linkset) || !linkset.length)
    return malformed(
      'RFC 9727 requires a Linkset document with a non-empty "linkset" array.',
    );
  const links: string[] = [];
  for (const context of linkset.slice(0, 50)) {
    if (!isRecord(context) || !absolute(context.anchor, fetched.finalUrl))
      return malformed('Each Linkset context needs an absolute "anchor" URL.');
    for (const [relation, targets] of Object.entries(context)) {
      if (relation === "anchor") continue;
      if (
        !Array.isArray(targets) ||
        targets.some((t) => !isRecord(t) || typeof t.href !== "string")
      )
        return malformed(
          `Relation "${relation.slice(0, 40)}" must be an array of link objects with "href".`,
        );
      for (const t of targets.slice(0, 20)) {
        const url = absolute(
          (t as Record<string, unknown>).href,
          fetched.finalUrl,
        );
        if (url && !links.includes(url)) links.push(url);
      }
    }
  }
  const typed = /application\/linkset\+json/i.test(fetched.contentType);
  return withSensitiveCheck(
    "api_catalog",
    fetched.body,
    verdict(
      typed ? "valid" : "inconsistent",
      typed
        ? `Valid Linkset with ${linkset.length} API context(s).`
        : "The Linkset parses, but it is not served as application/linkset+json.",
      typed
        ? []
        : [
            {
              code: "api_catalog_malformed",
              detail: "Wrong content type for an RFC 9727 API catalog.",
            },
          ],
      { links },
    ),
  );
}

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];

export function validateOpenApi(fetched: FetchedResource): Verdict {
  const parsed = parseJson(fetched.body);
  const malformed = (detail: string) =>
    verdict("malformed", detail, [{ code: "openapi_malformed", detail }]);
  if (!parsed.ok || !isRecord(parsed.value))
    return malformed("The OpenAPI document is not valid JSON.");
  const doc = parsed.value;
  if (typeof doc.openapi !== "string" || !/^3\.\d+\.\d+$/.test(doc.openapi))
    return malformed('"openapi" must name a 3.x.y version.');
  if (
    !isRecord(doc.info) ||
    typeof doc.info.title !== "string" ||
    typeof doc.info.version !== "string"
  )
    return malformed('"info.title" and "info.version" are required.');
  if (doc.paths !== undefined && !isRecord(doc.paths))
    return malformed('"paths" must be an object.');
  let operations = 0;
  if (isRecord(doc.paths))
    for (const item of Object.values(doc.paths).slice(0, 500))
      if (isRecord(item))
        operations += HTTP_METHODS.filter((m) => isRecord(item[m])).length;
  const servers = Array.isArray(doc.servers)
    ? doc.servers
        .map((s) => (isRecord(s) ? absolute(s.url, fetched.finalUrl) : null))
        .filter((s): s is string => !!s)
    : [];
  return withSensitiveCheck(
    "openapi",
    fetched.body,
    verdict(
      "valid",
      `OpenAPI ${doc.openapi} document describing ${operations} operation(s). Structure only; endpoints were not called.`,
      [],
      { links: servers, endpoints: servers, count: operations },
    ),
  );
}

export function validateSitemap(
  fetched: FetchedResource,
  origin: string,
): Verdict {
  const head = fetched.body.slice(0, 4096);
  if (looksLikeHtml(fetched.body) || /text\/html/i.test(fetched.contentType))
    return verdict(
      "malformed",
      "An HTML page was returned instead of a sitemap.",
      [{ code: "sitemap_malformed", detail: "HTML instead of XML." }],
    );
  if (!/<(?:[a-z0-9]+:)?(?:urlset|sitemapindex)[\s>]/i.test(head))
    return verdict(
      "malformed",
      "No <urlset> or <sitemapindex> root element was found.",
      [{ code: "sitemap_malformed", detail: "Missing sitemap root element." }],
    );
  const locs = [
    ...fetched.body.matchAll(
      /<(?:[a-z0-9]+:)?loc>\s*([^<\s]{1,2048})\s*<\/(?:[a-z0-9]+:)?loc>/gi,
    ),
  ]
    .slice(0, 50000)
    .map((m) => m[1].replace(/&amp;/g, "&"));
  // The sitemap protocol requires absolute URLs; relative entries are invalid.
  const valid = locs.filter((l) => /^https?:\/\//i.test(l) && absolute(l, l));
  const foreign = valid.filter((l) => !sameSite(l, origin)).length;
  const issues: ResourceIssue[] = [];
  if (!locs.length)
    issues.push({
      code: "sitemap_malformed",
      detail: "The sitemap lists no URLs.",
    });
  else if (valid.length < locs.length)
    issues.push({
      code: "sitemap_malformed",
      detail: `${locs.length - valid.length} entry(ies) are not absolute http(s) URLs.`,
    });
  if (foreign)
    issues.push({
      code: "machine_resource_wrong_origin",
      detail: `${foreign} URL(s) point to another website.`,
    });
  if (/(?:localhost|127\.0\.0\.1)/i.test(fetched.body))
    issues.push({
      code: "machine_resource_wrong_origin",
      detail: "The sitemap lists localhost URLs.",
    });
  return issues.length
    ? verdict(
        issues.some((i) => i.code === "sitemap_malformed")
          ? "malformed"
          : "inconsistent",
        issues.map((i) => i.detail).join(" "),
        issues,
        { links: [], count: locs.length },
      )
    : verdict("valid", `Valid sitemap listing ${locs.length} URL(s).`, [], {
        links: [],
        count: locs.length,
      });
}

export function validateRobots(fetched: FetchedResource): Verdict {
  const robotsUrl = new URL("/robots.txt", fetched.finalUrl).href;
  const parser = robotsParser(robotsUrl, fetched.body);
  const root = new URL("/", fetched.finalUrl).href;
  const blockedAgents = AI_AGENTS.filter(
    (agent) => parser.isAllowed(root, agent) === false,
  );
  const sitemaps = parser
    .getSitemaps()
    .map((s) => absolute(s, fetched.finalUrl))
    .filter((s): s is string => !!s)
    .slice(0, 5);
  const issues: ResourceIssue[] = blockedAgents.length
    ? [
        {
          code: "robots_blocks_ai_agents",
          detail: `robots.txt disallows ${blockedAgents.join(", ")} at the site root. This may be intentional.`,
        },
      ]
    : [];
  return verdict(
    "valid",
    blockedAgents.length
      ? `Crawl rules found; ${blockedAgents.length} AI crawler(s) are disallowed at the root.`
      : "Crawl rules found; no tracked AI crawler is disallowed at the root.",
    issues,
    { links: sitemaps, sitemaps, blockedAgents },
  );
}

/** Validate a fetched resource of any kind. */
export function validateResource(
  kind: ResourceKind,
  fetched: FetchedResource,
  origin: string,
): Verdict {
  if (kind === "robots_txt") {
    if (fetched.status === 404 || fetched.status === 410)
      return verdict(
        "not_found",
        "No robots.txt was published; crawlers treat this as permission to crawl everything.",
      );
  }
  if (
    kind === "sitemap_xml" &&
    (fetched.status === 404 || fetched.status === 410)
  )
    return verdict(
      "not_found",
      "No sitemap was found at the location checked.",
      [{ code: "sitemap_missing", detail: "No sitemap was found." }],
    );
  const http = classifyHttp(kind, fetched);
  if (http) {
    if (kind === "llms_txt" && http.state === "not_found")
      return {
        ...http,
        issues: [
          { code: "llms_txt_missing", detail: "No llms.txt was found." },
        ],
      };
    return http;
  }
  switch (kind) {
    case "robots_txt":
      return validateRobots(fetched);
    case "sitemap_xml":
      return validateSitemap(fetched, origin);
    case "llms_txt":
    case "llms_full_txt":
      return validateLlmsTxt(kind, fetched);
    case "ai_txt":
      return validateAiTxt(fetched);
    case "ai_json":
      return validateAiJson(fetched, origin);
    case "business_actions":
      return validateBusinessActions(fetched, origin);
    case "mcp_discovery":
    case "mcp_server_card":
      return validateMcpDeclaration(kind, fetched);
    case "api_catalog":
      return validateApiCatalog(fetched);
    case "openapi":
      return validateOpenApi(fetched);
  }
}
