# YVL presentation demo

Run from the repository root:

```bash
npm ci
npm run dev
```

Open http://localhost:3000/dashboard?demo=1 for rehearsal, or /dashboard for live markets.

## Rehearsal

All market readings, positions, and transactions are explicitly labeled as simulated. LINK starts with 100 tokens deposited and $500 of debt. WETH and WBTC start at 75% LTV. Practice deposit, borrow, repay, or withdrawal actions without a wallet.

Click **Simulate 50% crash**. LINK goes from $15 to $7.50, illustrative annualized volatility goes to 300%, and the default high-risk LTV goes from 75% to 35%. The sample LINK position becomes unhealthy and available borrowing falls to zero. The reset icon restores the scenario's market prices and risk; it retains any practice deposits and debt. Switching modes resets all rehearsal state.

## Live testnet flow

Connect a wallet to Arbitrum Sepolia. The crash control verifies that the oracle's LINK feed matches the mock aggregator recorded in the deployment broadcast (`0x2a29C1a762E5D8a3b98c852FD0566556D9E6acc7`). It will not write to an arbitrary feed.

The button sends three dependent transactions, each requiring a wallet confirmation:

1. Set the mock LINK feed to half its current price and wait for the receipt.
2. Call the volatility oracle's `poke(LINK)` and wait for confirmation.
3. Call the vault's `maxBorrowable(wallet, LINK)` to persist the risk-band/LTV update, then refresh the dashboard.

This flow runs immediately rather than waiting for the keeper's hourly check. A rejected or reverted step stops subsequent transactions. If the price change confirmed and a risk-update step fails, retry resumes the risk update without halving the price again. Receipt status, error feedback, and an explorer link appear in the panel.

The live volatility reading is calculated by the oracle and is not guaranteed to be 300%. Default LTV bands are 75% / 55% / 35%, not 25%. Achieving a 25% high-risk band requires an owner-authorized contract configuration change; this frontend update does not change the deployed policy. Neither WETH nor WBTC is forced to show 75% in live mode.

The restore icon restores the original pre-crash LINK price captured for this page session and refreshes oracle/risk state. It does **not** clear EWMA volatility history or guarantee a return to low-risk LTV. Keep the page open to retain the captured original price.

## Verification

```bash
npm run lint
npx tsc --noEmit
npm run test:demo
npm run build -- --webpack
```

The webpack fallback is useful in restricted environments where Turbopack cannot bind a worker port. The existing wallet SDK emits an optional React Native storage dependency warning during the webpack build, but the build completes.

Transaction orchestration tests use mocked wallet/RPC responses. They cover receipt ordering, oracle reverts, wallet rejection, receipt lookup failure, and protection against writing to an unexpected price feed. These checks do not submit real testnet transactions.

The pre-existing mock-USDC decimal mismatch remains a contract-level issue. This UI uses the vault's existing 6-decimal debt accounting; the deployed mock token advertises 18 decimals. Correct that mismatch before relying on token balances as a faithful lending demonstration.
