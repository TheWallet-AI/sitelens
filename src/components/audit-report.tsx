"use client";
import { useState } from "react";
import type { AuditReport, Check } from "../core/schema";
import { exportReportJson, exportReportMarkdown } from "../core/export";
import { prioritized } from "../core/checks";
import { resourceSpec } from "../core/contract";
import {
  checkTitle,
  DIMENSION_COPY,
  DIMENSION_STATUS,
  RESOURCE_STATE_LABELS,
  STATUS_LABELS,
} from "../core/labels";

/** Infoholder's hosted checker. No report data is put in the link. */
const HOSTED_CHECK = "https://www.infoholder.io/app-studio/en/tools/site-check";

const STATUS_ICON: Record<Check["status"], string> = {
  pass: "✓",
  warning: "!",
  fail: "✕",
  unknown: "?",
  not_applicable: "–",
};

function download(content: string, ext: "json" | "md", host: string) {
  const url = URL.createObjectURL(
    new Blob([content], {
      type: ext === "json" ? "application/json" : "text/markdown",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `sitelens-${host.replace(/[^a-z0-9.-]/gi, "_")}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StatusBadge({ status }: { status: Check["status"] }) {
  return (
    <span className={`badge ${status}`}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span>{" "}
      {STATUS_LABELS[status]}
    </span>
  );
}

function EvidenceLinks({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <p className="cite">
      Evidence:{" "}
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <a href={`#${id}`}>{id}</a>
        </span>
      ))}
    </p>
  );
}

