import { CONTRACT_VERSION } from "./contract";
import { summarizeReadiness } from "./checks";
import type { AuditReport, AuditReportV1, Check } from "./schema";

/** What no SiteLens audit can establish, regardless of findings. */
export const REPORT_LIMITATIONS = [
  "A readiness check is not a search ranking, an indexing guarantee, or a prediction of AI citations or recommendations.",
  "Only a bounded sample of public pages and machine-readable files was fetched with GET; JavaScript, forms, sign-in and transactions were not executed.",
  "Capabilities declared by the site (actions, tools, APIs) are reported as declared; whether an external agent can authenticate and complete them was not tested.",
] as const;

const DIMENSION_BY_CATEGORY: Record<Check["category"], NonNullable<Check["dimension"]>> = {
  access: "find",
  content: "understand",
  actions: "act",
  machine: "find",
};

/**
 * Read a SiteLens report of either schema version as a v2 report.
 * v1 reports have no resource phase, so `resources` is empty and every
 * resource check is simply absent (not "missing").
 */
export function toCurrentReport(report: AuditReport | AuditReportV1): AuditReport {
  if (report.schemaVersion === "2") return report;
  const checks = report.checks.map((c) => ({
    ...c,
    dimension: c.dimension ?? DIMENSION_BY_CATEGORY[c.category],
  }));
  return {
    ...report,
    schemaVersion: "2",
    contract: CONTRACT_VERSION,
    checks,
    resources: [],
    readiness: summarizeReadiness(checks),
    limitations: [...REPORT_LIMITATIONS],
  };
}
