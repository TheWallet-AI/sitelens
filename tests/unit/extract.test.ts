import { test, expect } from "vitest";
import { extractPage } from "../../src/server/crawl/extract";
test("extracts text without executable markup", () => {
  const p = extractPage(
    '<title>Shop</title><script>alert(1)</script><main><h1>Our services</h1><p>Book a visit</p></main><a href="/contact">Contact</a>',
    new URL("https://example.com"),
  );
  expect(p.text).toContain("Book a visit");
  expect(p.text).not.toContain("alert");
  expect(p.links[0].url).toBe("https://example.com/contact");
});
test("records invalid structured data and bounds text", () => {
  const p = extractPage(
    '<script type="application/ld+json">{bad}</script><main>' +
      "a".repeat(13000) +
      "</main>",
    new URL("https://example.com"),
  );
  expect(p.jsonLdErrors).toBe(1);
  expect(p.text.length).toBe(12000);
  expect(p.truncated).toBe(true);
});
