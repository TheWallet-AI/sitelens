import { test, expect } from "vitest";
import { recommendServices } from "../../src/core/recommendations";
const checks = [
  {
    id: "next-step",
    category: "actions" as const,
    status: "warning" as const,
    explanation: "No action",
    evidenceIds: [],
  },
];
test("optional integration is disabled by default", () =>
  expect(recommendServices(checks, { enabled: false, solutions: [] })).toEqual(
    [],
  ));
test("irrelevant or unverified destinations remain absent", () =>
  expect(recommendServices(checks, { enabled: true, solutions: [] })).toEqual(
    [],
  ));
