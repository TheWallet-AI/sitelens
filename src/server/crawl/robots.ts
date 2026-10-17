import robotsParser from "robots-parser";
import { LIMITS } from "../../core/limits";
import { safeFetch, DownloadBudget } from "./transport";
export type RobotsDecision = {
  status: "allowed" | "disallowed" | "unknown";
  reason: string;
};
/** The raw robots.txt response for an origin, or null when it could not be fetched. */
export type RobotsFile = {
  status: number;
  body: string;
  finalUrl: string;
  contentType: string;
} | null;
/**
 * One robots.txt request per origin per audit. Path decisions are still made
 * per URL; only the download is shared, so page crawling and resource probes
 * do not each spend budget on the same file.
 */
export type RobotsCache = Map<string, Promise<RobotsFile>>;
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
export function fetchRobotsFile(
  url: URL,
  options: { signal: AbortSignal; budget: DownloadBudget; cache?: RobotsCache },
): Promise<RobotsFile> {
  const key = url.origin;
  const cached = options.cache?.get(key);
  if (cached) return cached;
  const pending = safeFetch(new URL("/robots.txt", url), {
    signal: options.signal,
    budget: options.budget,
    entryHost: url.hostname,
    maxBytes: LIMITS.resourceBytes,
  })
    .then((r): RobotsFile => ({
      status: r.status,
      body: r.body,
      finalUrl: r.finalUrl,
      contentType: r.headers["content-type"] ?? "",
    }))
    .catch(() => null);
  options.cache?.set(key, pending);
  return pending;
}
export async function checkRobots(
  url: URL,
  options: { signal: AbortSignal; budget: DownloadBudget; cache?: RobotsCache },
): Promise<RobotsDecision> {
  const file = await fetchRobotsFile(url, options);
  if (!file)
    return {
      status: "unknown",
      reason: "Robots policy is unavailable; this page was skipped.",
    };
  return parseRobots(file.status, file.body, url);
}
