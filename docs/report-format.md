# Report format

Reports have `schemaVersion: "2"` and `contract: "agent-readiness/1"`. See
`src/core/schema.ts` for TypeScript contracts and Zod schemas, and
[agent-readiness-contract.md](agent-readiness-contract.md) for the shared vocabulary.

## Fields

- `runId`, `startedAt`, `completedAt`, `inputUrl`, `finalUrl`, `coverage`, `pages`, `limits` — as in v1.
- `evidence` — cited excerpts. Page evidence ids are `page-N`; machine-readable file evidence ids are `resource-<kind>` (for example `resource-llms-txt`). Resource excerpts are bounded to 1,500 characters and sensitive values are replaced with `[redacted]`.
- `checks` — one entry per check:
  - `id` (stable), `category` (`access`, `content`, `actions`, `machine`), `status` (`pass`, `warning`, `fail`, `unknown`, `not_applicable`), `explanation`, `evidenceIds`;
  - v2 additions: `dimension` (`find`, `understand`, `act`), `priority` (`high`, `medium`, `low`), `evidenceKind` (`observed`, `declared`, …), `limitation`, `remediation` (only when something needs fixing) and `findingCodes` (contract codes raised).
- `resources` — one observation per probed file: `kind`, `url`, `finalUrl`, `httpStatus`, `contentType`, `bytes`, `state`, `summary`, `issues` (`{code, detail}`), `declared` (links, actions, tools, endpoints, sitemaps, blocked AI agents, counts) and `evidenceId`.
- `readiness` — per dimension: `status` (`good`, `needs_attention`, `unknown`), `passed`, `attention`, `unknown`, `notApplicable`, `checkIds`.
- `aiAnalysis` — nullable optional AI analysis, unchanged from v1.
- `recommendations` — optional Infoholder links, unchanged from v1.
- `limitations` — what no audit can establish.

## Readiness criteria

For each dimension, only checks with that dimension count. `unknown` when no
check could pass or warn; `needs_attention` when at least one check is
`warning` or `fail`; otherwise `good`. Counts are shown separately so missing
evidence is never presented as a pass or a zero.

## Statuses

A pass establishes only the stated observation. `unknown` means the auditor
lacked evidence. `not_applicable` is used for optional resources a site does
not publish (most sites do not need an MCP server or OpenAPI document).
Missing evidence is never proof of global absence.

## Migration from v1

v1 reports (SiteLens 0.1) lack `contract`, `resources`, `readiness` and
`limitations`, and their checks have no `dimension`. `toCurrentReport()` in
`src/core/migrate.ts` reads either version as v2: it maps `access → find`,
`content → understand`, `actions → act`, sets `resources` to an empty array
(the resource phase did not exist, which is not the same as "nothing found")
and computes `readiness`. All v1 check ids keep their meaning.

## Stream events

The API emits newline-delimited JSON events: `phase`, `page`, `warning`,
`error`, `result` (unchanged) and, in v2, `resource` (`{kind, state, message}`)
once per inspected file. Clients that ignore unknown event types keep working.
A `result` event contains the entire report. Downloaded JSON uses the same
report object; Markdown includes readiness, prioritized findings with fixes,
resources, sources, AI output, optional links and limitations.
