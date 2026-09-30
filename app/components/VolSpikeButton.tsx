'use client';

import { useState } from 'react';
import { useWriteContract, useChainId } from 'wagmi';
import { CONTRACTS, MOCK_AGGREGATOR_ABI, VOLATILITY_ORACLE_ABI } from '../web3/contracts';
import type { AssetSymbol } from '../web3/contracts';

interface SpikeConfig {
  label: string;
  /** New price as int256 with 8 decimals (same as Chainlink feed) */
  newPrice: bigint;
  description: string;
}

const SPIKE_CONFIGS: Record<AssetSymbol, SpikeConfig[]> = {
  AAPL: [
    { label: '−10%', newPrice: BigInt(193_50_000_000), description: 'Mild dip — stays in Band 0' },
    { label: '−25%', newPrice: BigInt(161_25_000_000), description: 'Stress test — pushes toward Band 1' },
    { label: '−40%', newPrice: BigInt(129_00_000_000), description: 'Crash — triggers Band 2 (35% LTV)' },
    { label: 'Reset', newPrice: BigInt(215_00_000_000), description: 'Restore to $215 baseline' },
  ],
  PLTR: [
    { label: '−10%', newPrice: BigInt(21_60_000_000),  description: 'Mild dip — stays in Band 0' },
    { label: '−30%', newPrice: BigInt(16_80_000_000),  description: 'Stress — pushes toward Band 1' },
    { label: '−50%', newPrice: BigInt(12_00_000_000),  description: 'Crash — triggers Band 2 (35% LTV)' },
    { label: 'Reset', newPrice: BigInt(24_00_000_000), description: 'Restore to $24 baseline' },
  ],
};

interface VolSpikeButtonProps {
  symbol: AssetSymbol;
}

export default function VolSpikeButton({ symbol }: VolSpikeButtonProps) {
  const chainId    = useChainId();
  const c          = CONTRACTS[chainId as keyof typeof CONTRACTS] ?? CONTRACTS[421614];
  const configs    = SPIKE_CONFIGS[symbol];

  const [pending, setPending] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const { writeContractAsync: writeAgg } = useWriteContract();
  const { writeContractAsync: writePoke } = useWriteContract();

  const aggregatorAddress = symbol === 'AAPL' ? c.aaplToken : c.pltrToken;
  // NOTE: in a real deployment you'd store the aggregator address separately from the token.
  // For demo wiring we expose it via the CONTRACTS map (add after deployment).
  // For now this button shows the UX — wire AAPL_AGGREGATOR_ADDRESS after deployment.

  const assetAddress = symbol === 'AAPL' ? c.aaplToken : c.pltrToken;

  async function handleSpike(cfg: SpikeConfig) {
    if (pending) return;
    setPending(cfg.label);
    setLastAction(null);
    try {
      // Step 1: update mock aggregator price
      // @ts-ignore — aggregatorAddress not yet filled; this demonstrates the wiring
      await writeAgg({
        address: (c as any)[`${symbol.toLowerCase()}Aggregator`] ?? aggregatorAddress,
        abi: MOCK_AGGREGATOR_ABI,
        functionName: 'updateAnswer',
        args: [cfg.newPrice],
      });

      // Step 2: poke oracle to re-compute EWMA with new price
      await writePoke({
        address: c.volatilityOracle,
        abi: VOLATILITY_ORACLE_ABI,
        functionName: 'poke',
        args: [assetAddress],
      });

      setLastAction(`✓ ${cfg.label} applied — ${cfg.description}`);
    } catch (err: any) {
      setLastAction(`✗ ${err?.shortMessage ?? err?.message ?? 'Transaction failed'}`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="spike-panel" id={`vol-spike-${symbol.toLowerCase()}`}>
      <div className="spike-header">
        <span className="spike-title">Simulate {symbol} Vol Spike</span>
        <span className="spike-sub">Updates MockAggregator + pokes oracle on-chain</span>
      </div>

      <div className="spike-buttons-row">
        {configs.map(cfg => (
          <button
            key={cfg.label}
            id={`spike-btn-${symbol.toLowerCase()}-${cfg.label.replace(/[^a-z0-9]/gi, '')}`}
            className={`spike-btn ${cfg.label === 'Reset' ? 'spike-btn-reset' : 'spike-btn-crash'} ${pending === cfg.label ? 'spike-btn-pending' : ''}`}
            onClick={() => handleSpike(cfg)}
            disabled={!!pending}
            title={cfg.description}
          >
            {pending === cfg.label ? (
              <span className="spike-spinner" />
            ) : (
              cfg.label
            )}
          </button>
        ))}
      </div>

      {lastAction && (
        <p className={`spike-feedback ${lastAction.startsWith('✓') ? 'spike-feedback-ok' : 'spike-feedback-err'}`}>
          {lastAction}
        </p>
      )}
    </div>
  );
}
