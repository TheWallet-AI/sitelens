import type { AuditInput, CrawlResult, PageRecord } from "../../core/schema";
import { LIMITS } from "../../core/limits";
import { safeFetch, DownloadBudget } from "./transport";
import { checkRobots, type RobotsCache } from "./robots";
import { extractPage } from "./extract";
import { validatePublicUrl } from "./url-policy";
import { isContactLink, isNextStepLink } from "../../core/actions";
import { candidateUrl, pickSamplePages, purposeOf } from "../../core/sampling";
export async function crawlSite(
  input: AuditInput,
  options: {
    signal: AbortSignal;
    onPage: (page: PageRecord) => void;
    /** Shared with the resource phase so both draw on one download budget. */
    budget?: DownloadBudget;
    /** Shared robots.txt downloads (one per origin per audit). */
    robots?: RobotsCache;
  },
): Promise<CrawlResult> {
  const entry = validatePublicUrl(input.url);
  const budget = options.budget ?? new DownloadBudget();
  const robots: RobotsCache = options.robots ?? new Map();
  const result: CrawlResult = {
    pages: [],
    evidence: [],
    extracted: [],
    finalUrl: entry.href,
    coverage: { attempted: 0, retrieved: 0, truncated: false, notes: [] },
  };
  const policyCache = new Map<
    string,
    Promise<Awaited<ReturnType<typeof checkRobots>>>
  >();
  // Cache path decisions, not origin-wide allow/deny results.
  const policy = (url: URL) => {
    let p = policyCache.get(url.href);
    if (!p) {
      p = checkRobots(url, { signal: options.signal, budget, cache: robots });
      policyCache.set(url.href, p);
    }
    return p;
  };
  /** Thrown when robots.txt disallows a URL or cannot be read; the page is then recorded as skipped. */
  class RobotsSkip extends Error {
    constructor(
      message: string,
      readonly reason: "robots" | "robots_unavailable",
    ) {
      super(message);
    }
  }
  const assertPolicy = async (url: URL) => {
    const decision = await policy(url);
    if (decision.status !== "allowed")
      throw new RobotsSkip(
        decision.reason,
        decision.status === "disallowed" ? "robots" : "robots_unavailable",
      );
  };
  let remaining = LIMITS.totalText;
  async function visit(
    url: URL,
    isEntry = false,
    purpose: PageRecord["purpose"] = purposeOf(url.href),
  ) {
    const page: PageRecord = {
      url: url.href,
      finalUrl: url.href,
      status: 0,
      evidenceIds: [],
      role: isEntry ? "entry" : "sample",
      purpose,
    };
    result.coverage.attempted++;
    try {
      options.signal.throwIfAborted();
      await assertPolicy(url);
      const response = await safeFetch(url, {
        signal: options.signal,
        budget,
        entryHost: isEntry ? entry.hostname : undefined,
        allowedOrigin: isEntry ? undefined : new URL(result.finalUrl).origin,
        beforeRedirect: assertPolicy,
      });
      page.status = response.status;
      page.finalUrl = response.finalUrl;
      if (isEntry) result.finalUrl = response.finalUrl;
      if (response.status < 200 || response.status >= 300)
        throw new Error(`HTTP ${response.status}; content unavailable.`);
      if (
        !/text\/html|application\/xhtml\+xml/i.test(
          response.headers["content-type"] ?? "",
        )
      )
        throw new Error("Not an HTML page.");
      const parsed = extractPage(response.body, new URL(response.finalUrl));
      if (parsed.blocked)
        throw new Error("Login or verification page; content was skipped.");
      if (!parsed.text)
        throw new Error(
          "No readable text; JavaScript rendering may be required.",
        );
      if (remaining < 6000) {
        result.coverage.truncated = true;
        throw new Error("Evidence character budget exhausted.");
      }
      const contact = parsed.links.find(isContactLink);
      const action = parsed.links.find(isNextStepLink);
      const metadata = JSON.stringify(
        {
          title: parsed.title.slice(0, 500),
          description: parsed.description.slice(0, 500),
          canonical: parsed.canonical.slice(0, 300),
          robots: parsed.robots.slice(0, 300),
          headings: parsed.headings.slice(0, 3).map((h) => h.slice(0, 150)),
          jsonLdBlocks: parsed.jsonLd.length,
          jsonLdErrors: parsed.jsonLdErrors,
          entityFields: parsed.entityFields,
          contactLink: contact
            ? { url: contact.url.slice(0, 500), text: contact.text }
            : null,
          actionLink: action
            ? { url: action.url.slice(0, 500), text: action.text }
            : null,
        },
        (_key, value) =>
          typeof value === "string"
            ? value.replace(/[\u0000-\u001f]/g, " ").slice(0, 100)
            : value,
      );
      const prefix =
        "Observed metadata and links: " + metadata + "\nMain text: ";
      const allowance = Math.min(LIMITS.pageText, remaining) - prefix.length;
      if (parsed.text.length > allowance) {
        parsed.text = parsed.text.slice(0, allowance);
        parsed.truncated = true;
      }
      const excerpt = prefix + parsed.text;
      remaining -= excerpt.length;
      result.coverage.truncated ||= parsed.truncated;
      const id = `page-${result.evidence.length + 1}`;
      page.evidenceIds = [id];
      result.evidence.push({
        id,
        sourceUrl: url.href,
        finalUrl: response.finalUrl,
        retrievedAt: new Date().toISOString(),
        excerpt,
        locationHint:
          "Bounded metadata, recognized links, and extracted main content.",
      });
      result.extracted.push(parsed);
      result.coverage.retrieved++;
      page.read = "content";
      return parsed;
    } catch (error) {
      page.error = error instanceof Error ? error.message : "Page unavailable.";
      if (error instanceof RobotsSkip) {
        page.read = "skipped";
        page.skipReason = error.reason;
      } else if (options.signal.aborted && page.status === 0) {
        page.read = "skipped";
        page.skipReason = "deadline";
      } else page.read = page.status ? "status" : "failed";
      return null;
    } finally {
      result.pages.push(page);
      options.onPage(page);
    }
  }
  const home = await visit(entry, true);
  if (home && !options.signal.aborted && (input.mode ?? "site") === "site") {
    const origin = new URL(result.finalUrl).origin;
    const candidates = home.links.flatMap((link) => {
      try {
        const url = candidateUrl(validatePublicUrl(link.url).href, origin);
        return url ? [{ url, text: link.text }] : [];
      } catch {
        return [];
      }
    });
    const { picks, skipped } = pickSamplePages({
      entry: result.finalUrl,
      exclude: [entry.href, ...(home.canonical ? [home.canonical] : [])],
      alternates: home.alternates,
      candidates,
      budget: LIMITS.pages - 1,
    });
    result.coverage.notSampled = skipped.slice(0, 12);
    for (
      let i = 0;
      i < picks.length && !options.signal.aborted;
      i += LIMITS.fetchConcurrency
    )
      await Promise.all(
        picks
          .slice(i, i + LIMITS.fetchConcurrency)
          .map((pick) => visit(new URL(pick.url), false, pick.purpose)),
      );
  }
  result.coverage.notes.push(
    (input.mode ?? "site") === "page"
      ? "Only the input page was read (plus site-wide files). No JavaScript, forms, or transactions were executed."
      : "Only sampled public HTML pages were checked (one per purpose; other-language versions of the same page are not repeated). No JavaScript, forms, or transactions were executed.",
  );
  result.coverage.notes.push(
    "robots.txt was followed: pages it disallows for SiteLens were not opened.",
  );
  if (result.coverage.truncated)
    result.coverage.notes.push(
      "Text was truncated to configured evidence limits.",
    );
  if (options.signal.aborted)
    result.coverage.notes.push(
      "The audit stopped before all requested work completed.",
    );
  return result;
}
