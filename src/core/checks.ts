import type { Check, CrawlResult } from "./schema";
export function runChecks(result: CrawlResult): Check[] {
  const ids = result.evidence.map((e) => e.id);
  const pages = result.extracted;
  const known = pages.length > 0;
  const check = (
    id: string,
    category: Check["category"],
    present: boolean,
    yes: string,
    no: string,
  ): Check => ({
    id,
    category,
    status: !known ? "unknown" : present ? "pass" : "warning",
    explanation: !known
      ? "No readable page evidence was available."
      : present
        ? yes
        : no,
    evidenceIds: present ? ids : [],
  });
  const matching = (
    predicate: (page: CrawlResult["extracted"][number]) => boolean,
  ) =>
    pages.flatMap((page, index) =>
      predicate(page)
        ? [result.evidence[index]?.id].filter((id): id is string => !!id)
        : [],
    );
  const text = pages.map((p) => p.text).join(" ");
  const checks: Check[] = [
    {
      id: "retrieval",
      category: "access",
      status: known ? "pass" : "unknown",
      explanation: `Retrieved ${result.coverage.retrieved} of ${result.coverage.attempted} attempted pages.`,
      evidenceIds: ids,
    },
    check(
      "title",
      "content",
      pages.some((p) => !!p.title),
      "A page title was observed.",
      "No title was observed in the sampled pages.",
    ),
    check(
      "description",
      "content",
      pages.some((p) => !!p.description),
      "Description metadata was observed.",
      "Description metadata was not observed in the sample.",
    ),
    check(
      "headings",
      "content",
      pages.some((p) => p.headings.length > 0),
      "Headings help organize sampled content.",
      "No headings were observed in the sample.",
    ),
    check(
      "canonical",
      "access",
      pages.some((p) => !!p.canonical),
      "A canonical declaration was observed; its correctness is not established.",
      "No canonical declaration was observed.",
    ),
    {
      id: "robots-meta",
      category: "access",
      status: !known
        ? "unknown"
        : pages.some((p) => /noindex|none/i.test(p.robots))
          ? "warning"
          : "pass",
      explanation: !known
        ? "No page metadata available."
        : pages.some((p) => /noindex|none/i.test(p.robots))
          ? "A sampled page declares noindex."
          : "No noindex directive was observed in sampled page metadata.",
      evidenceIds: ids,
    },
    {
      id: "structured-data",
      category: "content",
      status: !known
        ? "unknown"
        : pages.some((p) => p.jsonLdErrors)
          ? "warning"
          : pages.some((p) => p.jsonLd.length)
            ? "pass"
            : "warning",
      explanation: !known
        ? "No structured data could be inspected."
        : pages.some((p) => p.jsonLdErrors)
          ? "Some JSON-LD could not be parsed."
          : pages.some((p) => p.jsonLd.length)
            ? "Parseable JSON-LD was found; claims and eligibility are not verified."
            : "No JSON-LD was observed in sampled pages.",
      evidenceIds: ids,
    },
    check(
      "contact",
      "actions",
      pages.some((p) =>
        p.links.some(
          (l) =>
            /^(mailto:|tel:)/.test(l.url) ||
            /contact/i.test(l.url + " " + l.text),
        ),
      ) || /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(text),
      "A contact link or email was observed. Its operation was not tested.",
      "No contact cue was found in this sample. Review whether visitors can contact the business.",
    ),
    check(
      "next-step",
      "actions",
      pages.some((p) =>
        p.links.some((l) =>
          /book|reserv|register|enquir|inquir|order|appointment/i.test(
            l.url + " " + l.text,
          ),
        ),
      ),
      "A customer action link was observed. Its flow was not executed.",
      "No booking, registration, order, or inquiry link was recognized in this sample. Non-English wording may not be recognized.",
    ),
  ];
  const predicates: Record<
    string,
    (p: CrawlResult["extracted"][number]) => boolean
  > = {
    title: (p) => !!p.title,
    description: (p) => !!p.description,
    headings: (p) => !!p.headings.length,
    canonical: (p) => !!p.canonical,
    contact: (p) =>
      p.links.some(
        (l) =>
          /^(mailto:|tel:)/.test(l.url) ||
          /contact/i.test(l.url + " " + l.text),
      ) || /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(p.text),
    "next-step": (p) =>
      p.links.some((l) =>
        /book|reserv|register|enquir|inquir|order|appointment/i.test(
          l.url + " " + l.text,
        ),
      ),
  };
  for (const item of checks) {
    if (predicates[item.id])
      item.evidenceIds =
        item.status === "pass" ? matching(predicates[item.id]) : ids;
    if (item.id === "robots-meta" && item.status === "warning")
      item.evidenceIds = matching((p) => /noindex|none/i.test(p.robots));
    if (item.id === "structured-data")
      item.evidenceIds = pages.some((p) => p.jsonLdErrors)
        ? matching((p) => p.jsonLdErrors > 0)
        : pages.some((p) => p.jsonLd.length)
          ? matching((p) => p.jsonLd.length > 0)
          : ids;
  }
  const businessChecks: [
    string,
    (p: CrawlResult["extracted"][number]) => boolean,
    string,
  ][] = [
    [
      "business-description",
      (p) => !!p.description || !!p.entityFields?.description,
      "Business description metadata",
    ],
    [
      "service-area",
      (p) => !!p.entityFields?.areaServed || !!p.entityFields?.address,
      "A structured service area or address",
    ],
    [
      "operating-information",
      (p) => !!p.entityFields?.openingHours,
      "Structured opening hours",
    ],
    [
      "entity-fields",
      (p) => !!p.entityFields?.name && !!p.entityFields?.["@type"],
      "A structured entity name and type",
    ],
  ];
  for (const [id, predicate, label] of businessChecks) {
    const sources = matching(predicate);
    checks.push({
      id,
      category: "content",
      status: !known ? "unknown" : sources.length ? "pass" : "warning",
      explanation: !known
        ? "No readable evidence was available."
        : sources.length
          ? `${label} was observed; accuracy and completeness are not verified.`
          : `${label} was not observed in sampled metadata. It may exist in prose or unvisited pages.`,
      evidenceIds: sources.length ? sources : ids,
    });
  }
  return checks;
}
