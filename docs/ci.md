# Running SiteLens in CI

`bin/sitelens.mjs audit <url>` runs one audit and exits with a code your pipeline can act on.
It is the same audit as the web app: public URLs only (no IP addresses, private hosts, ports or
credentials), robots.txt is followed, only GET requests, bounded pages and bytes, no JavaScript,
no forms. AI analysis is off unless `--ai` is passed.

## Options

| Option | Meaning |
| --- | --- |
| `--mode page\|site` | `page`: only this page (plus site-wide files); `site`: also sampled pages. Default: `site` for a homepage, `page` otherwise. |
| `--format ci\|json\|markdown` | `ci` (default): one ASCII line per item; `json`: the full `agent-readiness/1` report plus a `ci` verdict; `markdown`: the readable report. |
| `--fail-on fail\|warning` | Which check status fails the run. Default `fail`. |
| `--strict-optional` | Broken optional machine-readable files count like any other check. |
| `--unknown-fails` | Checks that could not be decided make the run exit `3`. |
| `--output <file>` | Also write the JSON report with the verdict to a file (for artifacts). |
| `--ai` | Run the optional AI analysis (needs `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`). |

## Verdict (`sitelens-ci/1`)

```json
{ "contract": "sitelens-ci/1", "outcome": "pass|fail|unknown", "exitCode": 0, "failOn": "fail",
  "inputUrl": "...", "completedAt": "...", "pagesRead": 3,
  "definite": [], "unknown": [], "optional": [], "below": [] }
```

- `definite`: checks that failed (or warned, with `--fail-on warning`) on evidence that was read.
- `unknown`: checks that could not be decided. They do not fail the run unless `--unknown-fails`.
- `optional`: checks on optional machine-readable resources that are present but broken. A resource
  the site does not declare is `not_applicable` and is not listed; a missing optional protocol never
  fails a run. An unsafe resource (`machine_resource_unsafe`) is always `definite`.
- `below`: warnings under the threshold.

Exit codes: `0` pass, `1` definite failures, `2` usage error or URL not accepted, `3` could not tell
(no page was read — a network problem is not reported as a site failure).

## GitHub Actions

```yaml
- uses: actions/checkout@v4
  with: { repository: TheWallet-AI/sitelens, path: sitelens }
- uses: actions/setup-node@v4
  with: { node-version: 22 }
- run: npm ci
  working-directory: sitelens
- run: node sitelens/bin/sitelens.mjs audit https://your-site.example --output sitelens-report.json
- uses: actions/upload-artifact@v4
  if: always()
  with: { name: sitelens-report, path: sitelens-report.json }
```

Run it after your deployment step against the deployed URL. A site that is intentionally not
indexed yet (a draft behind `noindex`) reports a `robots-meta` warning; it fails only with
`--fail-on warning`.
