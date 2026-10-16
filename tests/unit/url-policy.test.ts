import { test, expect } from "vitest";
import {
  validatePublicUrl,
  isPublicAddress,
} from "../../src/server/crawl/url-policy";
test.each([
  "http://127.0.0.1",
  "http://2130706433",
  "http://0x7f000001",
  "http://[::1]",
  "http://[::ffff:127.0.0.1]",
  "http://169.254.169.254",
  "http://10.0.0.1",
  "http://user:pass@example.com",
  "ftp://example.com",
  "http://example.com:1234",
])("rejects unsafe URL %s", (url) =>
  expect(() => validatePublicUrl(url)).toThrow(),
);
test.each([
  "192.168.1.1",
  "100.64.0.1",
  "0.0.0.0",
  "224.0.0.1",
  "::",
  "fc00::1",
  "fe80::1",
  "2001:db8::1",
])("rejects non-public address %s", (ip) =>
  expect(isPublicAddress(ip)).toBe(false),
);
test("accepts public destinations", () => {
  expect(validatePublicUrl("https://example.com/#x").href).toBe(
    "https://example.com/",
  );
  expect(isPublicAddress("1.1.1.1")).toBe(true);
});
