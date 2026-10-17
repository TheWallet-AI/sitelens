# Validation

Run on Node.js 22 with npm: `npm test` (unit and integration, including the
shared contract fixtures and an end-to-end audit of a fictional site through a
mocked transport), `npm run typecheck`, `npm run lint`, `npm run build`, and
`npx playwright test` (desktop 1440px, tablet 768px, mobile 375px and narrow
320px; light and dark mode; keyboard-only audit; export; overflow checks).
The Playwright report test streams `tests/fixtures/morrow-report.json`, which
an integration test keeps identical to current auditor output
(`WRITE_REPORT_FIXTURE=1 npx vitest run tests/integration/audit-run.test.ts`
regenerates it).

Test coverage includes DNS pinning/rebinding, private URL validation,
redirects, compressed expansion, robots restrictions (a single robots.txt
download per origin), soft-404 HTML at machine-readable paths, malformed JSON,
XML and OpenAPI, Linkset validation, secret redaction, prompt-injection text in
resources, bounded link checks, MCP endpoint probing without tool calls,
cancellation, multilingual action recognition with false-positive guards,
report migration, evidence references, slot release, provider failure, and
exports.

Not verified here: Docker build/start, a live paid AI provider, and some third
party sites that rate-limit unknown clients (SiteLens reports their robots
policy as unknown and fetches nothing else).
