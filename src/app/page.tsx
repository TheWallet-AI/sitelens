import Link from "next/link";
import AuditForm from "../components/audit-form";
import { loadAIConfig } from "../server/ai/provider";
export const dynamic = "force-dynamic";
export default function Home() {
  let aiEnabled = false;
  try {
    aiEnabled = !!loadAIConfig();
  } catch {}
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="SiteLens home">
          <span className="lens">◉</span> SiteLens
          <span className="byline">BY INFOHOLDER</span>
        </Link>
        <a
          className="source-link"
          href="https://github.com/TheWallet-AI/sitelens"
          target="_blank"
          rel="noreferrer"
        >
          Open source <span aria-hidden="true">↗</span>
        </a>
      </header>
      <section className="hero">
        <div className="eyebrow">
          <span className="dot" /> A CLEARER VIEW OF YOUR WEBSITE
        </div>
        <h1>
          Can they read it?
          <br />
          <span>Can customers act?</span>
        </h1>
        <p className="intro">
          See what a crawler can read, what your business makes clear, and where
          the next step gets lost.
        </p>
        <div className="tags">
          <span>Evidence, not guesswork</span>
          <span>No account needed</span>
          <span>Your site stays untouched</span>
        </div>
      </section>
      <AuditForm aiEnabled={aiEnabled} />
      <section className="principles" aria-label="What SiteLens checks">
        {[
          [
            "01",
            "Read",
            "Public pages, crawl rules, and content that can actually be retrieved.",
          ],
          [
            "02",
            "Understand",
            "Business information and structured content. Optional AI explains the evidence.",
          ],
          [
            "03",
            "Act",
            "Contact and customer action links that give visitors somewhere to go next.",
          ],
        ].map(([n, title, text]) => (
          <article key={n}>
            <span className="number">{n}</span>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <footer>
        <span>Infoholder SiteLens · Open source by Infoholder Studio</span>
        <p>
          A readiness check is not a ranking, indexing, or AI citation
          guarantee.
        </p>
      </footer>
    </main>
  );
}
