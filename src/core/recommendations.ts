import type { Check, Recommendation } from "./schema";
import type { IntegrationConfig } from "../integrations/infoholder/config";
export function recommendServices(
  checks: Check[],
  config: IntegrationConfig,
): Recommendation[] {
  if (!config.enabled) return [];
  return config.solutions
    .filter((s) =>
      checks.some((c) => c.id === s.checkId && c.status === "warning"),
    )
    .slice(0, 2)
    .map((s) => {
      const url = new URL(s.url);
      url.search =
        "utm_source=sitelens&utm_medium=audit&utm_campaign=next_step";
      return {
        id: s.id,
        reason: s.reason,
        url: url.href,
        evidenceIds: checks.find((c) => c.id === s.checkId)!.evidenceIds,
      };
    });
}
