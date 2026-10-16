import type { AuditEvent } from "./schema";
export async function* decodeEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<AuditEvent> {
  const reader = stream.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (buffer.length > 2_000_000)
        throw new Error("Report stream exceeded the limit.");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) yield JSON.parse(line) as AuditEvent;
      }
      if (done) break;
    }
    if (buffer.trim()) throw new Error("The report stream ended unexpectedly.");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
