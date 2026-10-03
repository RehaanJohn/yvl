'use client';

import { useAssetRisk, useAssetMetadata, useSupportedAssets } from '../web3/useProtocol';

// ─── Band indicator ────────────────────────────────────────────────────────────

function BandPip({ active, color }: { active: boolean; color: string }) {
  return (
    <div
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: active ? color : 'rgba(255,255,255,0.12)',
        boxShadow: active ? `0 0 8px ${color}` : 'none',
        transition: 'background 0.4s ease, box-shadow 0.4s ease',
      }}
    />
  );
}

// ─── Animated arc gauge ───────────────────────────────────────────────────────

function ArcGauge({ pct, color }: { pct: number; color: string }) {
  const R      = 44;
  const CIRC   = 2 * Math.PI * R;
  const filled = Math.min(pct, 1) * CIRC * 0.75; // 270° sweep
  const offset = CIRC * 0.25;                      // start at 7 o'clock

  return (
    <svg width={120} height={80} viewBox="0 0 120 100" style={{ overflow: 'visible' }}>
      {/* Track */}
      <circle
        cx={60} cy={72} r={R}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={10}
        strokeDasharray={`${CIRC * 0.75} ${CIRC * 0.25}`}
        strokeDashoffset={-offset}
        strokeLinecap="round"
        transform="rotate(135 60 72)"
      />
      {/* Fill */}
      <circle
        cx={60} cy={72} r={R}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeDasharray={`${filled} ${CIRC - filled}`}
        strokeDashoffset={-offset}
        strokeLinecap="round"
        transform="rotate(135 60 72)"
        style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease' }}
      />
    </svg>
  );
}

// ─── Single-asset risk card ────────────────────────────────────────────────────

function AssetRiskCard({ assetAddress }: { assetAddress: `0x${string}` }) {
  const { symbol, name } = useAssetMetadata(assetAddress);
  const risk  = useAssetRisk(assetAddress);

  // Generate a stable color based on address
  const h = parseInt(assetAddress.slice(2, 6), 16) % 360;
  const assetColor = `hsl(${h}, 70%, 65%)`;

  // vol % for gauge fill: cap at 80% annualised (extreme) = full gauge
  const volFloat = risk.annualizedVolBps > 0n
    ? Number(risk.annualizedVolBps) / 1e18 / 100
    : 0;
  const gaugePct = Math.min(volFloat / 0.80, 1);

  const bandColors = ['#22c55e', '#f59e0b', '#ef4444'];
  const bandLabels = ['Low', 'Medium', 'High'] as const;

  return (
    <div className="risk-card" id={`risk-card-${symbol.toLowerCase()}`}>
      {/* Header */}
      <div className="risk-card-header">
        <div className="risk-asset-badge" style={{ background: `${assetColor}22`, borderColor: `${assetColor}44` }}>
          <span className="risk-asset-ticker" style={{ color: assetColor }}>{symbol}</span>
        </div>
        <span className="risk-asset-name">{name}</span>
      </div>

      {/* Arc gauge */}
      <div className="risk-gauge-wrap">
        <ArcGauge pct={gaugePct} color={risk.bandColor} />
        <div className="risk-gauge-center">
          {risk.isLoading ? (
            <span className="risk-loading-dot" />
          ) : (
            <>
              <span className="risk-vol-value">{risk.annualizedVolPct}</span>
              <span className="risk-vol-label">Ann. Vol</span>
            </>
          )}
        </div>
      </div>

      {/* Band pips */}
      <div className="risk-band-row">
        {bandLabels.map((label, i) => (
          <div key={label} className="risk-band-item">
            <BandPip active={risk.currentBand === i} color={bandColors[i]} />
            <span
              className="risk-band-label"
              style={{ color: risk.currentBand === i ? bandColors[i] : 'rgba(255,255,255,0.3)' }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* LTV stat */}
      <div className="risk-stat-row">
        <div className="risk-stat">
          <span className="risk-stat-label">Max LTV</span>
          <span className="risk-stat-value" style={{ color: risk.bandColor }}>
            {risk.currentLTVPct}
          </span>
        </div>
        <div className="risk-stat">
          <span className="risk-stat-label">Band</span>
          <span className="risk-stat-value" style={{ color: risk.bandColor }}>
            {risk.isLoading ? '…' : risk.bandLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Risk gauge panel (Dynamic) ──────────────────────────────────────────────

export default function RiskGaugePanel() {
  const { assets, isLoading } = useSupportedAssets();

  return (
    <div className="risk-panel" id="risk-gauge-panel">
      <div className="risk-panel-header">
        <h2 className="risk-panel-title">Live Risk Gauges</h2>
        <p className="risk-panel-sub">EWMA volatility → LTV band, updated every poke</p>
      </div>
      <div className="risk-cards-row">
        {isLoading && <p className="text-white/50 text-sm py-4">Loading listed markets...</p>}
        {assets.map((address) => (
          <AssetRiskCard key={address} assetAddress={address} />
        ))}
        {!isLoading && assets.length === 0 && (
          <p className="text-white/50 text-sm py-4">No markets registered yet.</p>
        )}
      </div>
    </div>
  );
}
