import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contractDocument, FINDING_CODES, RESOURCE_KINDS } from "../../src/core/contract";
import { validateResource } from "../../src/core/resources";
import { resourceChecks } from "../../src/core/checks";

const root = join(__dirname, "../../contract");
const fixtures = JSON.parse(readFileSync(join(root, "fixtures.v1.json"), "utf8")) as {
  origin: string;
  cases: { file: string; kind: string; contentType: string; state: string; codes: string[] }[];
};

test("published contract JSON matches the source of truth", () => {
  const published = JSON.parse(readFileSync(join(root, "agent-readiness.v1.json"), "utf8"));
  expect(published).toEqual(contractDocument());
});

test("every resource kind has a unique path and a check id", () => {
  const paths = RESOURCE_KINDS.map((r) => r.path);
  expect(new Set(paths).size).toBe(paths.length);
});

test.each(fixtures.cases)("fixture $file as $kind → $state", (c) => {
  const body = readFileSync(join(root, "fixtures", c.file), "utf8");
  const verdict = validateResource(
    c.kind as never,
    { status: 200, contentType: c.contentType, body, finalUrl: fixtures.origin + "/x" },
    fixtures.origin,
  );
  expect(verdict.state).toBe(c.state);
  const codes = [...new Set(verdict.issues.map((i) => i.code))].sort();
  expect(codes).toEqual([...c.codes].sort());
  for (const code of codes) expect(Object.keys(FINDING_CODES)).toContain(code);
});

test("fixture evidence never repeats a detected secret", () => {
  const body = readFileSync(join(root, "fixtures", "secret.ai.txt"), "utf8");
  const verdict = validateResource(
    "ai_txt",
    { status: 200, contentType: "text/plain", body, finalUrl: fixtures.origin + "/ai.txt" },
    fixtures.origin,
  );
  expect(JSON.stringify(verdict)).not.toContain("sk_live_0123456789abcdefABCDEF");
});

test("optional resources that are absent are not applicable, not failures", () => {
  const checks = resourceChecks(
    RESOURCE_KINDS.map((r) => ({
      kind: r.kind,
      url: fixtures.origin + r.path,
      finalUrl: null,
      httpStatus: 404,
      contentType: null,
      bytes: 0,
      state: "not_found" as const,
      summary: "Not published (HTTP 404).",
      issues: [],
      declared: { links: [] },
      evidenceId: null,
    })),
  );
  const byId = Object.fromEntries(checks.map((c) => [c.id, c.status]));
  expect(byId["resource-mcp-server-card"]).toBe("not_applicable");
  expect(byId["resource-openapi"]).toBe("not_applicable");
  expect(byId["resource-business-actions"]).toBe("not_applicable");
  expect(byId["resource-robots-txt"]).toBe("pass");
  expect(byId["resource-sitemap-xml"]).toBe("warning");
  expect(byId["resource-llms-txt"]).toBe("warning");
});
