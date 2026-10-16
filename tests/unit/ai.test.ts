import { test, expect } from "vitest";
import { validateAnalysis } from "../../src/server/ai/analyze";
const evidence = [
  {
    id: "e1",
    sourceUrl: "https://example.com",
    finalUrl: "https://example.com",
    retrievedAt: "now",
    excerpt: "Services",
    locationHint: "main",
  },
];
const claim = { text: "Unknown", state: "unknown", evidenceIds: [] };
const analysis = {
  summary: claim,
  answers: Array.from({ length: 5 }, (_, i) => ({
    ...claim,
    question: `Question ${i}`,
  })),
  improvements: [],
};
test("accepts explicit unknown answers", () =>
  expect(validateAnalysis(analysis, evidence).summary.state).toBe("unknown"));
test("rejects nonexistent evidence and unsupported assertions", () => {
  expect(() =>
    validateAnalysis(
      {
        ...analysis,
        summary: {
          text: "Business",
          state: "supported",
          evidenceIds: ["fake"],
        },
      },
      evidence,
    ),
  ).toThrow();
  expect(() =>
    validateAnalysis(
      {
        ...analysis,
        summary: { text: "Business", state: "supported", evidenceIds: [] },
      },
      evidence,
    ),
  ).toThrow();
});
test("rejects malformed or oversized analysis", () => {
  expect(() => validateAnalysis({}, evidence)).toThrow();
  expect(() =>
    validateAnalysis(
      { ...analysis, summary: { ...claim, text: "x".repeat(2001) } },
      evidence,
    ),
  ).toThrow();
});
