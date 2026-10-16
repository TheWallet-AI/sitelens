import { test, expect, vi, afterEach } from "vitest";
import { analyzeEvidence } from "../../src/server/ai/analyze";
const config = {
  baseUrl: "https://provider.example/v1",
  model: "test",
  apiKey: "test-key",
  structuredOutputMode: "json" as const,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
test("provider failure is surfaced without exposing provider response details", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("secret upstream detail", { status: 500 })),
  );
  await expect(
    analyzeEvidence([], { signal: new AbortController().signal, config }),
  ).rejects.toThrow("AI provider request failed");
});
test("caller cancellation aborts provider work", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("Aborted")),
            { once: true },
          );
        }),
    ),
  );
  const controller = new AbortController();
  const task = analyzeEvidence([], { signal: controller.signal, config });
  controller.abort();
  await expect(task).rejects.toThrow("Aborted");
});
test("provider output is bounded before JSON parsing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("x".repeat(131073))),
  );
  await expect(
    analyzeEvidence([], { signal: new AbortController().signal, config }),
  ).rejects.toThrow("exceeded");
});
