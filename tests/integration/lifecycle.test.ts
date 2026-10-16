import { test, expect, vi, afterEach } from "vitest";
vi.mock("../../src/server/audit/run", () => ({ runAudit: vi.fn() }));
import { runAudit } from "../../src/server/audit/run";
import { POST } from "../../src/app/api/audit/route";
import { acquireAuditSlot } from "../../src/server/audit/capacity";
afterEach(() => vi.clearAllMocks());
const request = () =>
  new Request("http://localhost/api/audit", {
    method: "POST",
    body: JSON.stringify({ url: "https://example.com" }),
  });
function expectSlotsReleased() {
  const a = acquireAuditSlot(),
    b = acquireAuditSlot();
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  a?.();
  b?.();
}
test("stream cancellation reaches the worker and releases capacity", async () => {
  let signal: AbortSignal | undefined;
  vi.mocked(runAudit).mockImplementation((_input, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) =>
      options.signal.addEventListener(
        "abort",
        () => reject(new Error("Cancelled")),
        { once: true },
      ),
    );
  });
  const response = await POST(request());
  await response.body!.cancel();
  await new Promise((r) => setTimeout(r, 0));
  expect(signal?.aborted).toBe(true);
  expectSlotsReleased();
});
test("worker failure returns an error event and releases capacity", async () => {
  vi.mocked(runAudit).mockRejectedValue(new Error("Internal provider detail"));
  const response = await POST(request());
  const body = await response.text();
  expect(body).toContain('"type":"error"');
  expect(body).not.toContain("Internal provider detail");
  expectSlotsReleased();
});
