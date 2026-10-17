/**
 * Patterns that suggest a public machine-readable file exposes something it
 * should not: credentials, private keys, or internal infrastructure
 * addresses. Matches are reported by category only and redacted from every
 * excerpt SiteLens stores, so a report never repeats the secret it found.
 */
const PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { label: "Stripe secret key", pattern: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/g },
  { label: "OpenAI-style API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { label: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  {
    label: "JSON Web Token",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    label: "internal address",
    pattern:
      /\bhttps?:\/\/(?:localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?\b/g,
  },
];

/** Category labels of everything that looks sensitive (deduplicated). */
export function sensitiveFindings(text: string): string[] {
  const found = new Set<string>();
  for (const { label, pattern } of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) found.add(label);
  }
  return [...found];
}

/** Replace every sensitive match with a fixed marker. */
export function redactSensitive(text: string): string {
  let out = text;
  for (const { pattern } of PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}
