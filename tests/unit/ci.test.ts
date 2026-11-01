import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ciText, ciVerdict } from "../../src/core/ci";
import { parseArgs } from "../../src/cli/main";
import type { AuditReport } from "../../src/core/schema";

const fixture = (): AuditReport =>
  JSON.parse(readFileSync(join(__dirname, "../fixtures/morrow-report.json"), "utf8"));

const withCheck = (report: AuditReport, id: string, status: AuditReport["checks"][number]["status"], findingCodes?: string[]) => ({
  ...report,
  checks: report.checks.map((c) => (c.id === id ? { ...c, status, ...(findingCodes ? { findingCodes } : {}) } : c)),
});

test("optional machine-readable files never fail the run unless strict", () => {
  const report = fixture();
  const verdict = ciVerdict(report);
  expect(verdict.exitCode).toBe(0);
  expect(verdict.outcome).toBe("pass");
  expect(verdict.optional).toEqual(["resource-business-actions"]);
  expect(ciVerdict(report, { strictOptional: true }).below).toEqual(["resource-business-actions"]);
  expect(ciVerdict(report, { strictOptional: true, failOn: "warning" }).exitCode).toBe(1);
  // not_applicable (not declared) is not listed anywhere.
  expect(JSON.stringify(verdict)).not.toContain("resource-openapi");
});

test("a failed page check is definite; warnings fail only with --fail-on warning", () => {
  expect(ciVerdict(withCheck(fixture(), "robots-meta", "fail")).exitCode).toBe(1);
  const warned = withCheck(fixture(), "description", "warning");
  expect(ciVerdict(warned).exitCode).toBe(0);
  expect(ciVerdict(warned).below).toContain("description");
  expect(ciVerdict(warned, { failOn: "warning" }).definite).toContain("description");
});

test("an unsafe machine-readable resource is always definite", () => {
  const report = withCheck(fixture(), "resource-llms-txt", "fail", ["machine_resource_unsafe"]);
  expect(ciVerdict(report).definite).toContain("resource-llms-txt");
});

test("nothing read is 'could not tell' (exit 3), not a failure or a pass", () => {
  const report = { ...withCheck(fixture(), "retrieval", "fail"), pages: [] };
  const verdict = ciVerdict(report);
  expect(verdict.exitCode).toBe(3);
  expect(verdict.outcome).toBe("unknown");
  expect(ciVerdict(withCheck(fixture(), "title", "unknown"), { unknownFails: true }).exitCode).toBe(3);
  expect(ciVerdict(withCheck(fixture(), "title", "unknown")).exitCode).toBe(0);
});

test("CI text is ASCII and names checks, not prose", () => {
  const text = ciText(ciVerdict(withCheck(fixture(), "robots-meta", "fail")));
  expect(/^[\x09\x0a\x20-\x7e]*$/.test(text)).toBe(true);
  expect(text).toContain("[FAIL] robots-meta");
});

test("argument parsing: usage errors are explicit", () => {
  expect(parseArgs([])).toEqual({ help: true });
  expect(parseArgs(["audit"])).toEqual({ error: "A URL is required" });
  expect(parseArgs(["audit", "a.com", "b.com"])).toEqual({ error: "Only one URL can be checked per run" });
  expect(parseArgs(["audit", "a.com", "--fail-on", "maybe"])).toEqual({ error: "--fail-on must be fail or warning" });
  expect(parseArgs(["audit", "a.com", "--output"])).toEqual({ error: "--output needs a value" });
  expect(parseArgs(["audit", "a.com", "--format", "json", "--strict-optional"])).toMatchObject({ url: "a.com", format: "json", strictOptional: true, ai: false });
});
