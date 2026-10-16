# Initial validation

Validated locally on Node.js 24 with npm: unit/integration tests, TypeScript, ESLint, and the Next.js production build. CI targets Node.js 22. Test coverage includes DNS pinning/rebinding, private URL validation, redirects, compressed expansion, robots restrictions, extraction, evidence references, request cancellation, slot release, provider failure/output limits, and exports.

Not verified locally: Chromium UI tests (the browser download returned an invalid ZIP and the local dev server reported an unavailable network-interface syscall), Docker build/start (Docker is unavailable), and a live paid AI provider (no model credentials configured). The CI workflow includes Chromium tests but its remote outcome must be inspected independently.

This initial release uses native Node HTTP(S) with a pinned DNS lookup rather than Undici. Robots decisions are cached per URL during an audit; robots files can be fetched more than once per origin. All such downloads share the audit budget. Operational and service-area checks inspect structured metadata and do not claim full natural-language understanding.
