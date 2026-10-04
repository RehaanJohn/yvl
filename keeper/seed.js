#!/usr/bin/env node
/**
 * YVL — Volatility history seeder
 * ───────────────────────────────
 * Pulls ~30 days of REAL hourly prices (CoinGecko public API) for each supported
 * asset and warm-starts the on-chain EWMA via VolatilityOracle.seedHistory().
 *
 * Why: the oracle can only learn volatility from price changes. On a freshly deployed
 * contract that would read 0% for weeks. This replays genuine history so WETH / WBTC /
 * LINK show their true, different volatilities (and LTV bands) immediately.
 *
 * Must be run by the oracle owner (the deployer key).
 *   OWNER_PRIVATE_KEY=0x... node seed.js        (falls back to KEEPER_PRIVATE_KEY)
 */

import { createPublicClient, createWalletClient, http, parseAbi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY    = process.env.OWNER_PRIVATE_KEY ?? process.env.KEEPER_PRIVATE_KEY;
const RPC_URL        = process.env.ARB_SEPOLIA_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";
const ORACLE_ADDRESS = process.env.VOLATILITY_ORACLE_ADDRESS;
const VAULT_ADDRESS  = process.env.LENDING_VAULT_ADDRESS;
const DAYS           = process.env.SEED_DAYS ?? "30";

if (!PRIVATE_KEY || !ORACLE_ADDRESS || !VAULT_ADDRESS) {
  console.error("Missing OWNER_PRIVATE_KEY/KEEPER_PRIVATE_KEY, VOLATILITY_ORACLE_ADDRESS or LENDING_VAULT_ADDRESS");
  process.exit(1);
}

const ORACLE_ABI = parseAbi([
  "function seedHistory(address asset, uint256[] prices, uint256[] dts) external",
  "function annualizedVolBps(address asset) view returns (uint256)",
]);
const VAULT_ABI = parseAbi(["function getSupportedAssets() view returns (address[])"]);
const ERC20_ABI = parseAbi(["function symbol() view returns (string)"]);

// Token symbol -> CoinGecko id
const COINGECKO_IDS = { WETH: "ethereum", WBTC: "bitcoin", LINK: "chainlink" };

const account = privateKeyToAccount(`0x${PRIVATE_KEY.replace(/^0x/, "")}`);
const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport: http(RPC_URL) });

async function fetchHourlyHistory(id) {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${DAYS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${id}: HTTP ${res.status}`);
  const { prices } = await res.json(); // [[ms, usd], ...] — hourly for 2–90 days
  return prices;
}

async function seed(asset) {
  const symbol = await publicClient.readContract({ address: asset, abi: ERC20_ABI, functionName: "symbol" });
  const id = COINGECKO_IDS[symbol];
  if (!id) {
    console.warn(`[seed] No CoinGecko id for ${symbol} — skipping`);
    return;
  }

  const history = await fetchHourlyHistory(id);
  const prices = history.map(([, p]) => parseUnits(p.toFixed(8), 18));
  const dts = history.map(([t], i) => (i === 0 ? 0n : BigInt(Math.max(1, Math.round((t - history[i - 1][0]) / 1000)))));

  console.log(`[seed] ${symbol}: replaying ${prices.length} real price points...`);
  const hash = await walletClient.writeContract({
    address: ORACLE_ADDRESS, abi: ORACLE_ABI, functionName: "seedHistory", args: [asset, prices, dts],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  const vol = await publicClient.readContract({
    address: ORACLE_ADDRESS, abi: ORACLE_ABI, functionName: "annualizedVolBps", args: [asset],
  });
  console.log(`[seed] ✓ ${symbol} annualised vol = ${Number(vol) / 100}% | tx ${hash}`);
}

const assets = await publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "getSupportedAssets" });
for (const a of assets) {
  try { await seed(a); } catch (e) { console.error(`[seed] ${a}: ${e.message}`); }
  await new Promise(r => setTimeout(r, 2500)); // be polite to CoinGecko's rate limit
}
