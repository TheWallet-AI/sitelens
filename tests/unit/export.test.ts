import { test, expect } from "vitest";
import { safeMarkdown, exportReportJson } from "../../src/core/export";
import { decodeEvents } from "../../src/core/stream";
test("escapes active Markdown and HTML", () => {
  expect(safeMarkdown("<script>[x](javascript:alert(1))```")).not.toContain(
    "<script>",
  );
  expect(safeMarkdown("[x](url)")).toContain("\\[");
});
test("JSON preserves quoted source text", () =>
  expect(JSON.parse(exportReportJson({ text: "<script>" }))).toEqual({
    text: "<script>",
  }));
test("handles NDJSON split inside Unicode bytes", async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ type: "phase", runId: "x", message: "Café" }) + "\n",
  );
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(bytes.slice(0, 15));
      c.enqueue(bytes.slice(15));
      c.close();
    },
  });
  const events = [];
  for await (const e of decodeEvents(stream)) events.push(e);
  expect(events[0]).toMatchObject({ message: "Café" });
});
