import { test, expect, vi, beforeEach } from "vitest";
vi.mock("../../src/server/crawl/transport", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/server/crawl/transport")
  >()),
  safeFetch: vi.fn(),
}));
import { safeFetch, DownloadBudget } from "../../src/server/crawl/transport";
import { probeResources } from "../../src/server/crawl/resources";
import { LIMITS } from "../../src/core/limits";

type Reply = {
  status: number;
  type?: string;
  body?: string;
  headers?: Record<string, string>;
};
let site: Record<string, Reply>;
beforeEach(() => {
  vi.clearAllMocks();
  site = {};
  vi.mocked(safeFetch).mockImplementation(async (url, options) => {
    const reply = site[url.pathname] ?? {
      status: 404,
      type: "text/html",
      body: "<html>404</html>",
    };
    return {
      finalUrl: url.href,
      status: reply.status,
      headers: {
        "content-type": reply.type ?? "text/plain",
        ...(reply.headers ?? {}),
      },
      body: options.discardBody ? "" : (reply.body ?? ""),
      redirects: [],
    };
  });
});
const run = () =>
  probeResources(new URL("https://example.com/"), {
    signal: new AbortController().signal,
    budget: new DownloadBudget(),
    robots: new Map(),
  });
const state = (r: Awaited<ReturnType<typeof run>>, kind: string) =>
  r.observations.find((o) => o.kind === kind)?.state;

test("every request is a GET-only safeFetch on the audited host, within the probe limits", async () => {
  const r = await run();
  expect(r.observations).toHaveLength(LIMITS.resourceProbes);
  for (const [url, options] of vi.mocked(safeFetch).mock.calls) {
    expect(url.hostname).toBe("example.com");
    expect(options).not.toHaveProperty("method");
  }
  expect(vi.mocked(safeFetch).mock.calls.length).toBeLessThanOrEqual(
    LIMITS.resourceProbes + LIMITS.resourceLinkChecks + 1,
  );
  expect(state(r, "robots_txt")).toBe("not_found");
  expect(state(r, "llms_txt")).toBe("not_found");
});

test("robots.txt is fetched once and disallowed resources are not requested", async () => {
  site["/robots.txt"] = {
    status: 200,
    body: "User-agent: SiteLens\nDisallow: /.well-known/\n",
  };
  const r = await run();
  const paths = vi.mocked(safeFetch).mock.calls.map(([u]) => u.pathname);
  expect(paths.filter((p) => p === "/robots.txt")).toHaveLength(1);
  expect(paths.some((p) => p.startsWith("/.well-known/"))).toBe(false);
  expect(state(r, "business_actions")).toBe("blocked");
});

test("unavailable robots policy means no other resource is requested", async () => {
  vi.mocked(safeFetch).mockRejectedValue(new Error("network"));
  const r = await run();
  expect(vi.mocked(safeFetch)).toHaveBeenCalledTimes(1);
  expect(r.observations.every((o) => o.state === "unknown")).toBe(true);
});

test("declared links are verified with status-only requests and broken links are reported", async () => {
  site["/llms.txt"] = {
    status: 200,
    type: "text/markdown",
    body: "# Shop\n\n- [Menu](/menu)\n- [Gone](/gone)\n- [Elsewhere](https://other.example.net/x)\n",
  };
  site["/menu"] = { status: 200, type: "text/html" };
  const r = await run();
  const linkCalls = vi
    .mocked(safeFetch)
    .mock.calls.filter(([u]) => ["/menu", "/gone"].includes(u.pathname));
  expect(linkCalls.every(([, o]) => o.discardBody)).toBe(true);
  expect(
    vi
      .mocked(safeFetch)
      .mock.calls.some(([u]) => u.hostname === "other.example.net"),
  ).toBe(false);
  const llms = r.observations.find((o) => o.kind === "llms_txt")!;
  expect(llms.state).toBe("inconsistent");
  expect(llms.issues.map((i) => i.code)).toContain("llms_txt_broken_links");
  expect(
    r.evidence.find((e) => e.id === "resource-llms-txt")?.excerpt,
  ).toContain("# Shop");
});

test("link checks are bounded", async () => {
  site["/llms.txt"] = {
    status: 200,
    body:
      "# Shop\n" +
      Array.from({ length: 30 }, (_, i) => `- [P${i}](/p${i})`).join("\n"),
  };
  const r = await run();
  const linkCalls = vi
    .mocked(safeFetch)
    .mock.calls.filter(([u]) => /^\/p\d+$/.test(u.pathname));
  expect(linkCalls).toHaveLength(LIMITS.resourceLinkChecks);
  expect(r.notes.join(" ")).toMatch(/Verified 4 of 30/);
});

test("a declared MCP endpoint is only probed for reachability; 401 metadata is reported, no tool is called", async () => {
  site["/.well-known/mcp/server-card.json"] = {
    status: 200,
    type: "application/json",
    body: JSON.stringify({
      name: "x",
      url: "https://example.com/mcp",
      tools: ["a"],
    }),
  };
  site["/mcp"] = {
    status: 401,
    headers: {
      "www-authenticate":
        'Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource"',
    },
  };
  const r = await run();
  const call = vi
    .mocked(safeFetch)
    .mock.calls.find(([u]) => u.pathname === "/mcp")!;
  expect(call[1].discardBody).toBe(true);
  const card = r.observations.find((o) => o.kind === "mcp_server_card")!;
  expect(card.state).toBe("valid");
  expect(card.summary).toMatch(/protected-resource metadata/);
  expect(card.declared.tools).toEqual(["a"]);
});

test("a declared MCP endpoint that 404s makes the declaration inconsistent", async () => {
  site["/.well-known/mcp.json"] = {
    status: 200,
    type: "application/json",
    body: JSON.stringify({ url: "https://example.com/mcp" }),
  };
  const r = await run();
  expect(state(r, "mcp_discovery")).toBe("inconsistent");
});

test("oversized and redirected resources are unknown, not malformed", async () => {
  vi.mocked(safeFetch).mockImplementation(async (url) => {
    if (url.pathname === "/robots.txt")
      return {
        finalUrl: url.href,
        status: 404,
        headers: {},
        body: "",
        redirects: [],
      };
    if (url.pathname === "/llms.txt")
      throw new Error("Page response is too large.");
    if (url.pathname === "/ai.json")
      throw new Error("Entry redirect changes the website host.");
    return {
      finalUrl: url.href,
      status: 404,
      headers: {},
      body: "",
      redirects: [],
    };
  });
  const r = await run();
  expect(state(r, "llms_txt")).toBe("unknown");
  expect(r.observations.find((o) => o.kind === "llms_txt")!.summary).toMatch(
    /inspection limit/,
  );
  expect(r.observations.find((o) => o.kind === "ai_json")!.summary).toMatch(
    /another host/,
  );
});

test("cancellation stops remaining probes", async () => {
  const controller = new AbortController();
  controller.abort();
  const r = await probeResources(new URL("https://example.com/"), {
    signal: controller.signal,
    budget: new DownloadBudget(),
    robots: new Map(),
  });
  expect(
    r.observations
      .filter((o) => o.kind !== "robots_txt")
      .every((o) => o.state === "unknown"),
  ).toBe(true);
});
