import type { Check, DimensionSummary } from "./schema";

/** Plain-language names for check ids, shown instead of the ids themselves. */
const CHECK_TITLES: Record<string, string> = {
  retrieval: "Public pages can be read",
  title: "Page titles",
  description: "Page descriptions",
  headings: "Headings",
  canonical: "Canonical address",
  "robots-meta": "Indexing permission",
  "structured-data": "Structured data (JSON-LD)",
  contact: "A way to contact you",
  "next-step": "A clear next step for customers",
  "business-description": "Business description",
  "service-area": "Location or service area",
  "operating-information": "Opening hours",
  "entity-fields": "Business name and type",
  "resource-robots-txt": "Crawl rules (robots.txt)",
  "resource-sitemap-xml": "Sitemap",
  "resource-llms-txt": "AI site index (llms.txt)",
  "resource-llms-full-txt": "Full AI documentation (llms-full.txt)",
  "resource-ai-txt": "AI usage notes (ai.txt)",
  "resource-ai-json": "AI site profile (ai.json)",
  "resource-business-actions": "Customer action list (business-actions.json)",
  "resource-mcp-discovery": "MCP discovery file",
  "resource-mcp-server-card": "MCP server card",
  "resource-api-catalog": "API catalog",
  "resource-openapi": "OpenAPI description",
};

export const checkTitle = (check: Pick<Check, "id">): string =>
  CHECK_TITLES[check.id] ?? check.id.replace(/[-_]/g, " ");

export const STATUS_LABELS: Record<Check["status"], string> = {
  pass: "Looks good",
  warning: "Needs attention",
  fail: "Problem",
  unknown: "Could not check",
  not_applicable: "Not applicable",
};

export const DIMENSION_COPY: Record<
  DimensionSummary["dimension"],
  { title: string; question: string }
> = {
  find: {
    title: "AI can find it",
    question: "Can crawlers reach your pages and the files that point to them?",
  },
  understand: {
    title: "AI can understand it",
    question: "Is it clear who you are, what you offer and where?",
  },
  act: {
    title: "AI can act on it",
    question:
      "Is there a clear way for a customer, or an agent, to take the next step?",
  },
};

export const DIMENSION_STATUS: Record<DimensionSummary["status"], string> = {
  good: "No issues in what we checked",
  needs_attention: "Needs attention",
  unknown: "Could not be established",
};

export const RESOURCE_STATE_LABELS: Record<string, string> = {
  valid: "Found and valid",
  not_found: "Not published",
  malformed: "Found but malformed",
  inconsistent: "Found but inconsistent",
  unsafe: "Found but unsafe",
  blocked: "Blocked",
  unknown: "Could not check",
  not_applicable: "Not applicable",
};
