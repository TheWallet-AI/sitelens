import { acquireAuditSlot } from "../../../server/audit/capacity";
import { runAudit } from "../../../server/audit/run";
import { validatePublicUrl } from "../../../server/crawl/url-policy";
export const runtime = "nodejs";
export const maxDuration = 100;
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const configured = process.env.APP_ORIGIN;
  if (process.env.NODE_ENV === "production" && !configured)
    return Response.json(
      { error: "Application origin is not configured." },
      { status: 503 },
    );
  const expected = configured ?? new URL(request.url).origin;
  if (origin && origin !== expected)
    return Response.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  let input: { url: string };
  try {
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json({ error: "A URL is required." }, { status: 400 });
    let size = 0;
    const parts: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096)
          return Response.json(
            { error: "Request body is too large." },
            { status: 413 },
          );
        parts.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const value = JSON.parse(Buffer.concat(parts).toString());
    if (typeof value.url !== "string" || value.url.length > 2048)
      throw new Error("Invalid URL.");
    input = { url: validatePublicUrl(value.url).href };
  } catch {
    return Response.json(
      { error: "Enter a public HTTP(S) website URL." },
      { status: 400 },
    );
  }
  const release = acquireAuditSlot();
  if (!release)
    return Response.json(
      { error: "Two audits are already running. Try again shortly." },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(streamController) {
      const emit = (event: import("../../../core/schema").AuditEvent) => {
        if (!closed)
          streamController.enqueue(
            encoder.encode(JSON.stringify(event) + "\n"),
          );
      };
      void runAudit(input, { signal, emit })
        .catch(() => {
          emit({
            runId: "unavailable",
            type: "error",
            message:
              "The audit could not complete. Check the URL and try again.",
          });
        })
        .finally(() => {
          release();
          if (!closed) {
            closed = true;
            streamController.close();
          }
        });
    },
    cancel() {
      closed = true;
      controller.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
