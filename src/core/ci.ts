import { RESOURCE_KINDS } from "./contract";
import type { AuditReport, Check } from "./schema";

/**
 * CI verdict for a SiteLens report: a structured result and a process exit code.
 *
 * The same vocabulary as the Infoholder hosted check API (`infoholder-site-check-api/1`):
 *
 *   definite  a check failed (or warned, with `--fail-on warning`) on evidence we actually read
 *   unknown   a check could not be decided, or the site could not be read at all
 *   optional  a check on an optional machine-readable resource (llms.txt, ai.json, MCP, OpenAPI, ...)
 *             that is missing or broken; it never fails the build unless `strictOptional` is set
 *   below     warnings under the threshold; reported, not failing
 *
 * Exit codes: 0 pass, 1 definite failures, 2 usage error (the CLI decides), 3 could not tell
 * (nothing was read, or `unknownFails` and some checks were unknown).
 *
 * A resource the site does not declare is `not_applicable` and is not listed at all, so a missing
 * optional protocol never turns CI red. An unsafe machine-readable resource is always definite.
 */
export type CiThreshold = "fail" | "warning";
export type CiOutcome = "pass" | "fail" | "unknown";

export type CiOptions = {
  failOn?: CiThreshold;
  strictOptional?: boolean;
  unknownFails?: boolean;
};

export type CiVerdict = {
  contract: "sitelens-ci/1";
  outcome: CiOutcome;
  exitCode: 0 | 1 | 3;
  failOn: CiThreshold;
  inputUrl: string;
  completedAt: string;
  pagesRead: number;
  definite: string[];
  unknown: string[];
  optional: string[];
  below: string[];
};

const OPTIONAL_CHECK_IDS = new Set(
  RESOURCE_KINDS.filter((r) => r.optional).map(
    (r) => `resource-${r.kind.replace(/_/g, "-")}`,
  ),
);

const isOptional = (check: Check) =>
  OPTIONAL_CHECK_IDS.has(check.id) &&
  !(check.findingCodes ?? []).includes("machine_resource_unsafe");

export function ciVerdict(report: AuditReport, options: CiOptions = {}): CiVerdict {
  const failOn = options.failOn ?? "fail";
  const definite: string[] = [];
  const unknown: string[] = [];
  const optional: string[] = [];
  const below: string[] = [];
  for (const check of report.checks) {
    if (check.status === "pass" || check.status === "not_applicable") continue;
    if (check.status === "unknown") unknown.push(check.id);
    else if (isOptional(check) && !options.strictOptional) optional.push(check.id);
    else if (check.status === "fail" || failOn === "warning") definite.push(check.id);
    else below.push(check.id);
  }
  const pagesRead = report.pages.filter(
    (p) => !p.error && (p.read === undefined || p.read === "content"),
  ).length;
  let outcome: CiOutcome;
  let exitCode: 0 | 1 | 3;
  if (pagesRead === 0) {
    // Nothing was read: a failed check here is about retrieval, not the site.
    outcome = "unknown";
    exitCode = 3;
  } else if (definite.length) {
    outcome = "fail";
    exitCode = 1;
  } else if (options.unknownFails && unknown.length) {
    outcome = "unknown";
    exitCode = 3;
  } else {
    outcome = "pass";
    exitCode = 0;
  }
  return {
    contract: "sitelens-ci/1",
    outcome,
    exitCode,
    failOn,
    inputUrl: report.inputUrl,
    completedAt: report.completedAt,
    pagesRead,
    definite,
    unknown,
    optional,
    below,
  };
}

/** One-line-per-item plain text for CI logs (ASCII only: CI terminals vary). */
export function ciText(verdict: CiVerdict): string {
  const lines = [
    `[${verdict.outcome.toUpperCase()}] ${verdict.inputUrl} (pages read: ${verdict.pagesRead}, fail on: ${verdict.failOn})`,
  ];
  for (const id of verdict.definite) lines.push(`  [FAIL] ${id}`);
  for (const id of verdict.unknown) lines.push(`  [UNKNOWN] ${id}`);
  for (const id of verdict.optional) lines.push(`  [OPTIONAL] ${id}`);
  for (const id of verdict.below) lines.push(`  [WARN] ${id}`);
  return lines.join("\n") + "\n";
}
