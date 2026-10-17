# Security

Do not publish exploitable details, credentials, or private audit data in public issues. Use GitHub private vulnerability reporting when available; otherwise contact the repository maintainers privately before disclosure.

The crawler validates URLs and all resolved addresses, pins the connection address, revalidates redirects, and bounds time and decoded content. Keep an outbound firewall blocking internal services as defense in depth. The application is not a general-purpose proxy.

Public hosting requires gateway abuse controls and AI spending limits. Concurrency limits are process-local. Configure a trusted AI endpoint: its URL and credentials are operator-controlled and are not subject to public-site crawling restrictions. Never expose environment secrets to client components.

Machine-readable files are fetched through the same transport (GET only, no cookies or credentials, SSRF and DNS-rebinding checks, decoded byte caps, compression bounded by the decoded cap, redirect revalidation, robots policy). JSON, Markdown, plain text and XML are parsed by dedicated bounded code paths, never by the HTML extractor. Declared MCP endpoints and links are only probed for HTTP status on the audited host; tools are never called and authorization is never attempted. Excerpts that look like credentials or internal addresses are redacted before they enter a report.

AI evidence is untrusted input. Schema and reference validation do not prove semantic correctness or eliminate prompt injection. Review generated recommendations before acting on them.
