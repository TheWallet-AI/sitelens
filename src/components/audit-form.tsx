"use client";
import { useRef, useState } from "react";
import type { AuditReport } from "../core/schema";
import { decodeEvents } from "../core/stream";
import AuditReportView from "./audit-report";
export default function AuditForm({ aiEnabled }: { aiEnabled: boolean }) {
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [report, setReport] = useState<AuditReport | null>(null),
    [warnings, setWarnings] = useState<string[]>([]),
    [progress, setProgress] = useState({ pages: 0, files: 0 });
  const abort = useRef<AbortController | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setReport(null);
    setWarnings([]);
    setProgress({ pages: 0, files: 0 });
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw Error();
    } catch {
      setError("Enter a complete website URL, starting with https://.");
      return;
    }
    setBusy(true);
    setMessage("Starting your website check…");
    const controller = new AbortController();
    abort.current = controller;
    let complete = false;
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: parsed.href }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "The audit could not start.");
      }
      if (!response.body) throw new Error("No report stream received.");
      for await (const event of decodeEvents(response.body)) {
        if (event.type === "result") {
          setReport(event.report);
          complete = true;
          setMessage("Your report is ready.");
        } else if (event.type === "warning")
          setWarnings((w) => [...w, event.message]);
        else if (event.type === "error") throw new Error(event.message);
        else if (event.type === "page") {
          setProgress((p) => ({ ...p, pages: p.pages + 1 }));
          setMessage(event.message);
        } else if (event.type === "resource") {
          setProgress((p) => ({ ...p, files: p.files + 1 }));
          setMessage(`Checked ${event.message}`);
        } else setMessage(event.message);
      }
      if (!complete)
        throw new Error("The audit ended before a report was received.");
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Analysis cancelled."
          : e instanceof Error
            ? e.message
            : "The audit could not complete.",
      );
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  return (
    <>
      <section className="audit-card">
        <div className="card-heading">
          <h2>Analyze a website</h2>
          <span className="mode">
            {aiEnabled ? "AI + core checks" : "Core checks"}
          </span>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="website">Your website URL</label>
          <div className="input-row">
            <input
              id="website"
              type="url"
              placeholder="https://your-business.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
              required
              autoComplete="url"
            />
            <button disabled={busy} type="submit">
              {busy ? "Analyzing…" : "Analyze a website"}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
          <p className="scope">
            Up to 5 public pages and 11 machine-readable files · Usually under
            90 seconds · Read-only: no forms, sign-in or transactions
          </p>
          <p className="privacy">
            {aiEnabled
              ? "AI analysis sends bounded public page text to the model provider configured by this deployment."
              : "AI is not configured on this deployment. You will receive evidence-backed core checks."}{" "}
            Reports stay in this session and are not automatically sent to
            Infoholder.
          </p>
        </form>
        {busy && (
          <button
            type="button"
            className="secondary cancel"
            onClick={() => abort.current?.abort()}
          >
            Cancel analysis
          </button>
        )}
        <div
          role="status"
          aria-live="polite"
          className={busy ? "progress" : "status"}
        >
          {busy && <span className="spinner" aria-hidden="true" />}
          <span>
            {message}
            {busy && (progress.pages > 0 || progress.files > 0) && (
              <span className="progress-count">
                {" "}
                · {progress.pages} page{progress.pages === 1 ? "" : "s"},{" "}
                {progress.files} file
                {progress.files === 1 ? "" : "s"}
              </span>
            )}
          </span>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      {warnings.length > 0 && (
        <aside className="notice">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </aside>
      )}
      {report && <AuditReportView report={report} />}
    </>
  );
}
