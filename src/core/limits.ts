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
});
