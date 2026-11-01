import { writeFile } from "node:fs/promises";
import { ciText, ciVerdict, type CiThreshold } from "../core/ci";
import { exportReportJson, exportReportMarkdown } from "../core/export";
import type { AuditReport } from "../core/schema";
import { runAudit } from "../server/audit/run";
import { validatePublicUrl } from "../server/crawl/url-policy";

/**
 * `sitelens audit <url> [options]` — run one audit from a terminal or CI.
 *
 * The same audit as the web app (same URL policy, robots.txt handling, budgets and
 * timeouts). AI analysis is off unless `--ai` is passed (CI runs stay deterministic and do
 * not spend a provider quota). Output goes to stdout; diagnostics to stderr, ASCII only.
 *
 * Exit codes: 0 pass, 1 definite failures, 2 usage error or URL not accepted, 3 could not tell.
 */
export const USAGE = `Usage: sitelens audit <url> [options]

Options:
  --mode page|site        page: only this page; site: this page plus sampled pages
                          (default: site for a homepage, page otherwise)
  --format ci|json|markdown
                          ci (default): verdict lines; json: full report plus verdict;
                          markdown: the readable report
  --fail-on fail|warning  which check status fails the run (default: fail)
  --strict-optional       broken optional machine-readable files also fail the run
  --unknown-fails         checks that could not be decided make the run exit 3
  --output <file>         also write the full JSON report (with the verdict) to a file
  --ai                    run the optional AI analysis (needs AI_BASE_URL, AI_MODEL, AI_API_KEY)
  -h, --help              show this help

Exit codes: 0 pass, 1 definite failures, 2 usage error, 3 could not tell.
`;

export type CliArgs = {
  url: string;
  mode?: "page" | "site";
  format: "ci" | "json" | "markdown";
  failOn: CiThreshold;
  strictOptional: boolean;
  unknownFails: boolean;
  output?: string;
  ai: boolean;
};

export function parseArgs(argv: string[]): CliArgs | { error: string } | { help: true } {
  const args = [...argv];
  if (!args.length || args.includes("-h") || args.includes("--help")) return { help: true };
  if (args.shift() !== "audit") return { error: "Unknown command. Use: sitelens audit <url>" };
  const out: CliArgs = { url: "", format: "ci", failOn: "fail", strictOptional: false, unknownFails: false, ai: false };
  while (args.length) {
    const arg = args.shift()!;
    const value = () => {
      const next = args.shift();
      if (next === undefined || next.startsWith("--")) throw new Error(`${arg} needs a value`);
      return next;
    };
    try {
      if (arg === "--mode") {
        const v = value();
        if (v !== "page" && v !== "site") return { error: "--mode must be page or site" };
        out.mode = v;
      } else if (arg === "--format") {
        const v = value();
        if (v !== "ci" && v !== "json" && v !== "markdown") return { error: "--format must be ci, json or markdown" };
        out.format = v;
      } else if (arg === "--fail-on") {
        const v = value();
        if (v !== "fail" && v !== "warning") return { error: "--fail-on must be fail or warning" };
        out.failOn = v;
      } else if (arg === "--strict-optional") out.strictOptional = true;
      else if (arg === "--unknown-fails") out.unknownFails = true;
      else if (arg === "--output") out.output = value();
      else if (arg === "--ai") out.ai = true;
      else if (arg.startsWith("--")) return { error: `Unknown option ${arg}` };
      else if (!out.url) out.url = arg;
      else return { error: "Only one URL can be checked per run" };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }
  if (!out.url) return { error: "A URL is required" };
  return out;
}

export type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  audit?: typeof runAudit;
  write?: (path: string, text: string) => Promise<void>;
};

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const parsed = parseArgs(argv);
  if ("help" in parsed) {
    io.stdout(USAGE);
    return 0;
  }
  if ("error" in parsed) {
    io.stderr(`[ERROR] ${parsed.error}\n\n${USAGE}`);
    return 2;
  }
  let url: URL;
  try {
    url = validatePublicUrl(parsed.url.includes("://") ? parsed.url : `https://${parsed.url}`);
  } catch {
    io.stderr("[ERROR] Enter a public HTTP(S) website URL (no credentials, ports, IP addresses or private hosts).\n");
    return 2;
  }
  if (!parsed.ai) {
    delete process.env.AI_BASE_URL;
    delete process.env.AI_MODEL;
    delete process.env.AI_API_KEY;
  }
  const mode = parsed.mode ?? (url.pathname === "/" && !url.search ? "site" : "page");
  let report: AuditReport;
  try {
    report = await (io.audit ?? runAudit)(
      { url: url.href, mode },
      { signal: new AbortController().signal, emit: (event) => { if (event.type === "phase") io.stderr(`[INFO] ${event.message}\n`); } },
    );
  } catch {
    io.stderr("[ERROR] The audit could not complete.\n");
    return 3;
  }
  const verdict = ciVerdict(report, { failOn: parsed.failOn, strictOptional: parsed.strictOptional, unknownFails: parsed.unknownFails });
  const full = JSON.stringify({ ...JSON.parse(exportReportJson(report)), ci: verdict }, null, 2) + "\n";
  if (parsed.format === "json") io.stdout(full);
  else if (parsed.format === "markdown") io.stdout(exportReportMarkdown(report));
  else io.stdout(ciText(verdict));
  if (parsed.output) await (io.write ?? ((p, t) => writeFile(p, t)))(parsed.output, full);
  return verdict.exitCode;
}

const invokedDirectly = (() => {
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  runCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  }).then((code) => process.exit(code), () => process.exit(3));
}
