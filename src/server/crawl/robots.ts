import robotsParser from "robots-parser";
import { safeFetch, DownloadBudget } from "./transport";
export type RobotsDecision = {
  status: "allowed" | "disallowed" | "unknown";
  reason: string;
};
export function parseRobots(
  status: number,
  body: string,
  url: URL,
): RobotsDecision {
  if (status === 404)
    return { status: "allowed", reason: "No robots.txt was provided." };
  if (status < 200 || status >= 300)
    return {
      status: "unknown",
      reason: "Robots policy could not be retrieved.",
    };
  const allowed = robotsParser(
    new URL("/robots.txt", url).href,
    body,
  ).isAllowed(url.href, "SiteLens");
  return {
    status: allowed === false ? "disallowed" : "allowed",
    reason:
      allowed === false
        ? "Robots policy disallows SiteLens."
        : "Robots policy permits this path.",
  };
}
export async function checkRobots(
  url: URL,
  options: { signal: AbortSignal; budget: DownloadBudget },
): Promise<RobotsDecision> {
  try {
    const result = await safeFetch(new URL("/robots.txt", url), {
      ...options,
      entryHost: url.hostname,
    });
    return parseRobots(result.status, result.body, url);
  } catch {
    return {
      status: "unknown",
      reason: "Robots policy is unavailable; this page was skipped.",
    };
  }
}
