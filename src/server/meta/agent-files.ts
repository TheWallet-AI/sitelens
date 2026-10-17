import { CONTRACT_VERSION, RESOURCE_KINDS } from "../../core/contract";
import { LIMITS } from "../../core/limits";

/**
 * SiteLens's own machine-readable files. They describe only what this
 * deployment really offers: a browser UI and an origin-checked audit
 * endpoint that is not a public API, so no OpenAPI document, API catalog or
 * MCP server is advertised.
 */
const REPOSITORY = "https://github.com/TheWallet-AI/sitelens";
const CONTRACT_DOC = `${REPOSITORY}/blob/main/docs/agent-readiness-contract.md`;
const HOSTED_CHECK = "https://www.infoholder.io/app-studio/en/tools/site-check";

export function appOrigin(request: Request): string {
  const configured = process.env.APP_ORIGIN?.replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function llmsTxt(origin: string): string {
  return [
    "# SiteLens",
    "",
    "> Open-source, evidence-based checks of what search engines and AI agents can find, understand and act on across a public website.",
    "",
    "SiteLens samples a few public pages and machine-readable files with GET requests only, applies deterministic checks, and cites the evidence behind each finding. Optional AI analysis interprets the same evidence. It never submits forms, signs in, or calls declared tools.",
    "",
    "## Use",
    "",
    `- [Analyze a website](${origin}/): browser interface for one-off audits`,
    `- [Full description](${origin}/llms-full.txt): checks, report format and limits`,
    `- [AI usage notes](${origin}/ai.txt)`,
    `- [Profile](${origin}/ai.json)`,
    "",
    "## Project",
    "",
    `- [Source code (MIT)](${REPOSITORY})`,
    `- [Agent-readiness contract](${CONTRACT_DOC}): shared vocabulary for resource states and findings (${CONTRACT_VERSION})`,
    `- [Hosted Infoholder website check](${HOSTED_CHECK}): a separate hosted checker that uses the same contract vocabulary`,
    "",
  ].join("\n");
}

export function llmsFullTxt(origin: string): string {
  return [
    llmsTxt(origin).trimEnd(),
    "",
    "## What an audit inspects",
    "",
    `- Up to ${LIMITS.pages} same-origin HTML pages, one link deep, within a ${LIMITS.totalMs / 1000}-second deadline and a ${LIMITS.totalBytes / 1024 / 1024} MiB download budget.`,
    `- Up to ${LIMITS.resourceProbes} machine-readable files: ${RESOURCE_KINDS.map((r) => r.path).join(", ")}. Each is classified as not_found, valid, malformed, inconsistent, unsafe, blocked, unknown or not_applicable.`,
    `- Up to ${LIMITS.resourceLinkChecks} same-site links declared by those files, checked by status only.`,
    "- robots.txt is respected for every request. Private and reserved addresses, credentials in URLs, non-default ports and HTTPS downgrades are refused.",
    "",
    "## Report",
    "",
    "Reports use schema version 2: pages, cited evidence, checks with stable ids and contract finding codes, resource observations, per-dimension readiness counts (find, understand, act) and explicit limitations. There is no aggregate score.",
    "",
    "## Limits",
    "",
    "- A readiness check is not a ranking, an indexing guarantee or a prediction of AI citations.",
    "- Capabilities a site declares (actions, MCP tools, APIs) are reported as declared; SiteLens never invokes them or attempts authorization.",
    "- The audit endpoint behind the browser interface is origin-checked and not a public API.",
    "",
  ].join("\n");
}

export function aiTxt(origin: string): string {
  return [
    "# SiteLens: notes for AI systems",
    "",
    "This file is a convention, not a standard, and grants no authorization.",
    `Public pages of this deployment may be read and summarized. Start with ${origin}/llms.txt.`,
    "The audit endpoint (/api/audit) is not a public API: it accepts same-origin browser requests only and is rate limited.",
    "No MCP server or OpenAPI document is offered.",
    "",
  ].join("\n");
}

export function aiJson(origin: string) {
  return {
    name: "SiteLens",
    url: origin,
    description:
      "Open-source, evidence-based checks of what search engines and AI agents can find, understand and act on across a public website.",
    license: "MIT",
    source: REPOSITORY,
    contract: CONTRACT_VERSION,
    resources: [
      { kind: "llms_txt", url: `${origin}/llms.txt` },
      { kind: "llms_full_txt", url: `${origin}/llms-full.txt` },
      { kind: "ai_txt", url: `${origin}/ai.txt` },
    ],
    publicApi: null,
    mcp: null,
  };
}

export const textResponse = (body: string, type: string) =>
  new Response(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
