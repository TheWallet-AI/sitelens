import type { AuditReport } from "./schema";
export function safeMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]{}()!#|])/g, "\\$1");
}
export function exportReportJson(report: unknown): string {
  return JSON.stringify(report, null, 2);
}
export function exportReportMarkdown(report: AuditReport): string {
  return [
    "# SiteLens audit",
    `Website: ${safeMarkdown(report.finalUrl)}`,
    `Completed: ${report.completedAt}`,
    `Coverage: ${report.coverage.retrieved}/${report.coverage.attempted} attempted pages`,
    ...report.coverage.notes.map(safeMarkdown),
    "## Findings",
    ...report.checks.map(
      (c) =>
        `- ${c.status.toUpperCase()}: ${safeMarkdown(c.explanation)} (${c.evidenceIds.join(", ") || "No cited evidence"})`,
    ),
    "## AI analysis",
    report.aiAnalysis
      ? safeMarkdown(JSON.stringify(report.aiAnalysis, null, 2))
      : "AI analysis was not available.",
    "## Source evidence",
    ...report.evidence.map(
      (e) =>
        `### ${e.id}\nSource: ${safeMarkdown(e.finalUrl)}\nRetrieved: ${e.retrievedAt}\n\n${safeMarkdown(e.excerpt)}`,
    ),
    "## Optional services",
    ...report.recommendations.map(
      (r) => `${safeMarkdown(r.reason)}\n${safeMarkdown(r.url)}`,
    ),
    "Readiness checks do not establish rankings, indexing, AI recommendations, or citations.",
  ].join("\n\n");
}
