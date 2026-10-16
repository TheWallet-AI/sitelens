# Optional Infoholder integration

Set `INFOHOLDER_ENABLED=true` to enable the verified booking and event-registration solution links configured in `src/integrations/infoholder/config.ts`. Otherwise recommendations are empty. No Infoholder account, token, or subscription is required to run SiteLens.

Recommendations appear only when the next-step check finds no recognized link. Copy states the relevant business condition rather than assuming every website needs booking or events. Links contain no audit data. There is no server-side Infoholder request and no report import.

Future draft import, hosted model quotas, and scheduled monitoring need separate opt-in flows, authentication, privacy contracts, and verified service APIs. They are not implemented in this version.

The MIT license covers this code. Infoholder and third-party product names remain their owners' names; forks should describe modifications honestly and must not imply endorsement.
