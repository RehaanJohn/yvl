#!/usr/bin/env node
/**
 * YVL Keeper — EWMA Oracle Poke (Dynamic)
 * ─────────────────────────────
 * Fetches all supported assets from LendingVault and calls VolatilityOracle.poke(asset) 
 * for each tracked asset on a cron schedule.
 */

import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIVATE_KEY           = process.env.KEEPER_PRIVATE_KEY;
const RPC_URL               = process.env.ARB_SEPOLIA_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";
const ORACLE_ADDRESS        = process.env.VOLATILITY_ORACLE_ADDRESS;
const VAULT_ADDRESS         = process.env.LENDING_VAULT_ADDRESS;

const POKE_INTERVAL_MS      = parseInt(process.env.POKE_INTERVAL_MS ?? "3600000", 10); // default: 1h
const STALE_THRESHOLD_SEC   = parseInt(process.env.STALE_THRESHOLD_SEC ?? "7200", 10); // 2h stale

// ─── ABI (minimal) ────────────────────────────────────────────────────────────

const ORACLE_ABI = parseAbi([
  "function poke(address asset) external",
  "function lastUpdated(address asset) external view returns (uint256)",
  "function annualizedVolBps(address asset) external view returns (uint256)",
  "event VolUpdated(address indexed asset, uint256 variance, uint256 annualizedVolBps)",
]);

const VAULT_ABI = parseAbi([
  "function getSupportedAssets() external view returns (address[])"
]);

// ─── Client setup ─────────────────────────────────────────────────────────────

if (!PRIVATE_KEY || !ORACLE_ADDRESS || !VAULT_ADDRESS) {
  console.error("Missing KEEPER_PRIVATE_KEY, VOLATILITY_ORACLE_ADDRESS, or LENDING_VAULT_ADDRESS in .env");
  process.exit(1);
}

const account = privateKeyToAccount(`0x${PRIVATE_KEY.replace(/^0x/, "")}`);

const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: arbitrumSepolia,
  transport: http(RPC_URL),
});

// ─── Core logic ───────────────────────────────────────────────────────────────

async function getActiveMarkets() {
  try {
    const assets = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "getSupportedAssets",
    });
    return assets;
  } catch (err) {
    console.error(`[keeper] Error fetching supported assets from Vault: ${err.message}`);
    return [];
  }
}

async function shouldPoke(assetAddress) {
  try {
    const lastUpdate = await publicClient.readContract({
      address: ORACLE_ADDRESS,
      abi: ORACLE_ABI,
      functionName: "lastUpdated",
      args: [assetAddress],
    });
    const age = Math.floor(Date.now() / 1000) - Number(lastUpdate);
    return age >= STALE_THRESHOLD_SEC;
  } catch (err) {
    console.warn(`[keeper] Error checking staleness for ${assetAddress}: ${err.message}`);
    return true; // poke anyway on error
  }
}

async function pokeAsset(assetAddress) {
  try {
    const stale = await shouldPoke(assetAddress);
    if (!stale) {
      console.log(`[keeper] Asset ${assetAddress} is fresh — skipping`);
      return;
    }

    console.log(`[keeper] Poking Asset (${assetAddress})...`);

    const hash = await walletClient.writeContract({
      address: ORACLE_ADDRESS,
      abi: ORACLE_ABI,
      functionName: "poke",
      args: [assetAddress],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      const vol = await publicClient.readContract({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "annualizedVolBps",
        args: [assetAddress],
      });
      console.log(
        `[keeper] ✓ Asset ${assetAddress} poked | tx: ${hash} | annualizedVol: ${Number(vol) / 100}%`
      );
    } else {
      console.error(`[keeper] ✗ Asset ${assetAddress} poke reverted | tx: ${hash}`);
    }
  } catch (err) {
    console.error(`[keeper] Error poking Asset ${assetAddress}: ${err.message}`);
  }
}

async function runPoke() {
  console.log(`\n[keeper] ${new Date().toISOString()} — running poke cycle`);
  const assets = await getActiveMarkets();
  console.log(`[keeper] Found ${assets.length} active markets.`);
  await Promise.allSettled(assets.map(pokeAsset));
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

console.log("[keeper] YVL Dynamic Oracle Keeper starting...");
console.log(`[keeper] Oracle: ${ORACLE_ADDRESS}`);
console.log(`[keeper] Vault:  ${VAULT_ADDRESS}`);
console.log(`[keeper] Poke interval: ${POKE_INTERVAL_MS / 1000}s`);

// Run immediately on start, then on interval
runPoke();
setInterval(runPoke, POKE_INTERVAL_MS);