function FindingCard({ check }: { check: Check }) {
  return (
    <article className={`finding-card ${check.status}`} data-check={check.id}>
      <div className="finding-top">
        <h4>{checkTitle(check)}</h4>
        <StatusBadge status={check.status} />
      </div>
      <p>{check.explanation}</p>
      {check.remediation && (
        <p className="fix">
          <strong>How to fix:</strong> {check.remediation}
        </p>
      )}
      <details className="more">
        <summary>Details</summary>
        {check.limitation && <p>Limitation: {check.limitation}</p>}
        {check.evidenceKind && (
          <p>
            Basis:{" "}
            {check.evidenceKind === "declared"
              ? "declared by the site itself, not verified"
              : check.evidenceKind.replace(/_/g, " ")}
          </p>
        )}
        {check.findingCodes?.length ? (
          <p>
            Finding codes: <code>{check.findingCodes.join(", ")}</code>
          </p>
        ) : null}
        <EvidenceLinks ids={check.evidenceIds} />
      </details>
    </article>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="check-list">
      {checks.map((c) => (
        <li key={c.id} data-check={c.id}>
          <StatusBadge status={c.status} />
          <div>
            <strong>{checkTitle(c)}</strong>
            <p>{c.explanation}</p>
            <EvidenceLinks ids={c.evidenceIds} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function AuditReportView({ report }: { report: AuditReport }) {
  const [exported, setExported] = useState("");
  const host = (() => {
    try {
      return new URL(report.finalUrl).hostname;
    } catch {
      return report.finalUrl;
    }
  })();
  const ordered = prioritized(report.checks);
  const attention = ordered.filter(
    (c) => c.status === "warning" || c.status === "fail",
  );
  const unknown = ordered.filter((c) => c.status === "unknown");
  const passed = ordered.filter((c) => c.status === "pass");
  const notApplicable = ordered.filter((c) => c.status === "not_applicable");
  const found = report.resources.filter(
    (r) => r.state !== "not_found" && r.state !== "not_applicable",
  );
  const save = (ext: "json" | "md") => {
    download(
      ext === "json" ? exportReportJson(report) : exportReportMarkdown(report),
      ext,
      host,
    );
    setExported(
      ext === "json"
        ? "JSON report downloaded."
        : "Markdown report downloaded.",
    );
  };
  return (
    <section className="report" aria-labelledby="report-title">
      <header className="report-heading">
        <div className="report-title">
          <div className="eyebrow">REPORT</div>
          <h2 id="report-title">{host}</h2>
          <p className="url">{report.finalUrl}</p>
          <p className="meta">
            {report.coverage.retrieved} of {report.coverage.attempted} pages
            read · {found.length} of {report.resources.length} machine-readable
            files found · Completed{" "}
            <time dateTime={report.completedAt}>
              {new Date(report.completedAt).toLocaleString("en-US")}
            </time>
          </p>
        </div>
        <div className="download-actions">
          <button className="secondary" onClick={() => save("md")}>
            Download Markdown
          </button>
          <button className="secondary" onClick={() => save("json")}>
            Download JSON
          </button>
          <span role="status" aria-live="polite" className="export-status">
            {exported}
          </span>
        </div>
      </header>

      <div className="readiness" aria-label="Readiness by question">
        {report.readiness.map((d) => (
          <article
            key={d.dimension}
            className={`dimension ${d.status}`}
            data-dimension={d.dimension}
          >
            <h3>{DIMENSION_COPY[d.dimension].title}</h3>
            <p className="question">{DIMENSION_COPY[d.dimension].question}</p>
            <p className="dimension-status">
              <span aria-hidden="true" className="dot-status" />{" "}
              {DIMENSION_STATUS[d.status]}
            </p>
            <p className="counts">
              {d.passed} passed · {d.attention} need attention · {d.unknown}{" "}
              unknown
              {d.notApplicable ? ` · ${d.notApplicable} not applicable` : ""}
            </p>
          </article>
        ))}
      </div>
      <p className="muted small">
        These are counts of individual checks, not a score or ranking. A
        dimension is &ldquo;needs attention&rdquo; when any check in it warns;
        &ldquo;could not be established&rdquo; when nothing in it could be
        checked.
      </p>

      <section className="block" aria-labelledby="fix-first">
        <h3 id="fix-first">What to fix first</h3>
        {attention.length ? (
          <div className="finding-grid">
            {attention.map((c) => (
              <FindingCard key={c.id} check={c} />
            ))}
          </div>
        ) : (
          <p className="empty">Nothing needs attention in what we checked.</p>
        )}
      </section>

      <section className="block" aria-labelledby="machine-files">
        <h3 id="machine-files">Files for search engines and AI agents</h3>
        <p className="muted">
          Optional conventions such as llms.txt, ai.json and MCP declarations
          are not required; most websites do not publish them. Declared tools
          and actions are self-reported and were not invoked.
        </p>
        <div className="table-wrap">
          <table className="resources">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Status</th>
                <th scope="col">What we observed</th>
              </tr>
            </thead>
            <tbody>
              {report.resources.map((r) => {
                const spec = resourceSpec(r.kind);
                return (
                  <tr key={r.kind} data-resource={r.kind} data-state={r.state}>
                    <th scope="row">
                      <code>{spec?.path ?? r.kind}</code>
                      <span className="basis">{spec?.basis}</span>
                    </th>
                    <td>
                      <span className={`state ${r.state}`}>
                        {RESOURCE_STATE_LABELS[r.state] ?? r.state}
                      </span>
                      {r.httpStatus && r.state !== "not_found" ? (
                        <span className="http">HTTP {r.httpStatus}</span>
                      ) : null}
                    </td>
                    <td>
                      {r.summary}
                      {r.declared.tools?.length ? (
                        <span className="declared">
                          {" "}
                          Declared tools:{" "}
                          {r.declared.tools.slice(0, 8).join(", ")}
                        </span>
                      ) : null}
                      {r.evidenceId ? (
                        <>
                          {" "}
                          <a href={`#${r.evidenceId}`}>Excerpt</a>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {unknown.length > 0 && (
        <details className="block group">
          <summary>What we could not establish ({unknown.length})</summary>
          <CheckList checks={unknown} />
        </details>
      )}
      <details className="block group">
        <summary>What looks good ({passed.length})</summary>
        <CheckList checks={passed} />
      </details>
      {notApplicable.length > 0 && (
        <details className="block group">
          <summary>Not applicable ({notApplicable.length})</summary>
          <CheckList checks={notApplicable} />
        </details>
      )}

      {report.aiAnalysis && (
        <section className="ai-section block">
          <div className="eyebrow">
            AI INTERPRETATION · VERIFY AGAINST SOURCES
          </div>
          <h3>Your business through the evidence</h3>
          {[
            report.aiAnalysis.summary,
            ...report.aiAnalysis.answers,
            ...report.aiAnalysis.improvements,
          ].map((claim, i) => (
            <article key={i}>
              <strong>
                {"question" in claim
                  ? String(claim.question)
                  : i === 0
                    ? "Summary"
                    : "Suggested improvement"}
              </strong>
              <p>{claim.text}</p>
              <small>
                {claim.state} · <EvidenceLinks ids={claim.evidenceIds} />
              </small>
            </article>
          ))}
        </section>
      )}

      <details className="evidence block group">
        <summary>Source evidence ({report.evidence.length})</summary>
        {report.coverage.notes.map((n) => (
          <p className="muted" key={n}>
            {n}
          </p>
        ))}
        {report.pages
          .filter((p) => p.error)
          .map((p, i) => (
            <p key={i} className="muted">
              Skipped {p.url}: {p.error}
            </p>
          ))}
        {report.evidence.map((e) => (
          <details key={e.id} id={e.id}>
            <summary>
              {e.id} · {new URL(e.finalUrl).pathname}
            </summary>
            <p className="url">{e.finalUrl}</p>
            <small>
              Retrieved {e.retrievedAt} · {e.locationHint}
            </small>
            <blockquote>{e.excerpt}</blockquote>
          </details>
        ))}
      </details>

      {report.recommendations.length > 0 && (
        <section className="recommendations block">
          <div className="eyebrow">OPTIONAL NEXT STEPS</div>
          <h3>If you want help with this</h3>
          <p>
            You can make these improvements yourself with any tool. These links
            go to related Infoholder Studio solutions; no report data is
            included in them.
          </p>
          {report.recommendations.map((r) => (
            <article key={r.id}>
              <p>{r.reason}</p>
              <a href={r.url} target="_blank" rel="noreferrer">
                Explore with Infoholder Studio <span aria-hidden="true">↗</span>
              </a>
            </article>
          ))}
        </section>
      )}

      <section className="limitations block" aria-labelledby="limits">
        <h3 id="limits">What this report cannot tell you</h3>
        <ul>
          {report.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <aside className="hosted-check block" aria-labelledby="hosted-check">
        <h3 id="hosted-check">Prefer a hosted check?</h3>
        <p>
          Infoholder&apos;s free website checker uses the same agent-readiness
          contract with no setup, and adds a score, more SEO checks, reports in
          five languages and an optional AI reading that needs no key of your
          own. This report is not sent there.
        </p>
        <a href={HOSTED_CHECK} target="_blank" rel="noreferrer">
          Open the free website checker <span aria-hidden="true">↗</span>
        </a>
      </aside>
    </section>
  );
}
