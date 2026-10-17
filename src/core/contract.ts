/**
 * The agent-readiness contract: the shared, versioned vocabulary that
 * SiteLens reports use and that other tools (for example the hosted
 * Infoholder website checker) can adopt without importing SiteLens code.
 *
 * The machine-readable copy lives in `contract/agent-readiness.v1.json`; a
 * unit test keeps the two identical. Bump CONTRACT_VERSION only for breaking
 * changes; adding a resource kind or finding code is additive.
 *
 * See docs/agent-readiness-contract.md for semantics.
 */
export const CONTRACT_VERSION = "agent-readiness/1" as const;

/** The three questions a report answers. */
export const READINESS_DIMENSIONS = ["find", "understand", "act"] as const;
export type ReadinessDimension = (typeof READINESS_DIMENSIONS)[number];

/**
 * What SiteLens observed about one machine-readable resource.
 * Presence is not validity, validity is not working execution, and working
 * execution is not authorized access.
 */
export const RESOURCE_STATES = [
  "not_found",
  "valid",
  "malformed",
  "inconsistent",
  "unsafe",
  "blocked",
  "unknown",
  "not_applicable",
] as const;
export type ResourceState = (typeof RESOURCE_STATES)[number];

/** How strongly a conclusion is supported. */
export const EVIDENCE_KINDS = [
  /** Fetched and read by the auditor. */
  "observed",
  /** Claimed by the site itself (for example a tool list in a server card). */
  "declared",
  /** Derived from observations by a deterministic rule. */
  "inferred",
  /** Produced by optional AI analysis; must be verified by a person. */
  "ai_interpretation",
  /** The auditor cannot establish it (authentication, transactions). */
  "unverifiable",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** How far a machine can take a declared business action. */
export const ACTION_REACH = [
  "not_available",
  "ai_readable",
  "ai_executable",
] as const;
export type ActionReach = (typeof ACTION_REACH)[number];

export const SEVERITIES = ["critical", "warning", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * Whether a resource format is a published standard, a community
 * convention, or a format documented by one vendor. Conventions are useful
 * but publishing one does not guarantee that any AI system reads it.
 */
export const RESOURCE_BASIS = ["standard", "convention", "vendor"] as const;
export type ResourceBasis = (typeof RESOURCE_BASIS)[number];

export type ResourceKindSpec = {
  kind: string;
  path: string;
  format: "text" | "markdown" | "json" | "linkset" | "xml";
  basis: ResourceBasis;
  /** Where the specification or convention is documented. */
  reference: string;
  dimension: ReadinessDimension;
  /** Optional resources are not penalized when absent. */
  optional: boolean;
};

export const RESOURCE_KINDS = [
  {
    kind: "robots_txt",
    path: "/robots.txt",
    format: "text",
    basis: "standard",
    reference: "https://www.rfc-editor.org/rfc/rfc9309",
    dimension: "find",
    optional: true,
  },
  {
    kind: "sitemap_xml",
    path: "/sitemap.xml",
    format: "xml",
    basis: "standard",
    reference: "https://www.sitemaps.org/protocol.html",
    dimension: "find",
    optional: false,
  },
  {
    kind: "llms_txt",
    path: "/llms.txt",
    format: "markdown",
    basis: "convention",
    reference: "https://llmstxt.org/",
    dimension: "find",
    optional: false,
  },
  {
    kind: "llms_full_txt",
    path: "/llms-full.txt",
    format: "markdown",
    basis: "convention",
    reference: "https://llmstxt.org/",
    dimension: "understand",
    optional: true,
  },
  {
    kind: "ai_txt",
    path: "/ai.txt",
    format: "text",
    basis: "convention",
    reference: "docs/agent-readiness-contract.md#aitxt",
    dimension: "understand",
    optional: true,
  },
  {
    kind: "ai_json",
    path: "/ai.json",
    format: "json",
    basis: "convention",
    reference: "docs/agent-readiness-contract.md#aijson",
    dimension: "understand",
    optional: true,
  },
  {
    kind: "business_actions",
    path: "/.well-known/business-actions.json",
    format: "json",
    basis: "vendor",
    reference: "docs/agent-readiness-contract.md#business-actions",
    dimension: "act",
    optional: true,
  },
  {
    kind: "mcp_discovery",
    path: "/.well-known/mcp.json",
    format: "json",
    basis: "convention",
    reference: "https://modelcontextprotocol.io/",
    dimension: "act",
    optional: true,
  },
  {
    kind: "mcp_server_card",
    path: "/.well-known/mcp/server-card.json",
    format: "json",
    basis: "convention",
    reference: "https://modelcontextprotocol.io/",
    dimension: "act",
    optional: true,
  },
  {
    kind: "api_catalog",
    path: "/.well-known/api-catalog",
    format: "linkset",
    basis: "standard",
    reference: "https://www.rfc-editor.org/rfc/rfc9727",
    dimension: "act",
    optional: true,
  },
  {
    kind: "openapi",
    path: "/openapi.json",
    format: "json",
    basis: "standard",
    reference: "https://spec.openapis.org/oas/v3.1.0",
    dimension: "act",
    optional: true,
  },
] as const satisfies readonly ResourceKindSpec[];

export type ResourceKind = (typeof RESOURCE_KINDS)[number]["kind"];

export const resourceSpec = (kind: string): ResourceKindSpec | undefined =>
  (RESOURCE_KINDS as readonly ResourceKindSpec[]).find((r) => r.kind === kind);

/**
 * Stable finding codes for machine-readable resources. Consumers key copy,
 * analytics and remediation on these codes; never reuse a retired code.
 */
export const FINDING_CODES = {
  llms_txt_missing: { dimension: "find", severity: "info" },
  llms_txt_malformed: { dimension: "find", severity: "warning" },
  llms_txt_broken_links: { dimension: "find", severity: "warning" },
  llms_full_txt_malformed: { dimension: "understand", severity: "info" },
  ai_txt_malformed: { dimension: "understand", severity: "info" },
  ai_json_malformed: { dimension: "understand", severity: "warning" },
  ai_json_inconsistent: { dimension: "understand", severity: "warning" },
  business_actions_malformed: { dimension: "act", severity: "warning" },
  business_actions_inconsistent: { dimension: "act", severity: "warning" },
  mcp_declaration_malformed: { dimension: "act", severity: "warning" },
  mcp_declared_unverified: { dimension: "act", severity: "info" },
  mcp_endpoint_unreachable: { dimension: "act", severity: "warning" },
  api_catalog_malformed: { dimension: "act", severity: "warning" },
  openapi_malformed: { dimension: "act", severity: "warning" },
  sitemap_missing: { dimension: "find", severity: "warning" },
  sitemap_malformed: { dimension: "find", severity: "warning" },
  robots_blocks_ai_agents: { dimension: "find", severity: "info" },
  machine_resource_unsafe: { dimension: "find", severity: "critical" },
  machine_resource_wrong_origin: { dimension: "find", severity: "warning" },
} as const satisfies Record<
  string,
  { dimension: ReadinessDimension; severity: Severity }
>;

export type FindingCode = keyof typeof FINDING_CODES;

/** The JSON form published as contract/agent-readiness.v1.json. */
export function contractDocument() {
  return {
    contract: CONTRACT_VERSION,
    dimensions: [...READINESS_DIMENSIONS],
    resourceStates: [...RESOURCE_STATES],
    evidenceKinds: [...EVIDENCE_KINDS],
    actionReach: [...ACTION_REACH],
    severities: [...SEVERITIES],
    resourceBasis: [...RESOURCE_BASIS],
    resources: RESOURCE_KINDS.map((r) => ({ ...r })),
    findings: Object.fromEntries(
      Object.entries(FINDING_CODES).map(([code, spec]) => [code, { ...spec }]),
    ),
  };
}
