# Infoholder SiteLens

An open-source, evidence-based auditor of AI discoverability and agent readiness, built with Next.js 16. See what search engines and AI agents can actually find, understand and act on across your public website — with the evidence behind every finding.

**Readiness is not a ranking, indexing, or AI citation guarantee.** SiteLens does not query AI search engines or measure actual citations.

## Try the free website checker

Use the [Infoholder free website checker](https://www.infoholder.io/app-studio/en/tools/site-check) in your browser, or self-host SiteLens using the instructions below.

The Infoholder tool and this open-source project may offer different features as they evolve. The link does not imply that the hosted tool runs this exact version of SiteLens.

## Features

- Sample a homepage and up to four same-origin links, one level deep.
- Check robots rules, public HTML, titles, descriptions, headings, canonical links, structured data, contact links, and customer actions. Next-step links are recognized in English, Simplified and Traditional Chinese, Japanese and Malay.
- Inspect machine-readable files: `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, `ai.txt`, `ai.json`, `/.well-known/business-actions.json`, `/.well-known/mcp.json`, `/.well-known/mcp/server-card.json`, `/.well-known/api-catalog` (RFC 9727) and `openapi.json`. Each is reported as not found, valid, malformed, inconsistent, unsafe, blocked or unknown — presence is not validity, and a declared capability is not a verified one.
- Summarize readiness in three questions — AI can find it, understand it, act on it — with counts instead of a misleading single score.
- Optional OpenAI-compatible AI analysis with evidence references and explicit uncertainty. Deterministic checks never depend on it.
- Stream progress, cancel an audit, inspect evidence, and export JSON or Markdown.
- Optional Infoholder Studio recommendations, disabled by default. No Infoholder account is required.

The vocabulary for resource states and findings is a versioned, documented contract: [docs/agent-readiness-contract.md](docs/agent-readiness-contract.md).

## Quick start

Use Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Basic checks work without an AI key. To enable AI, configure all three variables:

```dotenv
AI_BASE_URL=https://your-provider.example/v1
AI_MODEL=your-model
AI_API_KEY=your-server-side-key
AI_OUTPUT_MODE=json
```

The provider must support `POST /chat/completions`. Set output mode to `text` if JSON response format is unsupported; returned content must still be valid JSON. Credentials stay on the server. Extracted public website text is sent to your configured provider only when AI is enabled. Provider retention and billing policies apply. No live provider is included.

## Production

```sh
npm run build
APP_ORIGIN=https://your-sitelens.example npm start
```

`APP_ORIGIN` is required in production and must exactly match the browser origin. Deploy on a Node.js runtime supporting streaming requests lasting up to 100 seconds. Static export and Edge runtimes are unsupported.

```sh
docker build -t sitelens .
docker run --rm -p 3000:3000 --env-file .env.local -e APP_ORIGIN=http://localhost:3000 sitelens
```

The app limits concurrent audits to two **per process**. Public deployments need gateway rate limiting, budget controls, and an outbound firewall; horizontal replicas do not share a queue. Origin checks are not authentication and command-line clients can call the endpoint.

## Scope and limits

Each audit has a 90-second deadline, 10-second fetch timeout, three redirects per fetch, two concurrent page fetches, 2 MiB per decoded response, 10 MiB total decoded downloads, 12,000 characters per page, and 40,000 evidence characters overall. Robots requests share the download budget. The machine-readable file phase adds at most 11 file requests (512 KiB each, 6-second timeout, three at a time, 25 seconds in total), at most four status-only checks of declared same-site links, and at most one status-only request to a declared same-site MCP endpoint. robots.txt is downloaded once per origin and respected for every file. Redirects and DNS addresses are validated before connection; DNS results are pinned for each request. Private and reserved IP destinations, credentials, nonstandard ports, and HTTPS downgrades are rejected.

SiteLens does not execute JavaScript, submit forms, sign in, bypass robots restrictions, follow query-string links, call MCP tools or APIs, or attempt OAuth. Challenge pages are skipped. An unavailable robots policy produces an unknown result and the page is skipped. HTML extraction and link-keyword checks are heuristic; missing sampled evidence is not proof that information does not exist. Structured data checks inspect parseability and selected entity fields, not schema.org validity or factual accuracy. AI output is schema-checked and reference-checked, but human review is still needed for factual accuracy.

Reports are held in memory and in your browser, not stored in a database. Exports remain under your control. Infrastructure logs and the configured AI provider may have their own retention policies. Audit only public websites you are entitled to access.

## Files for AI systems

A SiteLens deployment serves its own `/llms.txt`, `/llms-full.txt`, `/ai.txt` and `/ai.json` (absolute URLs use `APP_ORIGIN`). They state plainly that the audit endpoint is not a public API and that no MCP server or OpenAPI document is offered.

## Infoholder Studio

Set `INFOHOLDER_ENABLED=true` to show optional booking and event-registration service links when the sampled site has no recognized next-step link. Recommendations are clearly conditional and separate from findings. They do not affect checks and reports are not uploaded to Infoholder.

Possible future integrations include opt-in draft imports, hosted AI quotas, and scheduled monitoring. These are not implemented and no API contract is assumed.

## Development

```sh
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npx playwright test
# or reuse a preinstalled Chromium:
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npx playwright test
```

Core schemas and deterministic checks live in `src/core`; bounded crawling and AI calls are in `src/server`; optional product mappings are in `src/integrations`. Tests use local fixtures and mocked dependencies without paid AI requests. All maintained code, comments, UI, and documentation use English; quoted source evidence may retain its original language.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Licensed under MIT.
