import { test, expect } from "vitest";
import { parseRobots } from "../../src/server/crawl/robots";
test("honors SiteLens path restrictions", () =>
  expect(
    parseRobots(
      200,
      "User-agent: SiteLens\nDisallow: /private",
      new URL("https://example.com/private"),
    ).status,
  ).toBe("disallowed"));
test("404 allows while server failure stays unknown", () => {
  expect(parseRobots(404, "", new URL("https://example.com")).status).toBe(
    "allowed",
  );
  expect(parseRobots(503, "", new URL("https://example.com")).status).toBe(
    "unknown",
  );
});
