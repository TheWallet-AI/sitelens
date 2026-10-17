export const LIMITS = Object.freeze({
  pages: 5,
  depth: 1,
  audits: 2,
  fetchConcurrency: 2,
  totalMs: 90_000,
  requestMs: 10_000,
  redirects: 3,
  pageBytes: 2 * 1024 * 1024,
  totalBytes: 10 * 1024 * 1024,
  pageText: 12_000,
  totalText: 40_000,
  /** Machine-readable resources probed per audit (see contract RESOURCE_KINDS). */
  resourceProbes: 11,
  /** Concurrent resource requests. */
  resourceConcurrency: 3,
  /** Decoded byte cap for a single machine-readable resource. */
  resourceBytes: 512 * 1024,
  /** Per-request deadline for a resource probe. */
  resourceMs: 6_000,
  /** Deadline for the whole resource phase. */
  resourcePhaseMs: 25_000,
  /** Declared same-site links verified (status only, body never read). */
  resourceLinkChecks: 4,
  /** Characters kept from each resource as cited evidence. */
  resourceExcerpt: 1_500,
});
