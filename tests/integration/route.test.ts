import { test, expect } from "vitest";
import { acquireAuditSlot } from "../../src/server/audit/capacity";
import { POST } from "../../src/app/api/audit/route";
test("capacity is bounded and release is idempotent", () => {
  const a = acquireAuditSlot()!;
  const b = acquireAuditSlot()!;
  expect(acquireAuditSlot()).toBeNull();
  a();
  a();
  const c = acquireAuditSlot();
  expect(c).not.toBeNull();
  expect(acquireAuditSlot()).toBeNull();
  b();
  c!();
});
test("rejects cross-origin requests before crawling", async () => {
  process.env.APP_ORIGIN = "https://sitelens.example";
  const r = await POST(
    new Request("https://sitelens.example/api/audit", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: JSON.stringify({ url: "https://example.com" }),
    }),
  );
  expect(r.status).toBe(403);
});
test("rejects malformed input before crawling", async () => {
  process.env.APP_ORIGIN = "https://sitelens.example";
  const r = await POST(
    new Request("https://sitelens.example/api/audit", {
      method: "POST",
      body: "{}",
    }),
  );
  expect(r.status).toBe(400);
});
test("rejects oversized body", async () => {
  process.env.APP_ORIGIN = "https://sitelens.example";
  const r = await POST(
    new Request("https://sitelens.example/api/audit", {
      method: "POST",
      body: "x".repeat(4097),
    }),
  );
  expect(r.status).toBe(413);
});
