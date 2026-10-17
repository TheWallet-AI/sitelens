# Optional Infoholder integration

Set `INFOHOLDER_ENABLED=true` to enable the verified booking and event-registration solution links configured in `src/integrations/infoholder/config.ts`. Otherwise recommendations are empty. No Infoholder account, token, or subscription is required to run SiteLens.

Recommendations appear only when the next-step check finds no recognized link. Copy states the relevant business condition rather than assuming every website needs booking or events. Links contain no audit data. There is no server-side Infoholder request and no report import.

Future draft import, hosted model quotas, and scheduled monitoring need separate opt-in flows, authentication, privacy contracts, and verified service APIs. They are not implemented in this version.

The MIT license covers this code. Infoholder and third-party product names remain their owners' names; forks should describe modifications honestly and must not imply endorsement.

## Shared vocabulary with the hosted checker

The hosted [Infoholder website check](https://www.infoholder.io/app-studio/en/tools/site-check) is a separate deployment, not this code. It implements the same [agent-readiness contract](agent-readiness-contract.md) independently and inspects a subset of resources (`llms.txt`, `ai.json`, the business action manifest and MCP server cards, plus robots and sitemap). Both projects test against the same fixtures in `contract/`; the Infoholder fixtures (`infoholder-morrow-*`) are real Studio output for a fictional business. No SiteLens report is sent to Infoholder.
