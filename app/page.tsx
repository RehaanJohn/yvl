import Link from "next/link";
import {
  ArrowUpRight,
  Activity,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

export default function Home() {
  return (
    <main className="home-shell">
      <section className="home-hero">
        <div className="hero-copy">
          <span className="soft-pill">
            <span className="status-dot" />
            Volatility-aware lending
          </span>
          <h1>
            Lending that moves
            <br />
            with the market.
          </h1>
          <p>
            Your collateral changes. Your borrowing power should too. A clearer
            way to borrow, with risk built into every decision.
          </p>
          <div className="hero-actions">
            <Link href="/dashboard" className="btn-primary">
              Explore markets <ArrowUpRight size={18} />
            </Link>
            <Link href="/dashboard?demo=1" className="btn-secondary">
              Try the crash demo
            </Link>
          </div>
          <span className="hero-note">
            Built on Arbitrum Sepolia. Testnet assets only.
          </span>
        </div>
        <div className="hero-visual glass">
          <div className="visual-header">
            <span className="asset-heading">
              <span className="token-mark token-link">⬡</span>
              <strong>Adaptive borrowing</strong>
            </span>
            <ShieldCheck size={21} />
          </div>
          <div className="visual-main">
            <span className="muted">Risk changes. Limits respond.</span>
            <div className="adaptive-ring">
              <svg viewBox="0 0 200 200" aria-hidden="true">
                <circle
                  cx="100"
                  cy="100"
                  r="82"
                  fill="none"
                  stroke="rgba(0,122,255,.09)"
                  strokeWidth="10"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="82"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="10"
                  strokeDasharray="385 515"
                  strokeLinecap="round"
                  transform="rotate(-90 100 100)"
                />
              </svg>
              <span>
                <strong>
                  75<span>%</span>
                </strong>
                <span className="muted">Low-risk LTV</span>
              </span>
            </div>
          </div>
          <div className="adaptive-scale">
            <span>
              Low risk <strong>75%</strong>
            </span>
            <span>
              Moderate <strong>55%</strong>
            </span>
            <span>
              High risk <strong>35%</strong>
            </span>
          </div>
          <p className="visual-note">
            Default risk policy · illustrative preview
          </p>
        </div>
      </section>
      <section id="how-it-works" className="how-section">
        <div>
          <span className="muted">A little more responsive.</span>
          <h2>A lot more aware.</h2>
        </div>
        <div className="how-grid">
          <article>
            <Activity size={23} />
            <h3>Observe the market</h3>
            <p>
              Price observations build a picture of your collateral’s
              volatility.
            </p>
          </article>
          <article>
            <SlidersHorizontal size={23} />
            <h3>Adapt the limit</h3>
            <p>Borrowing limits respond as assets move between risk bands.</p>
          </article>
          <article>
            <ShieldCheck size={23} />
            <h3>Know your position</h3>
            <p>
              See your available borrowing power and position health in one
              place.
            </p>
          </article>
        </div>
      </section>
      <footer className="page-footer">
        <span>YVL · Yield Volatility Lending</span>
        <span>Designed for changing markets.</span>
      </footer>
    </main>
  );
}
