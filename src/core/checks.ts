import type { Check, CrawlResult, DimensionSummary } from "./schema";
import {
  READINESS_DIMENSIONS,
  resourceSpec,
  type ReadinessDimension,
} from "./contract";
import type { ResourceObservation } from "./resources";
import { isContactLink, isNextStepLink, linkActions } from "./actions";

type Meta = Required<
  Pick<Check, "dimension" | "priority" | "evidenceKind" | "limitation">
> & {
  remediation?: string;
};

/** v2 metadata for the page-level checks (ids are unchanged from v1). */
const PAGE_META: Record<string, Meta> = {
  retrieval: {
    dimension: "find",
    priority: "high",
    evidenceKind: "observed",
    limitation:
      "Only a bounded sample of public HTML pages is fetched; JavaScript is not executed.",
  },
  title: {
    dimension: "understand",
    priority: "high",
    evidenceKind: "observed",
    limitation: "Presence is checked, not wording quality.",
    remediation:
      "Give each page a specific <title> that names the business and the page topic.",
  },
  description: {
    dimension: "understand",
    priority: "medium",
    evidenceKind: "observed",
    limitation: "Presence is checked, not accuracy.",
    remediation: "Add a meta description that says what you offer and where.",
  },
  headings: {
    dimension: "understand",
    priority: "medium",
    evidenceKind: "observed",
    limitation:
      "Heading presence only; structure and relevance are not scored.",
    remediation: "Use one clear H1 per page and H2 headings for main sections.",
  },
  canonical: {
    dimension: "find",
    priority: "medium",
    evidenceKind: "observed",
    limitation:
      "A declared canonical URL is not verified to be correct or reachable.",
    remediation:
      'Declare <link rel="canonical"> with the page\'s own public URL.',
  },
  "robots-meta": {
    dimension: "find",
    priority: "high",
    evidenceKind: "observed",
    limitation:
      "Only sampled pages' robots meta tags are read; HTTP X-Robots-Tag headers are not.",
    remediation:
      "Remove noindex from pages that should appear in search and AI answers.",
  },
  "structured-data": {
    dimension: "understand",
    priority: "medium",
    evidenceKind: "observed",
    limitation:
      "JSON-LD parseability and selected fields only; schema.org validity and accuracy are not verified.",
    remediation:
      "Publish Organization or LocalBusiness JSON-LD that matches what the page shows.",
  },
  contact: {
    dimension: "act",
    priority: "high",
    evidenceKind: "observed",
    limitation: "Links are recognized; contact channels were not tested.",
    remediation: "Show a phone number, email, or contact link on every page.",
  },
  "next-step": {
    dimension: "act",
    priority: "high",
    evidenceKind: "observed",
    limitation:
      "Link text and URLs are matched in English, Chinese, Japanese and Malay; the flow behind a link was not executed.",
    remediation:
      "Add a clearly labelled link for the main customer action (book, order, register, or enquire).",
  },
  "business-description": {
    dimension: "understand",
    priority: "medium",
    evidenceKind: "observed",
    limitation:
      "Metadata only; prose descriptions on unvisited pages may exist.",
  },
  "service-area": {
    dimension: "understand",
    priority: "low",
    evidenceKind: "observed",
    limitation: "Structured address or areaServed only.",
    remediation: "Add address or areaServed to your LocalBusiness JSON-LD.",
  },
  "operating-information": {
    dimension: "understand",
    priority: "low",
    evidenceKind: "observed",
    limitation: "Structured openingHours only.",
    remediation: "Publish confirmed opening hours in structured data.",
  },
  "entity-fields": {
    dimension: "understand",
    priority: "medium",
    evidenceKind: "observed",
    limitation: "Name and @type presence only.",
  },
};

const RESOURCE_LIMITATIONS: Record<string, string> = {
  robots_txt:
    "Rules are evaluated for tracked crawler names; other agents may behave differently.",
  sitemap_xml:
    "Structure and URL origins are checked; listed URLs are not all fetched.",
  llms_txt:
    "llms.txt is a convention; publishing it does not guarantee that any AI system reads it.",
  llms_full_txt: "Only structure and a size-bounded excerpt are inspected.",
  ai_txt:
    "ai.txt has no single standard and does not override robots.txt or authorization.",
  ai_json:
    "ai.json has no single standard; only known profiles are validated in depth.",
  business_actions:
    "Declared actions and their reach are self-reported; SiteLens does not execute bookings, orders, or payments.",
  mcp_discovery:
    "A declaration is not proof the server works. SiteLens never calls MCP tools or attempts authorization.",
  mcp_server_card:
    "Tools listed in a server card are self-declared. SiteLens never calls MCP tools or attempts authorization.",
  api_catalog: "Catalog structure only; listed APIs are not called.",
  openapi:
    "Document structure only; operations are not called and authentication is not tested.",
};

const RESOURCE_REMEDIATION: Partial<Record<string, string>> = {
  robots_txt:
    "Publish /robots.txt with a Sitemap line; block only what you intend to block.",
  sitemap_xml:
    "Publish /sitemap.xml with absolute URLs on your own domain and list it in robots.txt.",
  llms_txt:
    "Publish /llms.txt: an H1 with the business name, a one-line summary, and links to key pages.",
  ai_json: "Serve valid JSON whose URLs point to your own site.",
  business_actions:
    "Regenerate the manifest so every action starts on your site with an absolute URL.",
  mcp_discovery:
    "Point the declaration to a live HTTPS endpoint, or remove it.",
  mcp_server_card:
    "Point the server card to a live HTTPS endpoint, or remove it.",
  api_catalog: "Serve an RFC 9727 Linkset as application/linkset+json.",
  openapi:
    "Serve a valid OpenAPI 3.x JSON document describing only public operations.",
};

