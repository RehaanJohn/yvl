"use client";

import { ArrowUpRight, ShieldCheck } from "lucide-react";

export interface MarketData {
  symbol: string;
  name: string;
  volatility: string;
  ltv: string;
  band: number;
  loading?: boolean;
  error?: boolean;
  initialized?: boolean;
}

export function TokenMark({ symbol }: { symbol: string }) {
  return (
    <span
      className={`token-mark token-${symbol.toLowerCase()}`}
      aria-hidden="true"
    >
      {symbol === "WETH"
        ? "Ξ"
        : symbol === "WBTC"
          ? "₿"
          : symbol === "LINK"
            ? "⬡"
            : symbol.slice(0, 1)}
    </span>
  );
}

export function PriceTrace({
  crashed = false,
  compact = false,
}: {
  crashed?: boolean;
  compact?: boolean;
}) {
  const calm =
    "M0 44 C20 44 20 38 40 40 S65 30 85 34 S110 22 132 27 S157 20 175 23 S205 13 224 18 S247 9 267 12 S294 7 320 8";
  const crash =
    "M0 16 C20 16 20 11 40 13 S65 6 85 10 S110 8 132 9 L164 9 L181 53 L196 56 L220 51 L245 54 L270 50 L294 52 L320 49";
  const line = crashed ? crash : calm;
  return (
    <svg
      className={`price-trace ${compact ? "compact" : ""}`}
      viewBox="0 0 320 72"
      preserveAspectRatio="none"
      role="img"
      aria-label={
        crashed
          ? "Illustrative 50 percent price drop"
          : "Illustrative steady price trend"
      }
    >
      <path d={`${line} L320 72 L0 72 Z`} fill="currentColor" opacity=".06" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function MarketCard({
  market,
  selected,
  onSelect,
  rehearsal = false,
}: {
  market: MarketData;
  selected: boolean;
  onSelect: () => void;
  rehearsal?: boolean;
}) {
  const tone =
    market.band === 2 ? "danger" : market.band === 1 ? "warning" : "safe";
  const status = market.error
    ? "Unavailable"
    : market.loading
      ? "Reading market"
      : !market.initialized
        ? "Awaiting history"
        : ["Low risk", "Moderate risk", "High risk"][market.band];
  return (
    <button
      className={`market-card glass ${selected ? "selected" : ""} ${tone}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="market-top">
        <span className="asset-heading">
          <TokenMark symbol={market.symbol} />
          <span>
            <strong>{market.symbol}</strong>
            <span className="muted market-name">{market.name}</span>
          </span>
        </span>
        <ArrowUpRight size={17} className="muted" />
      </span>
      <span className="market-metrics">
        <span>
          <span className="metric-caption">Max LTV</span>
          <strong className="market-ltv">
            {market.loading || market.error ? "—" : market.ltv}
            <span className="ltv-unit">%</span>
          </strong>
        </span>
        <span className="vol-metric">
          <span className="metric-caption">Annualized volatility</span>
          <strong>
            {market.loading || market.error ? "—" : market.volatility}
          </strong>
        </span>
      </span>
      {rehearsal ? (
        <PriceTrace crashed={market.band === 2} compact />
      ) : (
        <span className="risk-meter" aria-label="Risk band">
          <span
            style={{
              width:
                market.error || !market.initialized
                  ? "0%"
                  : `${[24, 54, 92][market.band]}%`,
            }}
          />
        </span>
      )}
      <span className="market-bottom">
        <span className={`status-chip ${tone}`}>
          <span className="status-dot" />
          {status}
        </span>
        <span className="market-footnote">
          {rehearsal ? (
            "Simulated market"
          ) : (
            <>
              <ShieldCheck size={12} /> On-chain
            </>
          )}
        </span>
      </span>
    </button>
  );
}
