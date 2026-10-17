import { randomUUID } from "node:crypto";
import type { AuditInput, AuditEvent, AuditReport } from "../../core/schema";
import { LIMITS } from "../../core/limits";
import { CONTRACT_VERSION } from "../../core/contract";
import { runChecks, summarizeReadiness } from "../../core/checks";
import { REPORT_LIMITATIONS } from "../../core/migrate";
import { recommendServices } from "../../core/recommendations";
import { integrationConfig } from "../../integrations/infoholder/config";
import { crawlSite } from "../crawl/crawl";
import { probeResources } from "../crawl/resources";
import { DownloadBudget } from "../crawl/transport";
import type { RobotsCache } from "../crawl/robots";
import { loadAIConfig } from "../ai/provider";
import { analyzeEvidence } from "../ai/analyze";
const STATE_WORDS: Record<string, string> = {
  valid: "found and valid",
  not_found: "not published",
  malformed: "found but malformed",
  inconsistent: "found but inconsistent",
  unsafe: "found but unsafe",
  blocked: "blocked",
  unknown: "could not be checked",
  not_applicable: "not applicable",
};
export async function runAudit(
  input: AuditInput,
  options: { signal: AbortSignal; emit: (event: AuditEvent) => void },
): Promise<AuditReport> {
  const runId = randomUUID(),
    startedAt = new Date().toISOString();
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(LIMITS.totalMs),
  ]);
  const emit = (type: "phase" | "page" | "warning", message: string) =>
    options.emit({ runId, type, message });
  const budget = new DownloadBudget();
  const robots: RobotsCache = new Map();
  emit("phase", "Reading public pages and collecting evidence.");
  const crawl = await crawlSite(input, {
    signal,
    budget,
    robots,
    onPage: (page) =>
      emit(
        "page",
        page.error
          ? "A page was skipped: " + page.error
          : "Read a public HTML page.",
      ),
  });
  emit(
    "phase",
    "Checking machine-readable files for search engines and AI agents.",
  );
  const phase = signal.aborted
    ? { observations: [], evidence: [], notes: [] }
    : await probeResources(new URL(crawl.finalUrl), {
        signal,
        budget,
        robots,
        onResource: (obs) =>
          options.emit({
            runId,
            type: "resource",
            kind: obs.kind,
            state: obs.state,
            message: `${new URL(obs.url).pathname}: ${STATE_WORDS[obs.state] ?? obs.state}.`,
          }),
      });
  const evidence = [...crawl.evidence, ...phase.evidence];
  const checks = runChecks(crawl, phase.observations);
  let aiAnalysis = null;
  if (crawl.evidence.length && !signal.aborted) {
    try {
      const config = loadAIConfig();
      if (config) {
        emit("phase", "Analyzing evidence with the configured AI provider.");
        // Page evidence only: resource files are checked deterministically.
        aiAnalysis = await analyzeEvidence(crawl.evidence, { signal, config });
      } else
        emit(
          "warning",
          "AI is not configured. Deterministic checks are available.",
        );
    } catch {
      emit(
        "warning",
        "AI analysis was unavailable or could not be validated. Basic findings are preserved.",
      );
    }
  }
  const report: AuditReport = {
    schemaVersion: "2",
    contract: CONTRACT_VERSION,
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    inputUrl: input.url,
    finalUrl: crawl.finalUrl,
    coverage: {
      ...crawl.coverage,
      notes: [...crawl.coverage.notes, ...phase.notes],
    },
    pages: crawl.pages,
    evidence,
    checks,
    resources: phase.observations,
    readiness: summarizeReadiness(checks),
    aiAnalysis,
    recommendations: recommendServices(checks, integrationConfig()),
    limits: { ...LIMITS },
    limitations: [...REPORT_LIMITATIONS],
  };
  options.emit({ runId, type: "result", report });
  return report;
}
