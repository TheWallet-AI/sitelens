# Infoholder SiteLens — Version 1 Design

Date: 2026-10-16
Target repository: TheWallet-AI/sitelens
Status: Architecture direction approved; written specification pending review. The remote repository has not been created.

## 1. Purpose

SiteLens is an independently deployable, open-source GEO readiness audit tool for small businesses, developers, and agencies. It checks what public website content can be retrieved, whether that content explains the business, and whether visitors can find a clear next step.

Reports must distinguish observed evidence from AI interpretation. Readiness findings do not prove search indexing, rankings, AI recommendations, or actual citation visibility.

Infoholder Studio services are optional. Running an audit does not require an Infoholder account. Using Infoholder must never improve audit results or change the evaluation criteria.

Success measures include audit completion, recommendation engagement, repeat audits, and voluntary progression to Studio project creation and publication. GitHub stars are a secondary distribution signal.

## 2. Repository Language Policy

All repository-authored content must be English: identifiers, comments, docstrings, documentation, README files, UI copy, error messages, logs, test names, fixture descriptions, issue templates, pull request templates, and commit messages. Version 1 has an English-only interface and English reports. Do not add a Chinese README or translated documentation.

The crawler must still correctly process multilingual source websites. Original user or website content may appear verbatim as quoted evidence; it must not be translated in a way that obscures its provenance. Synthetic test fixtures should use English unless a specific multilingual parsing test requires another language.

Product name: Infoholder SiteLens. Attribution: Open source by Infoholder Studio.

## 3. Version 1 Scope and User Flow

Enter a public URL → review crawl scope and AI processing disclosure → start audit → observe progress → inspect evidence-backed findings → download report or follow an optional relevant Studio link.

Default scope: up to five same-origin HTML pages, depth one. Prefer the homepage and discovered about, service, contact, and FAQ pages. The entry URL may follow a validated canonical redirect to a www variant; the final validated entry origin establishes the crawl boundary. Subsequent pages must not expand that boundary through redirects.

No browser rendering, form submission, login, booking, purchasing, arbitrary site modification, billing, public report hosting, or scheduled monitoring in version 1.

### Deterministic Checks

- HTTP response and extractable main content.
- Applicable robots.txt rules, page robots directives, canonical URL, title, description, and heading structure.
- JSON-LD parsing and declared entity fields; presence alone is not proof of correctness or citation eligibility.
- Evidence of business descriptions, service areas, contact details, operating information, and customer action links.
- Presence and syntax of customer action links; do not claim that a transaction flow works merely because its link exists.

Each check returns pass, warning, fail, unknown, or not_applicable. Inaccessible or unvisited content remains unknown rather than being declared missing. Display category findings and coverage instead of an unsupported overall GEO ranking score.

### AI Analysis

Using only bounded evidence from the current run, answer five questions: What does the business offer? Who does it serve? Where does it operate? How can a customer contact it? What can the customer do next?

Return a business summary, unanswered questions, and at most three prioritized improvements. Every factual claim must reference valid evidence IDs. Validate the response schema and evidence IDs on the server. Reject unsupported factual claims where validation can detect them, and visibly label interpretation.

Treat website text as untrusted data, never as system instructions. The model has no arbitrary tool access. Never invent prices, certifications, reviews, or observed search exposure. Preserve the deterministic report when AI is unavailable or fails.

Support server-configured OpenAI-compatible providers through a narrow adapter. Provider capabilities differ; do not assume identical structured-output parameters. Keys, model names, and base URLs are server configuration, not browser-supplied credentials.

### Reports and Recommendations

Provide JSON and Markdown downloads. Do not publish reports by default. Display at most two optional Studio links tied to specific findings, with an explanation of relevance. All recommendations remain usable without Studio.

## 4. Technical Architecture

Use Next.js 16 App Router and TypeScript with the Node.js runtime. Target Node.js 22. During implementation, resolve and pin a supported secure Next.js 16 patch and compatible dependencies; commit the lockfile. Run lint independently from the production build.

Module boundaries:

- src/app: input flow, report UI, and server routes.
- src/core: report schemas, deterministic checks, evidence models, and recommendation mapping; no Next.js dependency.
- src/server/crawl: URL validation, DNS and connection safeguards, fetching, and extraction.
- src/server/ai: provider adapters, prompts, response and citation validation.
- src/integrations/infoholder: optional solution links and documented future integration contracts.
- tests: controlled HTML fixtures and meaningful security and report behavior tests.

Version 1 supports local use and a single Docker instance. POST /api/audit accepts a URL and returns streamed progress and a final report. Events include phase, page, warning, result, and error, with a unique runId. Client cancellation aborts downstream fetching and model requests. Jobs do not survive server restarts. There is no persistent database or durable queue in this release.

