"use client";

import { useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Plus,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { useSupportedAssets } from "../web3/useProtocol";
import RiskGaugePanel from "./RiskGaugePanel";
import MarketCard, { TokenMark } from "./MarketCard";
import VaultPanel from "./VaultPanel";
import AdminPanel from "./AdminPanel";
import CrashDemo, { CrashPanelView } from "./CrashDemo";
import type { CrashStep } from "../web3/crashDemo";

const rehearsalMarkets = [
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    volatility: "16.4%",
    ltv: "75",
    band: 0,
    initialized: true,
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    volatility: "18.2%",
    ltv: "75",
    band: 0,
    initialized: true,
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    volatility: "12.8%",
    ltv: "75",
    band: 0,
    initialized: true,
  },
];

function MarketHeading({ rehearsal }: { rehearsal: boolean }) {
  return (
    <div className="section-heading">
      <div>
        <h2>Collateral markets</h2>
        <p>More stability. More borrowing power.</p>
      </div>
      <span className="subtle-label">
        {rehearsal ? "Illustrative market data" : "Live contract readings"}
      </span>
    </div>
  );
}

function PolicyFooter() {
  return (
    <div className="policy-strip">
      <span>
        <span className="status-dot" />
        Adaptive risk policy
      </span>
      <span>
        Low <strong>75%</strong>
      </span>
      <span>
        Moderate <strong>55%</strong>
      </span>
      <span>
        High <strong>35%</strong>
      </span>
      <span className="muted">Default limits · 3pp transition buffer</span>
    </div>
  );
}

function LiveDashboard() {
  const { assets, isLoading, error } = useSupportedAssets();
  const [chosen, setChosen] = useState<`0x${string}`>();
  const selected = chosen && assets.includes(chosen) ? chosen : assets[0];
  return (
    <>
      <MarketHeading rehearsal={false} />
      <RiskGaugePanel
        assets={assets}
        selected={selected}
        onSelect={setChosen}
      />
      {isLoading && assets.length === 0 && (
        <div className="markets-grid">
          {["WETH", "WBTC", "LINK"].map((symbol) => (
            <MarketCard
              key={symbol}
              selected={false}
              onSelect={() => {}}
              market={{
                symbol,
                name: "Reading market…",
                volatility: "—",
                ltv: "—",
                band: 0,
                loading: true,
              }}
            />
          ))}
        </div>
      )}
      {!isLoading && !assets.length && (
        <div className="empty-state glass">
          <Wallet size={25} />
          <h3>
            {error
              ? "Markets are temporarily unavailable"
              : "No markets registered yet"}
          </h3>
          <p>
            {error
              ? "Check your connection or use Rehearsal to preview the protocol."
              : "Register a testnet market below to get started."}
          </p>
        </div>
      )}
      <div className="workspace-grid">
        <section className="position-section">
          <div className="section-heading">
            <div>
              <h2>Your position</h2>
              <p>Select a market to manage your collateral.</p>
            </div>
            <Wallet size={19} className="muted" />
          </div>
          {selected ? (
            <VaultPanel key={selected} assetAddress={selected} assets={assets} onSelect={setChosen} />
          ) : (
            <div className="empty-state glass">
              <p>
                Your lending position will appear here when markets are
                available.
              </p>
            </div>
          )}
        </section>
        <aside>
          <div className="section-heading">
            <div>
              <h2>A protocol under pressure</h2>
              <p>A market shock. An adaptive response.</p>
            </div>
          </div>
          <CrashDemo />
        </aside>
      </div>
      <PolicyFooter />
      <details className="admin-details glass">
        <summary>
          <span>
            <SlidersHorizontal size={17} />
            Market settings
          </span>
          <ChevronDown size={17} />
        </summary>
        <AdminPanel />
      </details>
    </>
  );
}

