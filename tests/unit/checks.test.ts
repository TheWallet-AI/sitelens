import { test, expect } from "vitest";
import { runChecks } from "../../src/core/checks";
test("does not claim missing business content after failed fetch", () => {
  const checks = runChecks({
    pages: [],
    evidence: [],
    extracted: [],
    finalUrl: "https://example.com",
    coverage: { attempted: 1, retrieved: 0, truncated: false, notes: [] },
  });
  expect(
    checks
      .filter((c) => c.category === "content")
      .every((c) => c.status === "unknown"),
  ).toBe(true);
});
