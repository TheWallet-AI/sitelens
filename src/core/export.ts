import type { AuditReport } from "./schema";
import { prioritized } from "./checks";
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
const DIMENSION_TITLES = {
  find: "AI can find it",
  understand: "AI can understand it",
  act: "AI can act on it",
} as const;
const STATUS_WORDS = {
  good: "No issues found in what was checked",
  needs_attention: "Needs attention",
  unknown: "Could not be established",
} as const;
export function exportReportMarkdown(report: AuditReport): string {
  const cite = (ids: string[]) => ids.join(", ") || "No cited evidence";
  return [
    "# SiteLens audit",
    `Website: ${safeMarkdown(report.finalUrl)}`,
    `Completed: ${report.completedAt}`,
    `Report schema: ${report.schemaVersion} (${report.contract})`,
    `Coverage: ${report.coverage.retrieved}/${report.coverage.attempted} attempted pages`,
    ...report.coverage.notes.map(safeMarkdown),
    "## Readiness",
    ...report.readiness.map(
      (d) =>
        `- ${DIMENSION_TITLES[d.dimension]}: ${STATUS_WORDS[d.status]} (${d.passed} passed, ${d.attention} need attention, ${d.unknown} unknown, ${d.notApplicable} not applicable)`,
    ),
    "## Findings",
    ...prioritized(report.checks).map(
      (c) =>
        `- ${c.status.toUpperCase()} · ${safeMarkdown(c.id)}: ${safeMarkdown(c.explanation)} (${cite(c.evidenceIds)})` +
        (c.remediation ? `\n  - Fix: ${safeMarkdown(c.remediation)}` : "") +
        (c.limitation ? `\n  - Limitation: ${safeMarkdown(c.limitation)}` : ""),
    ),
    "## Machine-readable resources",
    ...(report.resources.length
      ? report.resources.map(
          (r) =>
            `- ${safeMarkdown(r.url)}: ${r.state}${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}. ${safeMarkdown(r.summary)}`,
        )
      : ["No machine-readable resources were inspected."]),
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
    ...(report.recommendations.length
      ? report.recommendations.map((r) => `${safeMarkdown(r.reason)}\n${safeMarkdown(r.url)}`)
      : ["None."]),
    "## Limitations",
    ...report.limitations.map((l) => `- ${safeMarkdown(l)}`),
  ].join("\n\n");
}
