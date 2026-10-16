import { test, expect } from "vitest";
import { CheckSchema, validateReportReferences } from "../../src/core/schema";
import { LIMITS } from "../../src/core/limits";
test("unknown is distinct from a failed observation", () => {
  expect(
    CheckSchema.safeParse({
      id: "x",
      category: "content",
      status: "unknown",
      explanation: "Unavailable",
      evidenceIds: [],
    }).success,
  ).toBe(true);
  expect(CheckSchema.safeParse({ status: "excellent" }).success).toBe(false);
});
test("limits are bounded and reproducible", () => {
  expect(LIMITS).toMatchObject({
    pages: 5,
    depth: 1,
    audits: 2,
    fetchConcurrency: 2,
    totalMs: 90000,
    requestMs: 10000,
    redirects: 3,
    pageBytes: 2097152,
    totalBytes: 10485760,
  });
});
test("rejects dangling evidence references", () => {
  expect(
    validateReportReferences({
      evidence: [],
      checks: [{ evidenceIds: ["missing"] }],
      aiAnalysis: null,
      recommendations: [],
    }),
  ).toBe(false);
});
