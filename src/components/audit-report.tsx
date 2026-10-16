"use client";
import type { AuditReport } from "../core/schema";
import { exportReportJson, exportReportMarkdown } from "../core/export";
function download(content: string, ext: string) {
  const url = URL.createObjectURL(
    new Blob([content], {
      type: ext === "json" ? "application/json" : "text/markdown",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `sitelens-report.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function AuditReportView({ report }: { report: AuditReport }) {
  return (
    <section className="report" aria-label="Audit report">
      <div className="report-heading">
        <div>
          <div className="eyebrow">YOUR WEBSITE, OBSERVED</div>
          <h2>Here is what we found.</h2>
          <p className="url">{report.finalUrl}</p>
        </div>
        <div className="download-actions">
          <button
            className="secondary"
            onClick={() => download(exportReportMarkdown(report), "md")}
          >
            Markdown ↓
          </button>
          <button
            className="secondary"
            onClick={() => download(exportReportJson(report), "json")}
          >
            JSON ↓
          </button>
        </div>
      </div>
      <div className="coverage">
        <strong>
          {report.coverage.retrieved}
          <span> / {report.coverage.attempted}</span>
        </strong>
        <div>
          attempted pages read
          <p>
            Completed {new Date(report.completedAt).toLocaleString("en-US")}
          </p>
        </div>
      </div>
      {report.coverage.notes.map((n) => (
        <p className="muted" key={n}>
          {n}
        </p>
      ))}
      <div className="findings">
        {(["access", "content", "actions"] as const).map((category) => (
          <section key={category}>
            <h3>
              {
                {
                  access: "Can crawlers read it?",
                  content: "Is the information clear?",
                  actions: "Is there a next step?",
                }[category]
              }
            </h3>
            {report.checks
              .filter((c) => c.category === category)
              .map((c) => (
                <article className="finding" key={c.id}>
                  <span className={`badge ${c.status}`}>
                    {c.status.replace("_", " ")}
                  </span>
                  <div>
                    <p>{c.explanation}</p>
                    {c.evidenceIds.length > 0 && (
                      <small>
                        Source:{" "}
                        {c.evidenceIds.map((id) => (
                          <a key={id} href={`#${id}`}>
                            {id}{" "}
                          </a>
                        ))}
                      </small>
                    )}
                  </div>
                </article>
              ))}
          </section>
        ))}
      </div>
      {report.aiAnalysis && (
        <section className="ai-section">
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
                {claim.state} ·{" "}
                {claim.evidenceIds.map((id) => (
                  <a key={id} href={`#${id}`}>
                    {id}{" "}
                  </a>
                ))}
              </small>
            </article>
          ))}
        </section>
      )}
      <section className="evidence">
        <h3>The source material</h3>
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
      </section>
      {report.recommendations.length > 0 && (
        <section className="recommendations">
          <div className="eyebrow">OPTIONAL NEXT STEPS</div>
          <h3>Put a clearer next step in place.</h3>
          <p>
            You can make these improvements yourself, or explore a relevant
            Infoholder Studio solution. No report data is included in these
            links.
          </p>
          {report.recommendations.map((r) => (
            <article key={r.id}>
              <p>{r.reason}</p>
              <a href={r.url} target="_blank" rel="noreferrer">
                Explore {r.id} with Infoholder Studio ↗
              </a>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