const kebab = (kind: string) => kind.replace(/_/g, "-");

/** One check per probed machine-readable resource. */
export function resourceChecks(resources: ResourceObservation[]): Check[] {
  return resources.map((obs) => {
    const spec = resourceSpec(obs.kind);
    const optional = spec?.optional ?? true;
    let status: Check["status"];
    switch (obs.state) {
      case "valid":
        status = "pass";
        break;
      case "malformed":
      case "inconsistent":
        status = "warning";
        break;
      case "unsafe":
        status = "fail";
        break;
      case "not_found":
        status =
          obs.kind === "robots_txt"
            ? "pass"
            : optional
              ? "not_applicable"
              : "warning";
        break;
      case "not_applicable":
        status = "not_applicable";
        break;
      default:
        status = "unknown";
    }
    const declaredKind =
      obs.state === "valid" &&
      ["business_actions", "mcp_discovery", "mcp_server_card"].includes(
        obs.kind,
      );
    const priority: Check["priority"] =
      status === "fail"
        ? "high"
        : obs.kind === "sitemap_xml" && status === "warning"
          ? "medium"
          : status === "warning" && obs.kind !== "llms_txt"
            ? "medium"
            : "low";
    const remediation =
      status === "warning" || status === "fail"
        ? RESOURCE_REMEDIATION[obs.kind]
        : undefined;
    const explanation =
      status === "not_applicable"
        ? `${obs.summary} This is optional; most businesses do not need it unless they offer it to agents or developers.`
        : obs.summary;
    return {
      id: `resource-${kebab(obs.kind)}`,
      category: "machine",
      status,
      explanation,
      evidenceIds: obs.evidenceId ? [obs.evidenceId] : [],
      dimension: spec?.dimension ?? "find",
      priority,
      evidenceKind: declaredKind ? "declared" : "observed",
      limitation: RESOURCE_LIMITATIONS[obs.kind] ?? "Structure only.",
      ...(remediation ? { remediation } : {}),
      ...(obs.issues.length
        ? { findingCodes: [...new Set(obs.issues.map((i) => i.code))] }
        : {}),
    };
  });
}

export function runChecks(
  result: CrawlResult,
  resources: ResourceObservation[] = [],
): Check[] {
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
  const EMAIL = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i;
  const contactOn = (p: CrawlResult["extracted"][number]) =>
    p.links.some(isContactLink) || EMAIL.test(p.text);
  const nextStepOn = (p: CrawlResult["extracted"][number]) =>
    p.links.some(isNextStepLink);
  const kinds = [
    ...new Set(pages.flatMap((p) => p.links.flatMap((l) => linkActions(l)))),
  ];
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
      pages.some((p) => p.links.some(isContactLink)) || EMAIL.test(text),
      "A contact link or email was observed. Its operation was not tested.",
      "No contact cue was found in this sample. Review whether visitors can contact the business.",
    ),
    check(
      "next-step",
      "actions",
      pages.some(nextStepOn),
      `A customer action link was observed (${kinds.join(", ")}). Its flow was not executed.`,
      "No booking, ordering, registration, or enquiry link was recognized in this sample.",
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
    contact: contactOn,
    "next-step": nextStepOn,
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
  for (const item of checks) {
    const meta = PAGE_META[item.id];
    if (!meta) continue;
    Object.assign(item, {
      dimension: meta.dimension,
      priority: meta.priority,
      evidenceKind: meta.evidenceKind,
      limitation: meta.limitation,
      ...(meta.remediation &&
      (item.status === "warning" || item.status === "fail")
        ? { remediation: meta.remediation }
        : {}),
    });
  }
  return [...checks, ...resourceChecks(resources)];
}

/**
 * Per-dimension counts. Status is "unknown" when nothing in the dimension
 * could be established, "needs_attention" when any check warns or fails,
 * otherwise "good". There is deliberately no aggregate score.
 */
export function summarizeReadiness(checks: Check[]): DimensionSummary[] {
  return READINESS_DIMENSIONS.map((dimension: ReadinessDimension) => {
    const own = checks.filter((c) => c.dimension === dimension);
    const passed = own.filter((c) => c.status === "pass").length;
    const attention = own.filter(
      (c) => c.status === "warning" || c.status === "fail",
    ).length;
    const unknown = own.filter((c) => c.status === "unknown").length;
    const notApplicable = own.filter(
      (c) => c.status === "not_applicable",
    ).length;
    return {
      dimension,
      status:
        passed + attention === 0
          ? "unknown"
          : attention
            ? "needs_attention"
            : "good",
      passed,
      attention,
      unknown,
      notApplicable,
      checkIds: own.map((c) => c.id),
    };
  });
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const STATUS_ORDER = {
  fail: 0,
  warning: 1,
  unknown: 2,
  pass: 3,
  not_applicable: 4,
} as const;

/** Findings that need attention first, most important first. Stable. */
export function prioritized(checks: Check[]): Check[] {
  return checks
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.c.status] - STATUS_ORDER[b.c.status] ||
        PRIORITY_ORDER[a.c.priority ?? "low"] -
          PRIORITY_ORDER[b.c.priority ?? "low"] ||
        a.i - b.i,
    )
    .map(({ c }) => c);
}
