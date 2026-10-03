'use client';

import { useReadContract, useChainId } from 'wagmi';
import { formatUnits } from 'viem';
import {
  CONTRACTS,
  VOLATILITY_ORACLE_ABI,
  RISK_ENGINE_ABI,
  LENDING_VAULT_ABI,
  ERC20_ABI,
} from './contracts';

const WAD = BigInt('1000000000000000000'); // 1e18

// ─── Shared helpers ────────────────────────────────────────────────────────────

function useContracts() {
  const chainId = useChainId();
  return CONTRACTS[chainId as keyof typeof CONTRACTS] ?? CONTRACTS[421614]; // fallback to Arb Sepolia
}

// ─── Vol data per asset ────────────────────────────────────────────────────────

export interface AssetVolData {
  /** Raw annualised vol in bps-WAD from the oracle (e.g. 0.25e18 = 25%) */
  annualizedVolBps: bigint;
  /** Human-friendly percentage string, e.g. "24.8%" */
  annualizedVolPct: string;
  /** Current LTV in basis points, e.g. 7500 = 75% */
  currentLTVBps: bigint;
  /** Human-friendly LTV string, e.g. "75%" */
  currentLTVPct: string;
  /** Band index: 0 = low, 1 = medium, 2 = high */
  currentBand: number;
  /** Band label */
  bandLabel: 'Low' | 'Medium' | 'High';
  /** Hex colour for the band (for UI dial/indicator) */
  bandColor: string;
  /** True if oracle state has ever been initialized */
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
}

const BAND_META = [
  { label: 'Low'    as const, color: '#22c55e' }, // green
  { label: 'Medium' as const, color: '#f59e0b' }, // amber
  { label: 'High'   as const, color: '#ef4444' }, // red
];

/**
 * useAssetRisk — polls VolatilityOracle + RiskEngine for a given asset.
 * Refetches every 30s for a live "risk gauge" UI element.
 */
export function useAssetRisk(assetAddress: `0x${string}` | undefined): AssetVolData {
  const c = useContracts();

  const { data: volBps, isLoading: loadingVol, error: volErr } = useReadContract({
    address: c.volatilityOracle,
    abi: VOLATILITY_ORACLE_ABI,
    functionName: 'annualizedVolBps',
    args: assetAddress ? [assetAddress] : undefined,
    query: {
      enabled: !!assetAddress,
      refetchInterval: 30_000,
    },
  });

  const { data: volState, isLoading: loadingState } = useReadContract({
    address: c.volatilityOracle,
    abi: VOLATILITY_ORACLE_ABI,
    functionName: 'volState',
    args: assetAddress ? [assetAddress] : undefined,
    query: {
      enabled: !!assetAddress,
      refetchInterval: 30_000,
    },
  });

  const { data: band, isLoading: loadingBand } = useReadContract({
    address: c.riskEngine,
    abi: RISK_ENGINE_ABI,
    functionName: 'currentBand',
    args: assetAddress ? [assetAddress] : undefined,
    query: {
      enabled: !!assetAddress,
      refetchInterval: 30_000,
    },
  });

  const { data: ltvBps, isLoading: loadingLtv } = useReadContract({
    address: c.riskEngine,
    abi: RISK_ENGINE_ABI,
    functionName: 'currentLTV',
    args: assetAddress ? [assetAddress] : undefined,
    query: {
      enabled: !!assetAddress,
      refetchInterval: 30_000,
    },
  });

  const isLoading = loadingVol || loadingBand || loadingLtv || loadingState;
  const volBigInt = volBps ?? 0n;
  const bandIdx   = typeof band === 'number' ? band : (Number(band ?? 0));
  const ltvBigInt = ltvBps ?? 0n;
  const meta      = BAND_META[Math.min(bandIdx, 2)];

  // annualizedVolBps is WAD-scaled — convert to pct
  // The oracle returns dailyVol * 15874 / (WAD/100) so units are "bps × 1e18"
  // To get %, divide by 1e18 and × 100, then ÷ 10000 (bps)
  const volPct = volBigInt > 0n
    ? `${(Number(formatUnits(volBigInt, 18)) / 100).toFixed(1)}%`
    : '—';

  const ltvPct = ltvBigInt > 0n
    ? `${Number(ltvBigInt) / 100}%`
    : '—';

  return {
    annualizedVolBps: volBigInt,
    annualizedVolPct: volPct,
    currentLTVBps:   ltvBigInt,
    currentLTVPct:   ltvPct,
    currentBand:     bandIdx,
    bandLabel:       meta.label,
    bandColor:       meta.color,
    isInitialized:   !!(volState as any)?.[3], // initialized bool
    isLoading,
    error:           volErr as Error | null,
  };
}

// ─── User position data ────────────────────────────────────────────────────────

export interface UserPositionData {
  collateral: bigint;
  debt: bigint;
  healthFactorBps: bigint;
  /** Health factor as a float (1.0 = 100%) */
  healthFactorFloat: number;
  isHealthy: boolean;
  isLoading: boolean;
}

export function useUserPosition(
  userAddress: `0x${string}` | undefined,
  assetAddress: `0x${string}` | undefined,
): UserPositionData {
  const c = useContracts();

  const { data: collateralAmt, isLoading: l1 } = useReadContract({
    address: c.lendingVault,
    abi: LENDING_VAULT_ABI,
    functionName: 'collateral',
    args: userAddress && assetAddress ? [userAddress, assetAddress] : undefined,
    query: { enabled: !!(userAddress && assetAddress), refetchInterval: 15_000 },
  });

  const { data: debtAmt, isLoading: l2 } = useReadContract({
    address: c.lendingVault,
    abi: LENDING_VAULT_ABI,
    functionName: 'debt',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 15_000 },
  });

  const { data: hf, isLoading: l3 } = useReadContract({
    address: c.lendingVault,
    abi: LENDING_VAULT_ABI,
    functionName: 'healthFactor',
    args: userAddress && assetAddress ? [userAddress, assetAddress] : undefined,
    query: { enabled: !!(userAddress && assetAddress), refetchInterval: 15_000 },
  });

  const hfBps   = hf ?? 0n;
  const hfFloat = hfBps >= BigInt(2 ** 200) ? 999 : Number(hfBps) / 10_000;

  return {
    collateral:       collateralAmt ?? 0n,
    debt:             debtAmt ?? 0n,
    healthFactorBps:  hfBps,
    healthFactorFloat: hfFloat,
    isHealthy:        hfFloat >= 0.95,
    isLoading:        l1 || l2 || l3,
  };
}

// ─── Supported Assets Directory ────────────────────────────────────────────────

export function useSupportedAssets() {
  const c = useContracts();
  const { data: assets, isLoading, error } = useReadContract({
    address: c.lendingVault,
    abi: LENDING_VAULT_ABI,
    functionName: 'getSupportedAssets',
    query: {
      refetchInterval: 60_000,
    }
  });

  return {
    assets: (assets as `0x${string}`[]) || [],
    isLoading,
    error,
  };
}

export function useAssetMetadata(assetAddress: `0x${string}` | undefined) {
  const { data: symbol } = useReadContract({
    address: assetAddress,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: { enabled: !!assetAddress },
  });

  const { data: name } = useReadContract({
    address: assetAddress,
    abi: ERC20_ABI,
    functionName: 'name',
    query: { enabled: !!assetAddress },
  });

  return {
    symbol: (symbol as string) || '...',
    name: (name as string) || 'Unknown Asset',
  };
}
