import { test, expect, vi, beforeEach } from "vitest";
vi.mock("../../src/server/crawl/transport", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/server/crawl/transport")
  >()),
  safeFetch: vi.fn(),
}));
vi.mock("../../src/server/crawl/robots", () => ({
  checkRobots: vi.fn(async () => ({ status: "allowed", reason: "Allowed" })),
}));
import { safeFetch } from "../../src/server/crawl/transport";
import { checkRobots } from "../../src/server/crawl/robots";
import { crawlSite } from "../../src/server/crawl/crawl";
beforeEach(() => {
  vi.clearAllMocks();
});
test("samples five pages at depth one with at most two concurrent fetches", async () => {
  let active = 0,
    max = 0;
  vi.mocked(safeFetch).mockImplementation(async (url) => {
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return {
      finalUrl: url.href,
      status: 200,
      headers: { "content-type": "text/html" },
      body:
        "<main>Business content</main>" +
        Array.from(
          { length: 8 },
          (_, i) => `<a href="/page${i}">Page</a>`,
        ).join(""),
      redirects: [],
    };
  });
  const result = await crawlSite(
    { url: "https://example.com" },
    { signal: new AbortController().signal, onPage: () => {} },
  );
  expect(result.pages).toHaveLength(5);
  expect(result.coverage.retrieved).toBe(5);
  expect(max).toBeLessThanOrEqual(2);
});
test("disallowed pages are skipped without HTML fetch", async () => {
  vi.mocked(checkRobots).mockResolvedValueOnce({
    status: "disallowed",
    reason: "Policy blocks this path",
  });
  const r = await crawlSite(
    { url: "https://example.com" },
    { signal: new AbortController().signal, onPage: () => {} },
  );
  expect(r.coverage.retrieved).toBe(0);
  expect(r.pages[0].error).toContain("blocks");
  expect(safeFetch).not.toHaveBeenCalled();
});
test("login and challenge pages are not evidence", async () => {
  vi.mocked(safeFetch).mockResolvedValue({
    finalUrl: "https://example.com",
    status: 200,
    headers: { "content-type": "text/html" },
    body: "<title>Verify you are human</title><p>Challenge</p>",
    redirects: [],
  });
  const r = await crawlSite(
    { url: "https://example.com" },
    { signal: new AbortController().signal, onPage: () => {} },
  );
  expect(r.evidence).toEqual([]);
  expect(r.pages[0].error).toContain("verification");
});

test("retains metadata and footer contact observations in cited evidence", async () => {
  vi.mocked(safeFetch).mockResolvedValue({
    finalUrl: "https://example.com",
    status: 200,
    headers: { "content-type": "text/html" },
    body: '<title>Example business</title><main>Welcome</main><footer><a href="mailto:hello@example.com">Contact</a></footer>',
    redirects: [],
  });
  const r = await crawlSite(
    { url: "https://example.com" },
    { signal: new AbortController().signal, onPage: () => {} },
  );
  expect(r.evidence[0].excerpt).toContain("Example business");
  expect(r.evidence[0].excerpt).toContain("mailto:hello@example.com");
  expect(r.evidence[0].excerpt.length).toBeLessThanOrEqual(12000);
});

test("enforces exact per-page and total evidence character limits", async () => {
  vi.mocked(safeFetch).mockImplementation(async (url) => ({
    finalUrl: url.href,
    status: 200,
    headers: { "content-type": "text/html" },
    body:
      "<title>Business</title><main>" +
      "x".repeat(15000) +
      "</main>" +
      Array.from({ length: 4 }, (_, i) => `<a href="/p${i}">Page</a>`).join(""),
    redirects: [],
  }));
  const result = await crawlSite(
    { url: "https://example.com" },
    { signal: new AbortController().signal, onPage: () => {} },
  );
  expect(result.evidence.every((e) => e.excerpt.length <= 12000)).toBe(true);
  expect(
    result.evidence.reduce((n, e) => n + e.excerpt.length, 0),
  ).toBeLessThanOrEqual(40000);
  expect(result.coverage.truncated).toBe(true);
});
test("page mode reads only the input page, including a deep path", async () => {
  vi.mocked(safeFetch).mockImplementation(async (url) => ({
    finalUrl: url.href,
    status: 200,
    headers: { "content-type": "text/html" },
    body: '<main>Studio AD Nail &amp; Lash</main><a href="/circle/en">Circle</a><a href="/book">Book</a>',
    redirects: [],
  }));
  const entry =
    "https://infoholder.io/circle/en/m/studio-ad-nail-lash-4wd5tyh3";
  const r = await crawlSite(
    { url: entry, mode: "page" },
    { signal: new AbortController().signal, onPage: () => {} },
  );
  expect(r.pages.map((p) => [p.url, p.role, p.read])).toEqual([
    [entry, "entry", "content"],
  ]);
  expect(safeFetch).toHaveBeenCalledTimes(1);
  expect(r.coverage.notes.join(" ")).toContain("Only the input page");
});
test("site mode covers different purposes before language versions of the same page", async () => {
  const locales = ["en", "zh-HK", "jp", "ms", "zh"];
  const nav = ["", "/pricing", "/solutions"]
    .flatMap((path) =>
      locales.map((l) => `<a href="/app-studio/${l}${path}">${l}${path}</a>`),
    )
    .join("");
  vi.mocked(safeFetch).mockImplementation(async (url) => ({
    finalUrl: url.href,
    status: 200,
    headers: { "content-type": "text/html" },
    body: `<html><head><link rel="alternate" hreflang="ja" href="/app-studio/jp"></head><body><main>Content for ${url.pathname}</main>${nav}</body></html>`,
    redirects: [],
  }));
  const r = await crawlSite(
    { url: "https://infoholder.io/app-studio/en", mode: "site" },
    { signal: new AbortController().signal, onPage: () => {} },
  );
  const urls = r.pages.map((p) => new URL(p.url).pathname);
  expect(urls).toContain("/app-studio/en/pricing");
  expect(urls).toContain("/app-studio/en/solutions");
  expect(
    r.pages.filter((p) => p.purpose === "language_variant").length,
  ).toBeLessThanOrEqual(1);
  expect(
    r.coverage.notSampled?.some((s) => s.reason === "language_variant"),
  ).toBe(true);
});
test("robots-disallowed pages are recorded as skipped, not as failures", async () => {
  vi.mocked(checkRobots).mockResolvedValueOnce({
    status: "disallowed",
    reason: "Robots policy disallows SiteLens.",
  });
  const r = await crawlSite(
    { url: "https://draft.example.com" },
    { signal: new AbortController().signal, onPage: () => {} },
  );
  expect(r.pages[0]).toMatchObject({
    read: "skipped",
    skipReason: "robots",
    role: "entry",
  });
  vi.mocked(checkRobots).mockResolvedValueOnce({
    status: "unknown",
    reason: "Robots policy is unavailable; this page was skipped.",
  });
  const unknown = await crawlSite(
    { url: "https://flaky.example.com" },
    { signal: new AbortController().signal, onPage: () => {} },
  );
  expect(unknown.pages[0]).toMatchObject({
    read: "skipped",
    skipReason: "robots_unavailable",
  });
});
