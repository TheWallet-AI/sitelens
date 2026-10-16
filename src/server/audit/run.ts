import { randomUUID } from "node:crypto";
import type { AuditInput, AuditEvent, AuditReport } from "../../core/schema";
import { LIMITS } from "../../core/limits";
import { runChecks } from "../../core/checks";
import { recommendServices } from "../../core/recommendations";
import { integrationConfig } from "../../integrations/infoholder/config";
import { crawlSite } from "../crawl/crawl";
import { loadAIConfig } from "../ai/provider";
import { analyzeEvidence } from "../ai/analyze";
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
  emit("phase", "Reading public pages and collecting evidence.");
  const crawl = await crawlSite(input, {
    signal,
    onPage: (page) =>
      emit(
        "page",
        page.error
          ? "A page was skipped: " + page.error
          : "Read a public HTML page.",
      ),
  });
  const checks = runChecks(crawl);
  let aiAnalysis = null;
  if (crawl.evidence.length && !signal.aborted) {
    try {
      const config = loadAIConfig();
      if (config) {
        emit("phase", "Analyzing evidence with the configured AI provider.");
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
    schemaVersion: "1",
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    inputUrl: input.url,
    finalUrl: crawl.finalUrl,
    coverage: crawl.coverage,
    pages: crawl.pages,
    evidence: crawl.evidence,
    checks,
    aiAnalysis,
    recommendations: recommendServices(checks, integrationConfig()),
    limits: { ...LIMITS },
  };
  options.emit({ runId, type: "result", report });
  return report;
}
