import { z } from "zod";
import {
  CONTRACT_VERSION,
  EVIDENCE_KINDS,
  READINESS_DIMENSIONS,
  RESOURCE_STATES,
  type ReadinessDimension,
} from "./contract";
import type { ResourceObservation } from "./resources";

export const CheckSchema = z.object({
  id: z.string(),
  category: z.enum(["access", "content", "actions", "machine"]),
  status: z.enum(["pass", "warning", "fail", "unknown", "not_applicable"]),
  explanation: z.string(),
  evidenceIds: z.array(z.string()),
  /** v2: which readiness question the check answers. */
  dimension: z.enum(READINESS_DIMENSIONS).optional(),
  /** v2: ordering hint for the prioritized list. */
  priority: z.enum(["high", "medium", "low"]).optional(),
  /** v2: how the conclusion is supported. */
  evidenceKind: z.enum(EVIDENCE_KINDS).optional(),
  /** v2: what this check cannot establish. */
  limitation: z.string().optional(),
  /** v2: a concrete next step, when one applies. */
  remediation: z.string().optional(),
  /** v2: stable contract finding codes raised by this check. */
  findingCodes: z.array(z.string()).optional(),
});
export type Check = z.infer<typeof CheckSchema>;
export const EvidenceSchema = z.object({
  id: z.string(),
  sourceUrl: z.string().url(),
  finalUrl: z.string().url(),
  retrievedAt: z.string(),
  excerpt: z.string(),
  locationHint: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;
const claim = z.object({
  text: z.string().max(2000),
  state: z.enum(["supported", "unknown", "interpretation"]),
  evidenceIds: z.array(z.string()).max(20),
});
export const AIAnalysisSchema = z.object({
  summary: claim,
  answers: z.array(claim.extend({ question: z.string() })).length(5),
  improvements: z.array(claim).max(3),
});
export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;
export const ResourceObservationSchema = z.object({
  kind: z.string(),
  url: z.string().url(),
  finalUrl: z.string().url().nullable(),
  httpStatus: z.number().int().nullable(),
  contentType: z.string().nullable(),
  bytes: z.number().int().nonnegative(),
  state: z.enum(RESOURCE_STATES),
  summary: z.string(),
  issues: z.array(z.object({ code: z.string(), detail: z.string() })),
  declared: z.object({
    links: z.array(z.string()),
    actions: z
      .array(z.object({ type: z.string(), url: z.string(), reach: z.string() }))
      .optional(),
    tools: z.array(z.string()).optional(),
    endpoints: z.array(z.string()).optional(),
    sitemaps: z.array(z.string()).optional(),
    blockedAgents: z.array(z.string()).optional(),
    count: z.number().optional(),
  }),
  evidenceId: z.string().nullable(),
});
export type Recommendation = {
  id: string;
  reason: string;
  evidenceIds: string[];
  url: string;
};
export type AuditInput = { url: string };
export type PageRecord = {
  url: string;
  finalUrl: string;
  status: number;
  error?: string;
  evidenceIds: string[];
};
export type ExtractedPage = {
  text: string;
  title: string;
  description: string;
  canonical: string;
  robots: string;
  headings: string[];
  jsonLd: unknown[];
  jsonLdErrors: number;
  entityFields?: Record<string, string>;
  links: { url: string; text: string }[];
  truncated: boolean;
  blocked: boolean;
};
export type CrawlResult = {
  pages: PageRecord[];
  evidence: Evidence[];
  extracted: ExtractedPage[];
  finalUrl: string;
  coverage: {
    attempted: number;
    retrieved: number;
    truncated: boolean;
    notes: string[];
  };
};
export type DimensionSummary = {
  dimension: ReadinessDimension;
  /** Derived from the counts below; criteria in docs/report-format.md. */
  status: "good" | "needs_attention" | "unknown";
  passed: number;
  attention: number;
  unknown: number;
  notApplicable: number;
  checkIds: string[];
};
export type AuditReport = {
  schemaVersion: "2";
  contract: typeof CONTRACT_VERSION;
  runId: string;
  startedAt: string;
  completedAt: string;
  inputUrl: string;
  finalUrl: string;
  coverage: CrawlResult["coverage"];
  pages: PageRecord[];
  evidence: Evidence[];
  checks: Check[];
  /** One entry per probed machine-readable resource. */
  resources: ResourceObservation[];
  readiness: DimensionSummary[];
  aiAnalysis: AIAnalysis | null;
  recommendations: Recommendation[];
  limits: Record<string, number>;
  /** What no SiteLens audit can establish. */
  limitations: string[];
};
/** A schema version 1 report as exported by SiteLens 0.1. */
export type AuditReportV1 = Omit<
  AuditReport,
  "schemaVersion" | "contract" | "resources" | "readiness" | "limitations"
> & { schemaVersion: "1" };
export type AuditEvent =
  | {
      runId: string;
      type: "phase" | "page" | "warning" | "error";
      message: string;
    }
  /** v2: one machine-readable resource was inspected. */
  | {
      runId: string;
      type: "resource";
      message: string;
      kind: string;
      state: string;
    }
  | { runId: string; type: "result"; report: AuditReport };
export function validateReportReferences(report: {
  evidence: Pick<Evidence, "id">[];
  checks: { evidenceIds: string[] }[];
  aiAnalysis: AIAnalysis | null;
  recommendations: { evidenceIds: string[] }[];
  resources?: { evidenceId: string | null }[];
}): boolean {
  const ids = new Set(report.evidence.map((e) => e.id));
  const claims = report.aiAnalysis
    ? [
        report.aiAnalysis.summary,
        ...report.aiAnalysis.answers,
        ...report.aiAnalysis.improvements,
      ]
    : [];
  return (
    [...report.checks, ...report.recommendations, ...claims].every((c) =>
      c.evidenceIds.every((id) => ids.has(id)),
    ) &&
    (report.resources ?? []).every(
      (r) => r.evidenceId === null || ids.has(r.evidenceId),
    ) &&
    claims.every((c) => c.state !== "supported" || c.evidenceIds.length > 0)
  );
}
