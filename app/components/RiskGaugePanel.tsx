"use client";

import { useAssetRisk, useAssetMetadata } from "../web3/useProtocol";
import MarketCard from "./MarketCard";

function LiveMarket({
  asset,
  selected,
  onSelect,
}: {
  asset: `0x${string}`;
  selected: boolean;
  onSelect: () => void;
}) {
  const { symbol, name } = useAssetMetadata(asset);
  const risk = useAssetRisk(asset);
  return (
    <MarketCard
      selected={selected}
      onSelect={onSelect}
      market={{
        symbol,
        name,
        volatility: risk.annualizedVolPct,
        ltv: String(Number(risk.currentLTVBps) / 100),
        band: risk.currentBand,
        loading: risk.isLoading,
        error: !!risk.error,
        initialized: risk.isInitialized,
      }}
    />
  );
}

export default function RiskGaugePanel({
  assets,
  selected,
  onSelect,
}: {
  assets: `0x${string}`[];
  selected?: `0x${string}`;
  onSelect: (asset: `0x${string}`) => void;
}) {
  return (
    <div className="markets-grid">
      {assets.map((asset) => (
        <LiveMarket
          key={asset}
          asset={asset}
          selected={selected === asset}
          onSelect={() => onSelect(asset)}
        />
      ))}
    </div>
  );
}
