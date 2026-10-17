import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib";
import { Readable } from "node:stream";
import { isIP } from "node:net";
import { LIMITS } from "../../core/limits";
import { validatePublicUrl, isPublicAddress } from "./url-policy";
export class DownloadBudget {
  used = 0;
  constructor(public maximum: number = LIMITS.totalBytes) {}
  consume(bytes: number) {
    this.used += bytes;
    if (this.used > this.maximum) throw new Error("Download budget exceeded.");
  }
}
export async function resolvePublic(
  host: string,
  resolver: (host: string) => Promise<{ address: string; family: number }[]> = (
    h,
  ) => lookup(h, { all: true, verbatim: true }),
) {
  host = host.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolver(host);
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("DNS resolved to a non-public destination.");
  return addresses;
}
export async function readBounded(
  stream: AsyncIterable<Uint8Array>,
  budget: DownloadBudget,
  max: number,
): Promise<Buffer> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    size += chunk.byteLength;
    budget.consume(chunk.byteLength);
    if (size > max) throw new Error("Page response is too large.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export type FetchResult = {
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  redirects: string[];
};
export async function safeFetch(
  input: URL,
  options: {
    signal: AbortSignal;
    budget: DownloadBudget;
    allowedOrigin?: string;
    entryHost?: string;
    beforeRedirect?: (url: URL) => Promise<void>;
    /** Accept header. Defaults to HTML and plain text. */
    accept?: string;
    /** Decoded byte cap for this response. Defaults to LIMITS.pageBytes. */
    maxBytes?: number;
    /** Per-request deadline. Defaults to LIMITS.requestMs. */
    requestMs?: number;
    /** Return status and headers only; the body is never read. */
    discardBody?: boolean;
  },
): Promise<FetchResult> {
  let url = validatePublicUrl(input.href);
  const redirects: string[] = [];
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(options.requestMs ?? LIMITS.requestMs),
  ]);
  for (let hop = 0; hop <= LIMITS.redirects; hop++) {
    signal.throwIfAborted();
    if (options.allowedOrigin && url.origin !== options.allowedOrigin)
      throw new Error("Cross-origin redirect blocked.");
    if (options.entryHost) {
      const host = url.hostname.replace(/^www\./, "");
      if (host !== options.entryHost.replace(/^www\./, ""))
        throw new Error("Entry redirect changes the website host.");
    }
    const addresses = await Promise.race([
      resolvePublic(url.hostname),
      new Promise<never>((_, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error("Request cancelled or timed out.")),
          { once: true },
        );
      }),
    ]);
    signal.throwIfAborted();
    const pinned = addresses[0];
    const response = await new Promise<import("node:http").IncomingMessage>(
      (resolve, reject) => {
        const request = (
          url.protocol === "https:" ? httpsRequest : httpRequest
        )(
          url,
          {
            method: "GET",
            signal,
            agent: false,
            maxHeaderSize: 16384,
            headers: {
              "user-agent": "SiteLens/0.1",
              accept: options.accept ?? "text/html,text/plain;q=0.9",
              "accept-encoding": "gzip, deflate, br",
            },
            lookup: (_host, opts, callback) =>
              opts.all
                ? callback(null, [pinned])
                : callback(null, pinned.address, pinned.family),
          },
          resolve,
        );
        request.on("error", reject);
        request.end();
      },
    );
    const status = response.statusCode ?? 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      response.destroy();
      if (hop === LIMITS.redirects) throw new Error("Too many redirects.");
      const location = response.headers.location;
      if (!location) throw new Error("Redirect missing destination.");
      const next = validatePublicUrl(new URL(location, url).href);
      if (url.protocol === "https:" && next.protocol !== "https:")
        throw new Error("HTTPS downgrade blocked.");
      if (options.allowedOrigin && next.origin !== options.allowedOrigin)
        throw new Error("Cross-origin redirect blocked.");
      if (
        options.entryHost &&
        next.hostname.replace(/^www\./, "") !==
          options.entryHost.replace(/^www\./, "")
      )
        throw new Error("Entry redirect changes the website host.");
      if (options.beforeRedirect) await options.beforeRedirect(next);
      redirects.push(url.href);
      url = next;
      continue;
    }
    const headers = Object.fromEntries(
      Object.entries(response.headers).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.join(", ") : (v ?? ""),
      ]),
    );
    if (options.discardBody) {
      response.destroy();
      return { finalUrl: url.href, status, headers, body: "", redirects };
    }
    const encoding = response.headers["content-encoding"];
    let stream: Readable = response;
    if (encoding) {
      const decoder =
        encoding === "gzip"
          ? createGunzip()
          : encoding === "deflate"
            ? createInflate()
            : encoding === "br"
              ? createBrotliDecompress()
              : null;
      if (!decoder) {
        response.destroy();
        throw new Error("Unsupported content encoding.");
      }
      response.on("error", (e) => decoder.destroy(e));
      stream = response.pipe(decoder);
    }
    try {
      const body = await readBounded(
        stream,
        options.budget,
        options.maxBytes ?? LIMITS.pageBytes,
      );
      return {
        finalUrl: url.href,
        status,
        headers,
        body: body.toString("utf8"),
        redirects,
      };
    } finally {
      stream.destroy();
      response.destroy();
    }
  }
  throw new Error("Redirect limit reached.");
}
