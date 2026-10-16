import { z } from "zod";
export const CheckSchema = z.object({
  id: z.string(),
  category: z.enum(["access", "content", "actions"]),
  status: z.enum(["pass", "warning", "fail", "unknown", "not_applicable"]),
  explanation: z.string(),
  evidenceIds: z.array(z.string()),
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
export type AuditReport = {
  schemaVersion: "1";
  runId: string;
  startedAt: string;
  completedAt: string;
  inputUrl: string;
  finalUrl: string;
  coverage: CrawlResult["coverage"];
  pages: PageRecord[];
  evidence: Evidence[];
  checks: Check[];
  aiAnalysis: AIAnalysis | null;
  recommendations: Recommendation[];
  limits: Record<string, number>;
};
export type AuditEvent =
  | {
      runId: string;
      type: "phase" | "page" | "warning" | "error";
      message: string;
    }
  | { runId: string; type: "result"; report: AuditReport };
export function validateReportReferences(report: {
  evidence: Pick<Evidence, "id">[];
  checks: { evidenceIds: string[] }[];
  aiAnalysis: AIAnalysis | null;
  recommendations: { evidenceIds: string[] }[];
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
    claims.every((c) => c.state !== "supported" || c.evidenceIds.length > 0)
  );
}
