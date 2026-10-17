import { test, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
vi.mock("../../src/server/crawl/transport", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/server/crawl/transport")
  >()),
  safeFetch: vi.fn(),
}));
import { safeFetch } from "../../src/server/crawl/transport";
import { runAudit } from "../../src/server/audit/run";
import {
  validateReportReferences,
  CheckSchema,
  ResourceObservationSchema,
} from "../../src/core/schema";
import { exportReportMarkdown } from "../../src/core/export";
import { toCurrentReport } from "../../src/core/migrate";

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
  "/.well-known/business-actions.json": [
    "business-actions.json",
    "application/json",
  ],
};
let overrides: Record<string, string> = {};
beforeEach(() => {
  overrides = {};
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  delete process.env.AI_API_KEY;
  vi.mocked(safeFetch).mockImplementation(async (url, options) => {
    const route = ROUTES[url.pathname];
    const body =
      overrides[url.pathname] ??
      (route
        ? readFileSync(join(dir, route[0]), "utf8")
        : "<!doctype html><title>404</title>");
    return {
      finalUrl: url.href,
      status: route || overrides[url.pathname] ? 200 : 404,
      headers: { "content-type": route?.[1] ?? "text/html" },
      body: options.discardBody ? "" : body,
      redirects: [],
    };
  });
});
const audit = () =>
  runAudit(
    { url: "https://morrow-coffee.example.com/" },
    { signal: new AbortController().signal, emit: () => {} },
  );

test("a published demo business produces a self-consistent v2 report", async () => {
  const report = await audit();
  expect(report.schemaVersion).toBe("2");
  expect(report.contract).toBe("agent-readiness/1");
  expect(validateReportReferences(report)).toBe(true);
  for (const c of report.checks)
    expect(CheckSchema.safeParse(c).success).toBe(true);
  for (const r of report.resources)
    expect(ResourceObservationSchema.safeParse(r).success).toBe(true);
  const status = (id: string) => report.checks.find((c) => c.id === id)?.status;
  expect(status("resource-llms-txt")).toBe("pass");
  expect(status("resource-ai-json")).toBe("pass");
  expect(status("resource-business-actions")).toBe("pass");
  expect(status("resource-sitemap-xml")).toBe("pass");
  expect(status("resource-mcp-server-card")).toBe("not_applicable");
  expect(status("next-step")).toBe("pass");
  const actions = report.resources.find((r) => r.kind === "business_actions")!;
  expect(actions.declared.actions?.map((a) => a.type)).toEqual([
    "reservation",
    "contact",
  ]);
  expect(report.readiness.map((d) => d.dimension)).toEqual([
    "find",
    "understand",
    "act",
  ]);
  expect(report.aiAnalysis).toBeNull();
  expect(exportReportMarkdown(report)).toContain(
    "## Machine-readable resources",
  );
});

test("a broken manifest is detected, then a fixed manifest passes", async () => {
  overrides["/.well-known/business-actions.json"] = JSON.stringify({
    version: 1,
    business: { name: "Morrow" },
    actions: [],
  });
  const broken = await audit();
  const before = broken.checks.find(
    (c) => c.id === "resource-business-actions",
  )!;
  expect(before.status).toBe("warning");
  expect(before.findingCodes).toContain("business_actions_malformed");
  overrides = {};
  const fixed = await audit();
  expect(
    fixed.checks.find((c) => c.id === "resource-business-actions")!.status,
  ).toBe("pass");
});

test("v1 exports are readable as v2", () => {
  const v1 = {
    schemaVersion: "1" as const,
    runId: "r",
    startedAt: "",
    completedAt: "",
    inputUrl: "https://example.com",
    finalUrl: "https://example.com",
    coverage: { attempted: 0, retrieved: 0, truncated: false, notes: [] },
    pages: [],
    evidence: [],
    checks: [
      {
        id: "title",
        category: "content" as const,
        status: "pass" as const,
        explanation: "",
        evidenceIds: [],
      },
    ],
    aiAnalysis: null,
    recommendations: [],
    limits: {},
  };
  const current = toCurrentReport(v1);
  expect(current.schemaVersion).toBe("2");
  expect(current.resources).toEqual([]);
  expect(current.checks[0].dimension).toBe("understand");
});

test("the e2e fixture report matches what the auditor produces today", async () => {
  // The Playwright UI test streams this report through a routed /api/audit.
  // Regenerate with WRITE_REPORT_FIXTURE=1 after intentional report changes.
  const { writeFileSync, existsSync } = await import("node:fs");
  overrides["/.well-known/business-actions.json"] = JSON.stringify({
    version: 1,
    business: { name: "Morrow" },
    actions: [],
  });
  const report = await audit();
  const file = join(dir, "..", "morrow-report.json");
  const stable = JSON.parse(
    JSON.stringify(report)
      .replace(/"runId":"[^"]+"/, '"runId":"fixture"')
      .replace(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g,
        "2026-10-17T00:00:00.000Z",
      ),
  );
  if (process.env.WRITE_REPORT_FIXTURE === "1" || !existsSync(file))
    writeFileSync(file, JSON.stringify(stable, null, 2) + "\n");
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(stable);
});