function RehearsalDashboard() {
  const [selected, setSelected] = useState("LINK");
  const [step, setStep] = useState<CrashStep>(0);
  const [crashed, setCrashed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState<"Deposit" | "Borrow" | "Repay" | "Withdraw">(
    "Deposit",
  );
  const [positions, setPositions] = useState<
    Record<string, { collateral: number; debt: number }>
  >({
    WETH: { collateral: 0, debt: 0 },
    WBTC: { collateral: 0, debt: 0 },
    LINK: { collateral: 100, debt: 500 },
  });
  const [error, setError] = useState("");
  const locked = useRef(false);
  const market = rehearsalMarkets.find((m) => m.symbol === selected)!;
  const price =
    selected === "LINK"
      ? crashed
        ? 7.5
        : 15
      : selected === "WETH"
        ? 2400
        : 64000;
  const ltv = selected === "LINK" && step === 3 ? 0.35 : 0.75;
  const pos = positions[selected];
  const available = Math.max(0, pos.collateral * price * ltv - pos.debt);
  const health = pos.debt
    ? (pos.collateral * price * ltv) / pos.debt
    : Infinity;
  const run = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setStep(0);
    try {
      await new Promise((resolve) => setTimeout(resolve, 650));
      setCrashed(true);
      setStep(1);
      await new Promise((resolve) => setTimeout(resolve, 650));
      setStep(2);
      await new Promise((resolve) => setTimeout(resolve, 650));
      setStep(3);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const action = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    const next = { ...pos };
    const tokenValue = value / price;
    if (tab === "Deposit") next.collateral += tokenValue;
    if (tab === "Borrow") {
      if (value > available) {
        setError("This amount exceeds your available borrowing power.");
        return;
      }
      next.debt += value;
    }
    if (tab === "Repay") next.debt -= Math.min(value, pos.debt);
    if (tab === "Withdraw") {
      if (
        tokenValue > pos.collateral ||
        (pos.collateral - tokenValue) * price * ltv < pos.debt
      ) {
        setError("Keep enough collateral to cover your outstanding debt.");
        return;
      }
      next.collateral -= tokenValue;
    }
    setPositions({ ...positions, [selected]: next });
    setAmount("");
    setError("");
  };
  return (
    <>
      <div className="rehearsal-banner">
        <span>
          <span className="status-dot" />
          <strong>Rehearsal mode</strong> · All prices, positions, and
          transactions are simulated.
        </span>
        <span>Resets when you leave this mode.</span>
      </div>
      <MarketHeading rehearsal />
      <div className="markets-grid">
        {rehearsalMarkets.map((m) => (
          <MarketCard
            key={m.symbol}
            rehearsal
            selected={selected === m.symbol}
            onSelect={() => {
              setSelected(m.symbol);
              setError("");
              setAmount("");
            }}
            market={
              m.symbol === "LINK" && step >= 2
                ? {
                    ...m,
                    volatility: "300.0%",
                    ltv: step === 3 ? "35" : "75",
                    band: step === 3 ? 2 : 0,
                  }
                : m
            }
          />
        ))}
      </div>
      <div className="workspace-grid">
        <section className="position-section">
          <div className="section-heading">
            <div>
              <h2>Your position</h2>
              <p>Practice the flow before your presentation.</p>
            </div>
            <Wallet size={19} className="muted" />
          </div>
          <div className="vault-panel glass">
            <div className="vault-header">
              <span className="asset-heading">
                <TokenMark symbol={selected} />
                <span>
                  <h3>Global vault</h3>
                  <span className="muted">{market.name}</span>
                </span>
              </span>
              <span
                className={`status-chip ${health < 0.95 ? "danger" : "safe"}`}
              >
                <span className="status-dot" />
                {health < 0.95 ? "At risk" : "Healthy"}
              </span>
            </div>
            <label className="amount-label" htmlFor="rehearsal-asset">Collateral market</label>
            <select id="rehearsal-asset" className="vault-asset-select" value={selected}
              onChange={(event) => { setSelected(event.target.value); setAmount(""); setError(""); }}>
              {rehearsalMarkets.map((m) => <option key={m.symbol} value={m.symbol}>{m.symbol}</option>)}
            </select>
            <div className="vault-stats">
              <div>
                <span className="metric-caption">Deposited</span>
                <strong>
                  ${(pos.collateral * price).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  <small className="collateral-token-value">{pos.collateral.toLocaleString()} {selected}</small>
                </strong>
              </div>
              <div>
                <span className="metric-caption">Borrowed</span>
                <strong>${pos.debt.toLocaleString()}</strong>
              </div>
              <div>
                <span className="metric-caption">Available to borrow</span>
                <strong>
                  $
                  {available.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </div>
              <div>
                <span className="metric-caption">Health factor</span>
                <strong className={health < 0.95 ? "text-danger" : ""}>
                  {Number.isFinite(health) ? health.toFixed(2) : "∞"}
                </strong>
              </div>
            </div>
            <div className="vault-tabs" aria-label="Position action">
              {(["Deposit", "Borrow", "Repay", "Withdraw"] as const).map(
                (t) => (
                  <button
                    key={t}
                    className={`v-tab ${tab === t ? "v-tab-active" : ""}`}
                    aria-pressed={tab === t}
                    onClick={() => {
                      setTab(t);
                      setError("");
                      setAmount("");
                    }}
                  >
                    {t}
                  </button>
                ),
              )}
            </div>
            <label className="amount-label" htmlFor="rehearsal-amount">
              {tab} amount in USD
            </label>
            <div className="v-input-wrapper">
              <input
                id="rehearsal-amount"
                className="v-input"
                inputMode="decimal"
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="v-input-currency">
                USD
              </span>
            </div>
            {(tab === "Deposit" || tab === "Withdraw") && amount && (
              <p className="vault-note">≈ {(Number(amount) / price).toLocaleString("en-US", { maximumFractionDigits: 6 })} {selected}</p>
            )}
            {error && (
              <p className="v-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn-primary v-submit"
              onClick={action}
              disabled={!amount}
            >
              <Plus size={17} />
              {tab} {tab === "Borrow" || tab === "Repay" ? "USDC" : selected}
            </button>
            <p className="vault-note">Practice transaction · No tokens move</p>
          </div>
        </section>
        <aside>
          <div className="section-heading">
            <div>
              <h2>A protocol under pressure</h2>
              <p>A market shock. An adaptive response.</p>
            </div>
          </div>
          <CrashPanelView
            rehearsal
            busy={busy}
            step={step}
            crashed={crashed}
            price={crashed ? "$7.50" : "$15.00"}
            ltv={step === 3 ? "35%" : "75%"}
            beforeLtv="75%"
            volatility={step >= 2 ? "300.0%" : "12.8%"}
            enabled
            buttonLabel={
              busy
                ? "Running scenario"
                : crashed
                  ? "Scenario complete"
                  : "Simulate 50% crash"
            }
            onCrash={() => void run()}
            onRestore={() => {
              setStep(0);
              setCrashed(false);
            }}
            helper="Illustrative 300% volatility scenario. Live results depend on price history."
          />
        </aside>
      </div>
      <PolicyFooter />
    </>
  );
}

export default function Dashboard({
  initialRehearsal = false,
}: {
  initialRehearsal?: boolean;
}) {
  const [rehearsal, setRehearsal] = useState(initialRehearsal);
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="page-kicker">Your market, in focus.</span>
          <h1>Borrow with perspective.</h1>
          <p>Clear limits. Live risk. Room to react.</p>
        </div>
        <div className="mode-switch" aria-label="Dashboard mode">
          <button
            className={!rehearsal ? "active" : ""}
            aria-pressed={!rehearsal}
            onClick={() => setRehearsal(false)}
          >
            <span className="status-dot" />
            Live
          </button>
          <button
            className={rehearsal ? "active" : ""}
            aria-pressed={rehearsal}
            onClick={() => setRehearsal(true)}
          >
            Rehearsal <ArrowUpRight size={13} />
          </button>
        </div>
      </header>
      {rehearsal ? <RehearsalDashboard /> : <LiveDashboard />}
      <footer className="page-footer">
        <span>YVL · Yield Volatility Lending</span>
        <span>Testnet prototype · No real funds</span>
      </footer>
    </main>
  );
}
