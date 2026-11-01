import { test, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
vi.mock("../../src/server/crawl/transport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/crawl/transport")>()),
  safeFetch: vi.fn(),
}));
import { safeFetch } from "../../src/server/crawl/transport";
import { runCli } from "../../src/cli/main";

const dir = join(__dirname, "../fixtures/morrow-coffee");
const ROUTES: Record<string, [string, string]> = {
  "/": ["index.html", "text/html"],
  "/menu": ["menu.html", "text/html"],
  "/reservations": ["reservations.html", "text/html"],
  "/contact": ["contact.html", "text/html"],
  "/robots.txt": ["robots.txt", "text/plain"],
  "/llms.txt": ["llms.txt", "text/markdown"],
  "/ai.json": ["ai.json", "application/json"],
  "/sitemap.xml": ["sitemap.xml", "application/xml"],
  "/.well-known/business-actions.json": ["business-actions.json", "application/json"],
};
let overrides: Record<string, string> = {};
let offline = false;
beforeEach(() => {
  overrides = {};
  offline = false;
  process.env.AI_BASE_URL = "https://ai.example.com";
  process.env.AI_MODEL = "model";
  process.env.AI_API_KEY = "key";
  vi.mocked(safeFetch).mockImplementation(async (url, options) => {
    if (offline) throw new Error("network down");
    const route = ROUTES[url.pathname];
    const body = overrides[url.pathname] ?? (route ? readFileSync(join(dir, route[0]), "utf8") : "<!doctype html><title>404</title>");
    return { finalUrl: url.href, status: route || overrides[url.pathname] ? 200 : 404, headers: { "content-type": route?.[1] ?? "text/html" }, body: options.discardBody ? "" : body, redirects: [] };
  });
});

const run = async (argv: string[]) => {
  let stdout = "";
  let stderr = "";
  const written: Record<string, string> = {};
  const code = await runCli(argv, { stdout: (t) => { stdout += t; }, stderr: (t) => { stderr += t; }, write: async (p, t) => { written[p] = t; } });
  return { code, stdout, stderr, written };
};

test("a healthy site passes (exit 0); AI is off unless --ai; JSON carries the verdict", async () => {
  const out = await run(["audit", "https://morrow-coffee.example.com/", "--format", "json", "--output", "report.json"]);
  expect(out.code).toBe(0);
  const json = JSON.parse(out.stdout);
  expect(json.contract).toBe("agent-readiness/1");
  expect(json.ci.contract).toBe("sitelens-ci/1");
  expect(json.ci.outcome).toBe("pass");
  expect(json.aiAnalysis).toBeNull();
  expect(process.env.AI_API_KEY).toBeUndefined();
  expect(JSON.parse(out.written["report.json"]!).ci.exitCode).toBe(0);
});

test("a noindex page is a warning: listed by default (exit 0), fails with --fail-on warning (exit 1)", async () => {
  overrides["/"] = readFileSync(join(dir, "index.html"), "utf8").replace("<head>", '<head><meta name="robots" content="noindex">');
  const lenient = await run(["audit", "https://morrow-coffee.example.com/"]);
  expect(lenient.code).toBe(0);
  expect(lenient.stdout).toContain("[WARN] robots-meta");
  const strict = await run(["audit", "https://morrow-coffee.example.com/", "--fail-on", "warning"]);
  expect(strict.code).toBe(1);
  expect(strict.stdout).toContain("[FAIL] robots-meta");
});

test("an unreachable site is 'could not tell' (exit 3), not a failure", async () => {
  offline = true;
  const out = await run(["audit", "https://morrow-coffee.example.com/"]);
  expect(out.code).toBe(3);
  expect(out.stdout).toContain("[UNKNOWN]");
});

test("private targets and bad options are usage errors (exit 2) and nothing is fetched", async () => {
  vi.mocked(safeFetch).mockClear();
  expect((await run(["audit", "http://127.0.0.1/"])).code).toBe(2);
  expect((await run(["audit", "https://a.example.com:8443/"])).code).toBe(2);
  expect((await run(["audit", "https://a.example.com/", "--format", "pdf"])).code).toBe(2);
  expect(vi.mocked(safeFetch)).not.toHaveBeenCalled();
});
