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
