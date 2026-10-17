# Agent-readiness contract (`agent-readiness/1`)

This document defines the shared vocabulary SiteLens uses to describe how
well a website can be found, understood and acted on by search engines and AI
agents. Other tools can adopt it without importing SiteLens code. The hosted
[Infoholder website check](https://www.infoholder.io/app-studio/en/tools/site-check)
implements the same vocabulary independently.

The machine-readable copy is [`contract/agent-readiness.v1.json`](../contract/agent-readiness.v1.json),
generated from [`src/core/contract.ts`](../src/core/contract.ts). A unit test
keeps them identical.

## Versioning

- The contract version changes only for breaking changes (renaming or
  removing a state, code or resource kind, or changing a meaning).
- Adding a resource kind, finding code or evidence kind is additive and keeps
  the version.
- Retired finding codes are never reused.

## Readiness dimensions

| Dimension    | Question                                                       |
| ------------ | -------------------------------------------------------------- |
| `find`       | Can crawlers reach the pages and the files that point to them? |
| `understand` | Is it clear who the business is, what it offers and where?     |
| `act`        | Is there a clear next step for a customer, or for an agent?    |

There is deliberately no aggregate score. Implementations report counts per
dimension and keep unknown results separate from failures.

## Resource kinds

| Kind               | Path                                 | Basis                              |
| ------------------ | ------------------------------------ | ---------------------------------- |
| `robots_txt`       | `/robots.txt`                        | standard (RFC 9309)                |
| `sitemap_xml`      | `/sitemap.xml` or robots `Sitemap:`  | standard (sitemaps.org)            |
| `llms_txt`         | `/llms.txt`                          | convention (llmstxt.org)           |
| `llms_full_txt`    | `/llms-full.txt`                     | convention                         |
| `ai_txt`           | `/ai.txt`                            | convention                         |
| `ai_json`          | `/ai.json`                           | convention                         |
| `business_actions` | `/.well-known/business-actions.json` | vendor (documented below)          |
| `mcp_discovery`    | `/.well-known/mcp.json`              | convention                         |
| `mcp_server_card`  | `/.well-known/mcp/server-card.json`  | convention (MCP server card draft) |
| `api_catalog`      | `/.well-known/api-catalog`           | standard (RFC 9727 Linkset)        |
| `openapi`          | `/openapi.json`                      | standard (OpenAPI 3.x)             |

Conventions are useful but not universally supported. Publishing one does
not guarantee that any AI system reads it, indexes the site, cites it, or
calls its tools.

Most resources are optional. An absent optional resource is reported as
`not_found` with check status `not_applicable`; it is not a failure. A local
restaurant without an API or MCP server can be perfectly discoverable.

## Resource states

| State            | Meaning                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `not_found`      | HTTP 404/410, or an HTML page (a fallback "soft 404") at a non-HTML path.                |
| `valid`          | Retrieved, parseable, and structurally correct for its kind.                             |
| `malformed`      | Retrieved but not parseable or missing required structure.                               |
| `inconsistent`   | Parseable, but it points to another site, or declared links/endpoints do not resolve.    |
| `unsafe`         | It appears to expose credentials or internal addresses, or uses script/data URL schemes. |
| `blocked`        | robots.txt disallows the auditor, or the server answered 401/403.                        |
| `unknown`        | Network error, timeout, 429/5xx, size limit, or an unavailable robots policy.            |
| `not_applicable` | Not relevant for the audited site.                                                       |

Presence is not validity. Validity is not working execution. Working
execution is not authorized access.

## Evidence kinds

`observed` (fetched and read), `declared` (claimed by the site itself, such
as tools in a server card), `inferred` (deterministic rule over observations),
`ai_interpretation` (optional AI output; must be verified), `unverifiable`
(authentication, transactions).

## Action reach

`not_available`, `ai_readable` (an AI system can understand the action and
send a person to its URL; the person completes it) and `ai_executable` (an
external agent can complete it end to end). An auditor can only ever report a
site's _declared_ reach; it cannot verify execution without an explicitly
authorized test environment.

## Finding codes

Each code has a default dimension and severity (`critical`, `warning`,
`info`). See `findings` in the JSON contract for the full table:
`llms_txt_missing`, `llms_txt_malformed`, `llms_txt_broken_links`,
`llms_full_txt_malformed`, `ai_txt_malformed`, `ai_json_malformed`,
`ai_json_inconsistent`, `business_actions_malformed`,
`business_actions_inconsistent`, `mcp_declaration_malformed`,
`mcp_declared_unverified`, `mcp_endpoint_unreachable`,
`api_catalog_malformed`, `openapi_malformed`, `sitemap_missing`,
`sitemap_malformed`, `robots_blocks_ai_agents`, `machine_resource_unsafe`,
`machine_resource_wrong_origin`.

## Document formats

### llms.txt

Markdown. The first non-empty line must be an H1 (`# Name`). Links use
Markdown syntax; links with script or data schemes make the file `unsafe`.

### ai.txt

Plain text with notes for AI systems. It has no single standard and never
overrides robots.txt or grants authorization.

### ai.json

Any JSON object is structurally `valid`. Files declaring
`"spec": "infoholder-ai-json/1"` are validated further:

```json
{
  "spec": "infoholder-ai-json/1",
  "name": "Morrow Coffee (demo business)",
  "url": "https://morrow-coffee.example.com",
  "description": "optional",
  "status": "live | unclaimed_preview",
  "generator": "Infoholder Studio",
  "generatedAt": "ISO 8601",
  "resources": [{ "kind": "<resource kind>", "url": "https://…" }],
  "capabilities": [
    {
      "type": "<action type>",
      "url": "https://…",
      "reach": "ai_readable | ai_executable"
    }
  ],
  "agent": {
    "protocol": "mcp",
    "transport": "streamable-http",
    "url": "https://…",
    "authentication": "none",
    "access": "read_only",
    "tools": ["…"]
  },
  "limitations": ["…"]
}
```

`name`, `url` (on the same site) and `resources` (array) are required.
`capabilities` entries must use a known action type, a known reach and an
absolute URL. `agent` is optional. Static files never contain live prices,
stock or availability.

### Business action manifest

`/.well-known/business-actions.json`, version 1, published by Infoholder
Studio:

```json
{
  "version": 1,
  "business": { "name": "…", "url": "https://…", "description": "optional" },
  "actions": [
    {
      "type": "reservation",
      "url": "https://…/reservations",
      "reach": "ai_readable"
    }
  ]
}
```

Action types: `order`, `reservation`, `vip_reservation`, `purchase`,
`event_booking`, `membership`, `contact`, `visit`. Disabled actions are not
listed. `business.url` and action URLs should be on the audited site.

### MCP declarations

A JSON object with at least one HTTPS endpoint in a common location (`url`,
`endpoint`, `transport.url`, `endpoints.*`, `remotes[].url`). Tools listed in
the file are self-declared. Auditors may make one GET request to a same-site
endpoint to see whether it responds and whether a 401 advertises RFC 9728
protected-resource metadata; they never call tools or attempt authorization.

### API catalog

An RFC 9727 Linkset (`{"linkset": [{"anchor": "https://…", "<relation>": [{"href": "…"}]}]}`)
served as `application/linkset+json`.

### OpenAPI

JSON with `"openapi": "3.x.y"`, `info.title` and `info.version`. Only structure
is checked; operations are never called.

## Fixtures

[`contract/fixtures.v1.json`](../contract/fixtures.v1.json) lists sample
files with the state and finding codes every implementation must produce.
Files prefixed `infoholder-morrow-` are real Infoholder Studio generator
output for a fictional business; Infoholder's test suite regenerates them and
fails if they drift.
