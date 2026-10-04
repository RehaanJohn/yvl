"use client";

import { useReadContract, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  CONTRACTS,
  VOLATILITY_ORACLE_ABI,
  RISK_ENGINE_ABI,
  LENDING_VAULT_ABI,
  ERC20_ABI,
} from "./contracts";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function useContracts() {
  return CONTRACTS[421614];
}

// ─── Vol data per asset ────────────────────────────────────────────────────────

export interface AssetVolData {
  /** Annualized volatility in plain basis points (2500 = 25%). */
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
  bandLabel: "Low" | "Medium" | "High";
  /** Hex colour for the band (for UI dial/indicator) */
  bandColor: string;
  /** True if oracle state has ever been initialized */
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
}

const BAND_META = [
  { label: "Low" as const, color: "#22c55e" }, // green
  { label: "Medium" as const, color: "#f59e0b" }, // amber
  { label: "High" as const, color: "#ef4444" }, // red
];

/**
 * useAssetRisk — polls VolatilityOracle + RiskEngine for a given asset.
 * Refetches every 30s for a live "risk gauge" UI element.
 */
export function useAssetRisk(
  assetAddress: `0x${string}` | undefined,
): AssetVolData {
  const c = useContracts();

  const {
    data: volBps,
    isLoading: loadingVol,
    error: volErr,
  } = useReadContract({
    chainId: 421614,
    address: c.volatilityOracle,
    abi: VOLATILITY_ORACLE_ABI,
    functionName: "annualizedVolBps",
    args: assetAddress ? [assetAddress] : undefined,
    query: {
      enabled: !!assetAddress,
      refetchInterval: 30_000,
    },
  });

  const { data: volState, isLoading: loadingState } = useReadContract({
    chainId: 421614,
    address: c.volatilityOracle,
    abi: VOLATILITY_ORACLE_ABI,
    functionName: "volState",
    args: assetAddress ? [assetAddress] : undefined,
    query: {
      enabled: !!assetAddress,
      refetchInterval: 30_000,
    },
  });

  const { data: band, isLoading: loadingBand } = useReadContract({
    chainId: 421614,
    address: c.riskEngine,
    abi: RISK_ENGINE_ABI,
    functionName: "currentBand",
    args: assetAddress ? [assetAddress] : undefined,
    query: {
      enabled: !!assetAddress,
      refetchInterval: 30_000,
    },
  });

  const { data: ltvBps, isLoading: loadingLtv } = useReadContract({
    chainId: 421614,
    address: c.riskEngine,
    abi: RISK_ENGINE_ABI,
    functionName: "currentLTV",
    args: assetAddress ? [assetAddress] : undefined,
    query: {
      enabled: !!assetAddress,
      refetchInterval: 30_000,
    },
  });

  const isLoading = loadingVol || loadingBand || loadingLtv || loadingState;
  const volBigInt = volBps ?? 0n;
  const bandIdx = typeof band === "number" ? band : Number(band ?? 0);
  const ltvBigInt = ltvBps ?? 0n;
  const meta = BAND_META[Math.min(bandIdx, 2)];

  // annualizedVolBps is plain basis points (3000 = 30%)
  const volPct =
    volBigInt > 0n ? `${(Number(volBigInt) / 100).toFixed(1)}%` : "—";

  const ltvPct = ltvBigInt > 0n ? `${Number(ltvBigInt) / 100}%` : "—";

  return {
    annualizedVolBps: volBigInt,
    annualizedVolPct: volPct,
    currentLTVBps: ltvBigInt,
    currentLTVPct: ltvPct,
    currentBand: bandIdx,
    bandLabel: meta.label,
    bandColor: meta.color,
    isInitialized: !!volState?.[3], // initialized bool
    isLoading,
    error: volErr as Error | null,
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
  /** Remaining borrowing capacity after outstanding debt. */
  maxBorrowable: bigint;
  collateralUsdc: bigint;
}

export function useUserPosition(
  userAddress: `0x${string}` | undefined,
  assetAddress: `0x${string}` | undefined,
): UserPositionData {
  const c = useContracts();
  const client = usePublicClient({ chainId: 421614 });
  const chainId = 421614;

  const { data: collateralAmt, isLoading: l1 } = useReadContract({
    chainId: 421614,
    address: c.lendingVault,
    abi: LENDING_VAULT_ABI,
    functionName: "collateral",
    args: userAddress && assetAddress ? [userAddress, assetAddress] : undefined,
    query: {
      enabled: !!(userAddress && assetAddress),
      refetchInterval: 15_000,
    },
  });

  const { data: debtAmt, isLoading: l2 } = useReadContract({
    chainId: 421614,
    address: c.lendingVault,
    abi: LENDING_VAULT_ABI,
    functionName: "debt",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 15_000 },
  });

  const { data: hf, isLoading: l3 } = useReadContract({
    chainId: 421614,
    address: c.lendingVault,
    abi: LENDING_VAULT_ABI,
    functionName: "healthFactor",
    args: userAddress && assetAddress ? [userAddress, assetAddress] : undefined,
    query: {
      enabled: !!(userAddress && assetAddress),
      refetchInterval: 15_000,
    },
  });

  // maxBorrowable mutates state and must be simulated, not typed as a view.
  // The transaction in borrow() performs the same refresh on-chain.
  const { data: maxBorrow, isLoading: l4 } = useQuery({
    queryKey: ["borrowLimit", chainId, userAddress, assetAddress],
    enabled: !!(client && userAddress && assetAddress),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!client || !userAddress || !assetAddress) return 0n;
      const { result } = await client.simulateContract({
        address: c.lendingVault,
        abi: LENDING_VAULT_ABI,
        functionName: "maxBorrowable",
        args: [userAddress, assetAddress],
        account: userAddress,
      });
      return result;
    },
  });

  const { data: collatUsdc, isLoading: l5 } = useReadContract({
    chainId: 421614,
    address: c.lendingVault,
    abi: LENDING_VAULT_ABI,
    functionName: "collateralValueUsdc",
    args: assetAddress ? [assetAddress, collateralAmt ?? 0n] : undefined,
    query: { enabled: !!assetAddress, refetchInterval: 15_000 },
  });

  const hfBps = hf ?? 0n;
  const hfFloat = hfBps >= BigInt(2 ** 200) ? 999 : Number(hfBps) / 10_000;

  return {
    collateral: collateralAmt ?? 0n,
    debt: debtAmt ?? 0n,
    healthFactorBps: hfBps,
    healthFactorFloat: hfFloat,
    isHealthy: hfFloat >= 0.95,
    isLoading: l1 || l2 || l3 || l4 || l5,
    collateralUsdc: collatUsdc ?? 0n,
    maxBorrowable:
      (maxBorrow ?? 0n) > (debtAmt ?? 0n)
        ? (maxBorrow ?? 0n) - (debtAmt ?? 0n)
        : 0n,
  };
}

