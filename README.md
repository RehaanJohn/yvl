# YVL — Yield Volatility Lending

**YVL** is a decentralized, risk-aware lending protocol. Unlike traditional lending platforms that use static Loan-to-Value (LTV) limits, YVL dynamically adjusts your borrowing power based on the **real-time volatility** of your collateral.

When a deposited asset becomes highly volatile (risky), the protocol automatically lowers its max LTV to protect the system from bad debt. When the asset stabilizes, the LTV increases, allowing users to borrow more against it.

## How It Works

1. **On-Chain Volatility Oracle:** We maintain an Exponentially Weighted Moving Average (EWMA) of asset prices entirely on-chain. This tracks the annualized volatility (in basis points) using Chainlink Price Feeds.
2. **Risk Engine:** Maps the real-time volatility percentage to a specific risk "Band" (Low, Medium, High). To prevent rapid oscillations, we employ a 300 bps hysteresis buffer.
3. **Lending Vault:** The core lending contract where users can deposit collateral (WETH, WBTC, LINK) and borrow USDC. The vault consults the Risk Engine to enforce the current max borrowable limit and liquidation thresholds.

### Volatility Risk Bands
| Band | Annualized Volatility | Max LTV |
|------|-----------------------|---------|
| 0 — Low    | ≤ 20% (2,000 bps) | **75%** |
| 1 — Medium | ≤ 40% (4,000 bps) | **55%** |
| 2 — High   | > 40%             | **35%** |

## Project Structure

```
├── contracts/               # Smart Contracts (Foundry)
│   ├── src/
│   │   ├── VolatilityOracle.sol  # EWMA state machine
│   │   ├── RiskEngine.sol        # Volatility -> LTV mapping
│   │   ├── LendingVault.sol      # Core lending logic
│   │   └── MockERC20.sol         # Testnet tokens
│   ├── script/Deploy.s.sol       # Deployment script
│   └── test/Protocol.t.sol       # Unit tests
│
├── app/                     # Frontend (Next.js, React, wagmi)
│   ├── components/
│   │   ├── RiskGaugePanel.tsx    # Live risk indicators
│   │   ├── VaultPanel.tsx        # Deposit/Borrow interface
│   │   └── AdminPanel.tsx        # Admin controls
│   └── web3/
│       ├── contracts.ts          # Contract ABIs and addresses
│       └── useProtocol.ts        # Protocol hooks
│
└── keeper/                  # Off-chain Keeper Node
    ├── seed.js              # Bootstraps historical volatility via CoinGecko
    └── keeper.js            # Cron job to poke the oracle periodically
```

## Environment Variables

You need to create two `.env` files for the backend services. The frontend does not require any environment variables (it uses public clients).

### 1. `contracts/.env`
Create this file to deploy the smart contracts to Arbitrum Sepolia.
```env
PRIVATE_KEY=your_wallet_private_key_without_0x
ARB_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
ARBISCAN_KEY=your_arbiscan_api_key_for_verification
```

### 2. `keeper/.env`
Create this file to run the keeper node and seed scripts.
```env
PRIVATE_KEY=0xyour_wallet_private_key_with_0x_prefix
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
COINGECKO_API_KEY=your_coingecko_api_key_optional
```

## Setup & Running

### 1. Deploy Smart Contracts
Ensure you have [Foundry](https://getfoundry.sh/) installed.
```bash
cd contracts
forge install
forge build
forge test

# Deploy to Arbitrum Sepolia
forge script script/Deploy.s.sol --rpc-url $ARB_SEPOLIA_RPC --broadcast --verify -vvvv
```
*Note: Once deployed, update the contract addresses in `app/web3/contracts.ts`.*

### 2. Run the Keeper Node
The keeper requires an initial "seed" to populate the oracle with 30 days of historical volatility data.
```bash
cd keeper
npm install

# 1. Seed historical data (only run once)
node seed.js

# 2. Start the cron job to maintain live volatility
node keeper.js
```

### 3. Run the Frontend
The frontend is built with Next.js and uses wagmi/viem for Web3 integration.
```bash
# From the root directory (or /app)
npm install
npm run dev
```
Navigate to `http://localhost:3000` to interact with the Vault and view the live Risk Gauges!
