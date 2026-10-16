import { load } from "cheerio";
import type { ExtractedPage } from "../../core/schema";
import { LIMITS } from "../../core/limits";
export function extractPage(body: string, url: URL): ExtractedPage {
  const $ = load(body);
  const jsonLd: unknown[] = [];
  let jsonLdErrors = 0;
  $('script[type="application/ld+json"]').each((_, e) => {
    try {
      jsonLd.push(JSON.parse($(e).text()));
    } catch {
      jsonLdErrors++;
    }
  });
  const entityFields: Record<string, string> = {};
  const queue: unknown[] = [...jsonLd];
  for (let inspected = 0; queue.length && inspected < 100; inspected++) {
    const value = queue.shift();
    if (Array.isArray(value)) {
      queue.push(...value.slice(0, 100));
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    for (const field of [
      "@type",
      "name",
      "description",
      "areaServed",
      "address",
      "openingHours",
      "telephone",
      "email",
      "url",
    ]) {
      if (record[field] != null && !entityFields[field])
        entityFields[field] = (
          typeof record[field] === "string"
            ? record[field]
            : JSON.stringify(record[field])
        ).slice(0, 100);
    }
    if (record["@graph"]) queue.push(record["@graph"]);
  }
  const title = $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content") ?? "";
  const canonical = $('link[rel="canonical"]').attr("href") ?? "";
  const robots = $('meta[name="robots"]').attr("content") ?? "";
  const links: ExtractedPage["links"] = [];
  $("a[href]")
    .slice(0, 200)
    .each((_, e) => {
      try {
        const target = new URL($(e).attr("href")!, url);
        target.hash = "";
        if (["http:", "https:", "mailto:", "tel:"].includes(target.protocol))
          links.push({
            url: target.href,
            text: $(e).text().trim().slice(0, 200),
          });
      } catch {}
    });
  const headings = $("h1,h2,h3")
    .map((_, e) => $(e).text().trim())
    .get()
    .slice(0, 60);
  const password = $('input[type="password"]').length > 0;
  $("script,style,noscript,svg,iframe,template").remove();
  const text = ($("main").length ? $("main").text() : $("body").text())
    .replace(/\s+/g, " ")
    .trim();
  return {
    title,
    description,
    canonical,
    robots,
    links,
    headings,
    jsonLd,
    jsonLdErrors,
    entityFields,
    text: text.slice(0, LIMITS.pageText),
    truncated: text.length > LIMITS.pageText,
    blocked:
      password ||
      /verify you are human|checking your browser|just a moment/i.test(
        title + " " + text.slice(0, 300),
      ),
  };
}