// ─── Supported Assets Directory ────────────────────────────────────────────────

export function useSupportedAssets() {
  const c = useContracts();
  const {
    data: assets,
    isLoading,
    error,
  } = useReadContract({
    chainId: 421614,
    address: c.lendingVault,
    abi: LENDING_VAULT_ABI,
    functionName: "getSupportedAssets",
    query: {
      refetchInterval: 60_000,
    },
  });

  return {
    assets: (assets as `0x${string}`[]) || [],
    isLoading,
    error,
  };
}

export function useAssetMetadata(assetAddress: `0x${string}` | undefined) {
  const { data: symbol } = useReadContract({
    chainId: 421614,
    address: assetAddress,
    abi: ERC20_ABI,
    functionName: "symbol",
    query: { enabled: !!assetAddress },
  });

  const { data: name } = useReadContract({
    chainId: 421614,
    address: assetAddress,
    abi: ERC20_ABI,
    functionName: "name",
    query: { enabled: !!assetAddress },
  });

  return {
    symbol: (symbol as string) || "...",
    name: (name as string) || "Unknown Asset",
  };
}

export function useAssetPrice(assetAddress: `0x${string}` | undefined) {
  const c = useContracts();
  const { data: price, isLoading } = useReadContract({
    chainId: 421614,
    address: c.lendingVault,
    abi: LENDING_VAULT_ABI,
    functionName: "collateralValueUsdc",
    args: assetAddress ? [assetAddress, 10n ** 18n] : undefined,
    query: { enabled: !!assetAddress, refetchInterval: 60_000 },
  });
  return { priceUsdc6Decimals: price ?? 0n, isLoading };
}
