import { test, expect } from "vitest";
import {
  DownloadBudget,
  readBounded,
  resolvePublic,
} from "../../src/server/crawl/transport";
test("rejects a mixed DNS response", async () => {
  await expect(
    resolvePublic("example.com", async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
  ).rejects.toThrow();
});
test("bounds decoded and aggregate bytes", async () => {
  const budget = new DownloadBudget(5);
  const source = async function* () {
    yield Buffer.from("123");
    yield Buffer.from("456");
  };
  await expect(readBounded(source(), budget, 10)).rejects.toThrow("budget");
  await expect(
    readBounded(source(), new DownloadBudget(100), 4),
  ).rejects.toThrow("Page");
});
test("preserves bytes within limits", async () => {
  const source = async function* () {
    yield Buffer.from("abc");
  };
  expect(
    (await readBounded(source(), new DownloadBudget(5), 4)).toString(),
  ).toBe("abc");
});
