# Security

Do not publish exploitable details, credentials, or private audit data in public issues. Use GitHub private vulnerability reporting when available; otherwise contact the repository maintainers privately before disclosure.

The crawler validates URLs and all resolved addresses, pins the connection address, revalidates redirects, and bounds time and decoded content. Keep an outbound firewall blocking internal services as defense in depth. The application is not a general-purpose proxy.

Public hosting requires gateway abuse controls and AI spending limits. Concurrency limits are process-local. Configure a trusted AI endpoint: its URL and credentials are operator-controlled and are not subject to public-site crawling restrictions. Never expose environment secrets to client components.

AI evidence is untrusted input. Schema and reference validation do not prove semantic correctness or eliminate prompt injection. Review generated recommendations before acting on them.
