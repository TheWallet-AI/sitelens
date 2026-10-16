import { beforeEach, expect, test, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
const network = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("node:http", () => ({ request: network.request }));
vi.mock("node:https", () => ({ request: network.request }));
import { safeFetch, DownloadBudget } from "../../src/server/crawl/transport";
function respond(
  status: number,
  headers: Record<string, string>,
  body: Buffer = Buffer.from("ok"),
) {
  network.request.mockImplementationOnce((_url, options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      const response = Object.assign(Readable.from([body]), {
        statusCode: status,
        headers,
      });
      options.signal.addEventListener(
        "abort",
        () => response.destroy(new Error("Aborted")),
        { once: true },
      );
      callback(response);
    };
    return request;
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  network.lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }]);
});
const options = () => ({
  signal: new AbortController().signal,
  budget: new DownloadBudget(),
});
test("pins the validated DNS answer in the connection lookup", async () => {
  respond(200, {});
  await safeFetch(new URL("https://example.com"), options());
  const lookup = network.request.mock.calls[0][1].lookup;
  const callback = vi.fn();
  lookup("example.com", { all: true }, callback);
  expect(callback).toHaveBeenCalledWith(null, [
    { address: "1.1.1.1", family: 4 },
  ]);
});
test("revalidates DNS on a redirect and rejects rebinding before a second connection", async () => {
  network.lookup
    .mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }])
    .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
  respond(302, { location: "/next" });
  await expect(
    safeFetch(new URL("https://example.com"), options()),
  ).rejects.toThrow("non-public");
  expect(network.request).toHaveBeenCalledTimes(1);
});
test("rejects cross-origin and downgrade redirects before following", async () => {
  respond(302, { location: "https://other.example" });
  await expect(
    safeFetch(new URL("https://example.com"), {
      ...options(),
      allowedOrigin: "https://example.com",
    }),
  ).rejects.toThrow("Cross-origin");
  respond(302, { location: "http://example.com" });
  await expect(
    safeFetch(new URL("https://example.com"), options()),
  ).rejects.toThrow("downgrade");
});
test("bounds decompressed content, including compressed expansion", async () => {
  respond(
    200,
    { "content-encoding": "gzip" },
    gzipSync(Buffer.alloc(2 * 1024 * 1024 + 1, 65)),
  );
  await expect(
    safeFetch(new URL("https://example.com"), options()),
  ).rejects.toThrow("too large");
});
test("rejects already-cancelled work without DNS or network access", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    safeFetch(new URL("https://example.com"), {
      signal: controller.signal,
      budget: new DownloadBudget(),
    }),
  ).rejects.toThrow();
  expect(network.request).not.toHaveBeenCalled();
  expect(network.lookup).not.toHaveBeenCalled();
});

test("allows canonical HTTPS and www robots redirects while checking the original path", async () => {
  const { checkRobots } = await import("../../src/server/crawl/robots");
  respond(301, { location: "https://www.example.com/robots.txt" });
  respond(200, {}, Buffer.from("User-agent: SiteLens\nDisallow: /private"));
  expect(
    (await checkRobots(new URL("http://example.com/private"), options()))
      .status,
  ).toBe("disallowed");
  expect(network.request).toHaveBeenCalledTimes(2);
});

test("aborts a stalled response after headers without waiting for content", async () => {
  network.request.mockImplementationOnce((_url, options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      const response = Object.assign(new Readable({ read() {} }), {
        statusCode: 200,
        headers: {},
      });
      options.signal.addEventListener(
        "abort",
        () => response.destroy(new Error("Aborted")),
        { once: true },
      );
      callback(response);
    };
    return request;
  });
  const controller = new AbortController();
  const task = safeFetch(new URL("https://example.com"), {
    signal: controller.signal,
    budget: new DownloadBudget(),
  });
  await new Promise((r) => setTimeout(r, 0));
  controller.abort();
  await expect(task).rejects.toThrow("Aborted");
});
