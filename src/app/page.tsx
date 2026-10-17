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
          <span className="lens" aria-hidden="true">
            ◉
          </span>{" "}
          SiteLens
          <span className="byline">OPEN SOURCE</span>
        </Link>
        <a
          className="source-link"
          href="https://github.com/TheWallet-AI/sitelens"
          target="_blank"
          rel="noreferrer"
        >
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </header>
      <section className="hero">
        <div className="eyebrow">
          <span className="dot" /> AI DISCOVERABILITY &amp; AGENT READINESS
        </div>
        <h1>
          See what search engines and AI agents
          <span> can actually understand about your website.</span>
        </h1>
        <p className="intro">
          SiteLens reads your public pages and machine-readable files the way a
          crawler would, then shows what it found, the evidence behind every
          finding, and the next step a customer can take.
        </p>
        <div className="tags">
          <span>Evidence, not guesswork</span>
          <span>No account needed</span>
          <span>Read-only: your site stays untouched</span>
        </div>
      </section>
      <AuditForm aiEnabled={aiEnabled} />
      <section className="principles" aria-label="What SiteLens checks">
        {[
          [
            "01",
            "AI can find it",
            "Crawl rules, sitemap, canonical addresses and discovery files such as llms.txt.",
          ],
          [
            "02",
            "AI can understand it",
            "Who you are, what you offer and where: titles, descriptions, structured data and AI profiles.",
          ],
          [
            "03",
            "AI can act on it",
            "Contact and booking links, business action lists and declared agent connections. Declared, not executed.",
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
        <div>
          <span>SiteLens · MIT-licensed, by Infoholder</span>
          <p>
            A readiness check is not a ranking, indexing, or AI citation
            guarantee.
          </p>
        </div>
        <nav aria-label="Related links" className="footer-links">
          <a href="https://www.infoholder.io/app-studio/en/tools/site-check">
            Free hosted website check
          </a>
          <span className="footer-group" aria-label="For agents">
            For agents: <a href="/llms.txt">llms.txt</a> ·{" "}
            <a href="/ai.txt">ai.txt</a> · <a href="/ai.json">ai.json</a>
          </span>
        </nav>
      </footer>
    </main>
  );
}
