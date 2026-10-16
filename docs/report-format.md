# Report format

Reports have `schemaVersion: "1"`, a run ID, input/final URLs, timestamps, coverage, attempted pages, evidence, checks, nullable AI analysis, optional recommendations, and enforced limits. See `src/core/schema.ts` for TypeScript contracts and AI validation schemas.

Each evidence item contains an ID, original and final source URL, retrieval time, location hint, and a bounded excerpt including observed metadata, recognized links, and main text. Long metadata values are shortened. IDs are local to the report. Checks cite relevant page observations; absence checks cite the inspected sample. Missing evidence is never proof of global absence.

Statuses are `pass`, `warning`, `fail`, `unknown`, and `not_applicable`. Initial heuristics primarily use pass, warning, and unknown. A pass establishes only the stated observation. The app deliberately avoids an aggregate ranking score.

AI claims use `supported`, `unknown`, or `interpretation`. Supported claims require existing evidence IDs. Validation proves reference existence and structure, not semantic entailment.

The API emits newline-delimited JSON events: phase, page, warning, error, and result. A result contains the entire report. Downloaded JSON uses the same report object; Markdown includes findings, sources, AI output, and optional links.
