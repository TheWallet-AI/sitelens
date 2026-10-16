import type { AuditInput, CrawlResult, PageRecord } from "../../core/schema";
import { LIMITS } from "../../core/limits";
import { safeFetch, DownloadBudget } from "./transport";
import { checkRobots } from "./robots";
import { extractPage } from "./extract";
import { validatePublicUrl } from "./url-policy";
export async function crawlSite(
  input: AuditInput,
  options: { signal: AbortSignal; onPage: (page: PageRecord) => void },
): Promise<CrawlResult> {
  const entry = validatePublicUrl(input.url);
  const budget = new DownloadBudget();
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
      p = checkRobots(url, { signal: options.signal, budget });
      policyCache.set(url.href, p);
    }
    return p;
  };
  const assertPolicy = async (url: URL) => {
    const decision = await policy(url);
    if (decision.status !== "allowed") throw new Error(decision.reason);
  };
  let remaining = LIMITS.totalText;
  async function visit(url: URL, isEntry = false) {
    const page: PageRecord = {
      url: url.href,
      finalUrl: url.href,
      status: 0,
      evidenceIds: [],
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
      const contact = parsed.links.find(
        (l) =>
          /^(mailto:|tel:)/.test(l.url) ||
          /contact/i.test(l.url + " " + l.text),
      );
      const action = parsed.links.find((l) =>
        /book|reserv|register|enquir|inquir|order|appointment/i.test(
          l.url + " " + l.text,
        ),
      );
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
      return parsed;
    } catch (error) {
      page.error = error instanceof Error ? error.message : "Page unavailable.";
      return null;
    } finally {
      result.pages.push(page);
      options.onPage(page);
    }
  }
  const home = await visit(entry, true);
  if (home && !options.signal.aborted) {
    const origin = new URL(result.finalUrl).origin;
    const seen = new Set([entry.href, result.finalUrl]);
    const priority = (text: string) =>
      /about|service|contact|faq/i.test(text) ? 0 : 1;
    const targets = home.links
      .filter((link) => {
        try {
          const u = validatePublicUrl(link.url);
          if (u.origin !== origin || seen.has(u.href) || u.search) return false;
          seen.add(u.href);
          return true;
        } catch {
          return false;
        }
      })
      .sort(
        (a, b) =>
          priority(a.url + " " + a.text) - priority(b.url + " " + b.text),
      )
      .slice(0, LIMITS.pages - 1);
    for (
      let i = 0;
      i < targets.length && !options.signal.aborted;
      i += LIMITS.fetchConcurrency
    )
      await Promise.all(
        targets
          .slice(i, i + LIMITS.fetchConcurrency)
          .map((link) => visit(new URL(link.url))),
      );
  }
  result.coverage.notes.push(
    "Only sampled public HTML pages were checked. No JavaScript, forms, or transactions were executed.",
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
