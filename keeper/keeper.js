#!/usr/bin/env node
/**
 * YVL Keeper — EWMA Oracle Poke
 * ─────────────────────────────
 * Calls VolatilityOracle.poke(asset) for each tracked asset on a cron schedule.
 * Designed to run via:
 *   - `node keeper.js`              — ad-hoc / manual
 *   - `pm2 start keeper.js`         — production daemon
 *   - Chainlink Automation          — register checkUpkeep/performUpkeep wrappers
 *
 * Requirements:
 *   npm install viem dotenv
 *
 * Usage:
 *   cp .env.example .env && node keeper.js
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
const AAPL_TOKEN_ADDRESS    = process.env.AAPL_TOKEN_ADDRESS;
const PLTR_TOKEN_ADDRESS    = process.env.PLTR_TOKEN_ADDRESS;

const POKE_INTERVAL_MS      = parseInt(process.env.POKE_INTERVAL_MS ?? "3600000", 10); // default: 1h
const STALE_THRESHOLD_SEC   = parseInt(process.env.STALE_THRESHOLD_SEC ?? "7200", 10); // 2h stale

const ASSETS = [
  { name: "AAPL", address: AAPL_TOKEN_ADDRESS },
  { name: "PLTR", address: PLTR_TOKEN_ADDRESS },
].filter(a => a.address);

// ─── ABI (minimal) ────────────────────────────────────────────────────────────

const ORACLE_ABI = parseAbi([
  "function poke(address asset) external",
  "function lastUpdated(address asset) external view returns (uint256)",
  "function annualizedVolBps(address asset) external view returns (uint256)",
  "event VolUpdated(address indexed asset, uint256 variance, uint256 annualizedVolBps)",
]);

// ─── Client setup ─────────────────────────────────────────────────────────────

if (!PRIVATE_KEY || !ORACLE_ADDRESS) {
  console.error("Missing KEEPER_PRIVATE_KEY or VOLATILITY_ORACLE_ADDRESS in .env");
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
    console.warn(`[keeper] Error checking staleness: ${err.message}`);
    return true; // poke anyway on error
  }
}

async function pokeAsset(asset) {
  try {
    const stale = await shouldPoke(asset.address);
    if (!stale) {
      console.log(`[keeper] ${asset.name} is fresh — skipping`);
      return;
    }

    console.log(`[keeper] Poking ${asset.name} (${asset.address})...`);

    const hash = await walletClient.writeContract({
      address: ORACLE_ADDRESS,
      abi: ORACLE_ABI,
      functionName: "poke",
      args: [asset.address],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      const vol = await publicClient.readContract({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "annualizedVolBps",
        args: [asset.address],
      });
      console.log(
        `[keeper] ✓ ${asset.name} poked | tx: ${hash} | annualizedVol: ${Number(vol) / 1e18 * 100}%`
      );
    } else {
      console.error(`[keeper] ✗ ${asset.name} poke reverted | tx: ${hash}`);
    }
  } catch (err) {
    console.error(`[keeper] Error poking ${asset.name}: ${err.message}`);
  }
}

async function runPoke() {
  console.log(`\n[keeper] ${new Date().toISOString()} — running poke cycle`);
  await Promise.allSettled(ASSETS.map(pokeAsset));
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

console.log("[keeper] YVL Oracle Keeper starting...");
console.log(`[keeper] Oracle: ${ORACLE_ADDRESS}`);
console.log(`[keeper] Assets: ${ASSETS.map(a => a.name).join(", ")}`);
console.log(`[keeper] Poke interval: ${POKE_INTERVAL_MS / 1000}s`);

// Run immediately on start, then on interval
runPoke();
setInterval(runPoke, POKE_INTERVAL_MS);