Server-enforced defaults: two concurrent audits, two concurrent fetches per audit, 90-second overall deadline, 10-second individual request timeout, three redirects, 2 MiB maximum decoded response per page, and 10 MiB total crawl download. Excess audit requests receive 429 rather than entering an unbounded queue. Bound extraction and model input separately.

Report fields include schemaVersion, runId, startedAt, completedAt, inputUrl, finalUrl, coverage, pages, evidence, checks, aiAnalysis, recommendations, and limits. Evidence records preserve source URL, final URL, retrieval time, excerpt, and a location hint. Avoid storing complete source pages unnecessarily.

## 5. Network Safety and Data Handling

Allow HTTP and HTTPS on ports 80 and 443. Reject embedded credentials and non-public IPv4/IPv6 destinations, including loopback, private, link-local, multicast, and reserved ranges. Validate every DNS result and redirect. Connect to a validated address while preserving the correct Host and TLS server name to prevent DNS rebinding; string-only validation is insufficient.

Respect robots.txt for the declared SiteLens user agent. Skip disallowed pages. If robots.txt cannot be retrieved reliably, skip affected crawling with an explicit reason; a confirmed 404 means no file was provided. Do not impersonate an authorized third-party crawler.

Do not execute page scripts. Explain coverage limitations for JavaScript-dependent pages. Stop at login walls or challenge pages without bypassing them.

No telemetry and no report transmission to Infoholder by default. AI-enabled audits send bounded public website text to the configured model provider, disclosed before the audit. Keep keys out of browser bundles, logs, and exports. Operational logs should contain statuses and timings rather than source text or complete URL query strings. Sanitize and escape extracted content before rendering or exporting it.

## 6. Optional Infoholder Services

### Version 1: Relevant Solution Links

Provide configurable links to suitable booking, event registration, and product inquiry solutions. Verify actual destinations during implementation and hide unavailable destinations. Include channel attribution only; do not place full reports or extracted business data in URL parameters. Turning this integration off must leave audits fully functional.

### Future: Report-to-Studio Import

The user previews and explicitly selects the data to transfer. An authenticated server endpoint accepts the business summary, evidence URLs, and recommendations using a short-lived single-use token. Import creates a draft, never automatically publishes a site. Implement only after inspecting the actual apps/app-studio and backend contracts.

### Future: Hosted AI and Monitoring

Hosted AI can provide authenticated quotas and usage accounting without exposing provider credentials. Monitoring requires durable jobs, history storage, retention controls, and notification preferences. These are future services, not verified existing Infoholder APIs. Do not display simulated login, payment, or import success states.

## 7. Open-Source Delivery

Proposed license: MIT, pending specification approval. Describe brand asset usage separately without adding promotional conditions to the software license.

Deliver an English README, setup instructions, environment example, Dockerfile, architecture and report format documentation, SECURITY.md, CONTRIBUTING.md, issue and PR templates, and CI. Keep all authored repository content in English.

Do not copy private Infoholder code, secrets, or customer data into the public repository. Inspect the current site-check implementation and ownership before extracting reusable code. If source access is unavailable, implement against this specification and label the work as a new implementation.

## 8. Acceptance Criteria

1. A clean checkout starts using documented instructions; Docker builds and runs.
2. Basic audits work without AI configuration.
3. Controlled fixtures cover successful fetches, timeouts, robots denial, JavaScript-only shells, malformed JSON-LD, and absent action links.
4. Security tests cover IPv4/IPv6 filtering, private-address redirects, DNS rebinding, unusual URL encodings, oversized decoded responses, cancellation, and concurrency bounds.
5. AI schema failures, invalid citations, prompt injection attempts, and provider errors have explicit tested handling.
6. Downloaded reports match visible evidence; unknown findings are not presented as confirmed omissions.
7. The English UI works on mobile, supports keyboard use, and exposes labels and progress states accessibly.
8. Lint, type checks, meaningful tests, and production build pass.
9. Disabling Infoholder integration does not change checks or block use. No report is sent to Infoholder without a user-initiated transfer.
10. Repository-authored prose and UI copy are English; multilingual source evidence remains supported.

## 9. Approval and Implementation Boundary

Confirmed: repository name TheWallet-AI/sitelens, Next.js 16, independently usable open-source core, optional Infoholder services, and an English-only codebase.

Proposed defaults for written review: MIT license, five-page crawl, English interface and report, single-instance deployment, no public report sharing, and no account billing or scheduled monitoring in version 1.

After written specification approval, produce the implementation plan and select its execution approach. Repository creation remains pending. The connector exposes no repository creation operation and the environment has no GitHub CLI. The authorized GitHub browser workflow can be used during implementation, subject to actual sign-in and organization permissions. Do not claim that the repository has been created until verified.
