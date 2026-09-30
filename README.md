# YVL — Yield Volatility Lending

> Hackathon MVP — dynamic LTV lending against tokenised equities (AAPL, PLTR) with EWMA volatility-adjusted risk bands.

## Architecture

```
contracts/
  src/
    VolatilityOracle.sol   ← EWMA state machine, O(1) poke
    RiskEngine.sol          ← vol → LTV mapping, 3-band hysteresis
    LendingVault.sol        ← deposit/borrow/repay/withdraw/liquidate
    MockERC20.sol           ← testnet collateral tokens + USDC
  script/
    Deploy.s.sol            ← full deployment + mock aggregators
  test/
    Protocol.t.sol          ← 12 tests, all passing

keeper/
  keeper.js                 ← cron that calls poke() per asset

app/
  web3/
    contracts.ts            ← ABIs + addresses
    useProtocol.ts          ← useAssetRisk + useUserPosition hooks
  components/
    RiskGaugePanel.tsx      ← live arc gauges (vol %, band, LTV)
    VolSpikeButton.tsx      ← demo spike button (on-stage moment)
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| EWMA decay λ | 0.94 | RiskMetrics standard (J.P. Morgan) — half-life ≈ 11 days |
| Return type | Simple (not log) | Avoids `ln` in Solidity; fine for hackathon-scale moves |
| LTV model | 3 discrete bands | Auditable, demo-able, no continuous curve complexity |
| Hysteresis | 300 bps buffer | Prevents LTV oscillation at boundaries — the UX story |
| Keeper | Permissionless `poke()` | Self-updates on borrow/repay; keeper is optional for demo |

## Volatility Bands

| Band | Annualised Vol | Max LTV |
|------|---------------|---------|
| 0 — Low    | ≤ 20% (2,000 bps) | **75%** |
| 1 — Medium | ≤ 40% (4,000 bps) | **55%** |
| 2 — High   | > 40%             | **35%** |

Hysteresis: vol must clear the threshold by **±300 bps** to trigger a band transition.

## Quickstart

### 1. Install Foundry
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 2. Build & test
```bash
cd contracts
forge build
forge test -vv
```

### 3. Deploy to Arbitrum Sepolia
```bash
cp .env.example .env
# fill PRIVATE_KEY and ARB_SEPOLIA_RPC

forge script script/Deploy.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_KEY \
  -vvvv
```

### 4. Fill deployed addresses
Paste the logged addresses into `app/web3/contracts.ts` under `arbitrumSepolia.id`.

### 5. Run frontend
```bash
npm run dev
```

### 6. Run keeper
```bash
cd keeper
npm install
node keeper.js
```

## Demo Moment (on-stage)

1. **RiskGaugePanel** shows live vol % + band pips for AAPL and PLTR
2. Click **"−40% AAPL"** in `VolSpikeButton` → calls `MockAggregator.updateAnswer` + `oracle.poke` on-chain
3. Watch the arc gauge animate from green (Band 0, 75% LTV) → amber → red (Band 2, 35% LTV)
4. The hysteresis buffer means LTV steps down in increments, not a cliff — *that's the pitch*
5. Click **Reset** to restore baseline prices

## Frontend Hooks

```ts
// Live vol + band polling (30s interval)
const { annualizedVolPct, bandLabel, currentLTVPct, bandColor } = useAssetRisk(assetAddress)

// User position (15s interval)
const { collateral, debt, healthFactorFloat, isHealthy } = useUserPosition(user, asset)
```
