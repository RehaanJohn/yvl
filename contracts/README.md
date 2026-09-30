# YVL Smart Contracts

This directory contains the core smart contracts for the YVL (Yield Volatility Lending) protocol.

## Architecture & What Was Built

The smart contracts are designed to map on-chain volatility directly to borrowing power, replacing static LTVs with dynamic, risk-adjusted parameters.

1. **`src/VolatilityOracle.sol`**: An EWMA (Exponentially Weighted Moving Average) state machine. It reads prices from Chainlink, calculates simple returns, and updates variance using a RiskMetrics-standard decay factor (λ=0.94). It exposes a permissionless `poke()` function.
2. **`src/RiskEngine.sol`**: Maps annualized volatility to a maximum Loan-to-Value (LTV) ratio using 3 discrete volatility bands (75%, 55%, 35%). It includes a 300 bps hysteresis buffer to prevent rapid LTV oscillation (liquidation shocks) at band boundaries.
3. **`src/LendingVault.sol`**: A non-custodial vault for depositing collateral (e.g., AAPL-token, PLTR-token) and borrowing USDC. It calls the `RiskEngine` and `VolatilityOracle` dynamically to enforce LTV rules on every borrow or withdrawal.
4. **`src/MockERC20.sol`**: A mintable ERC-20 token used for testnet deployments (collateral tokens and USDC).
5. **`script/Deploy.s.sol`**: Deployment script that spins up all contracts, deploys mock Chainlink aggregators, and seeds initial liquidity.
6. **`test/Protocol.t.sol`**: A comprehensive suite of 12 passing tests covering EWMA variance, hysteresis, and vault insolvency/liquidation mechanics.

---

## How to Test in Remix IDE

You can easily deploy and interact with these contracts manually using [Remix IDE](https://remix.ethereum.org/). Remix supports importing directly from GitHub, so the `@chainlink` imports will resolve automatically.

### Step 1: Open Files in Remix
1. Open [Remix IDE](https://remix.ethereum.org/).
2. In the `contracts` folder of your Remix workspace, create the following files and paste the code from this repository into them:
   - `MockERC20.sol` (from `src/MockERC20.sol`)
   - `MockV3Aggregator.sol` (copy the `MockV3Aggregator` contract found at the bottom of `script/Deploy.s.sol`)
   - `VolatilityOracle.sol` (from `src/VolatilityOracle.sol`)
   - `RiskEngine.sol` (from `src/RiskEngine.sol`)
   - `LendingVault.sol` (from `src/LendingVault.sol`)

### Step 2: Compile
1. Go to the **Solidity Compiler** tab on the left panel.
2. Select compiler version `0.8.20` (or higher).
3. Click **Compile** for each file (or enable "Auto compile"). Ensure there are no errors.

### Step 3: Deploy & Wire Up
Go to the **Deploy & Run Transactions** tab. Use the `Remix VM (Cancun)` environment. Deploy the contracts in the following order:

1. **Deploy Mock Tokens**:
   - Select `MockERC20`. Deploy one with arguments: `"AAPL Token", "AAPLt"`
   - Deploy another `MockERC20` with arguments: `"USD Coin", "USDC"`
   - *Note down their deployed addresses.*

2. **Deploy Mock Aggregator**:
   - Select `MockV3Aggregator`. Deploy with arguments: `8, 21500000000` (represents 8 decimals, and a $215 price for AAPL).
   - *Note down its deployed address.*

3. **Deploy Protocol Contracts**:
   - Select `VolatilityOracle` and deploy (no arguments).
   - Select `RiskEngine` and deploy (no arguments).
   - Select `LendingVault` and deploy with arguments: `[VolatilityOracle Address], [RiskEngine Address], [USDC Address]`

4. **Wire Everything Together** (Call these functions in the deployed contracts list):
   - On `VolatilityOracle`: Call `registerFeed(AAPL_TOKEN_ADDRESS, AAPL_AGGREGATOR_ADDRESS)`
   - On `LendingVault`: Call `registerAsset(AAPL_TOKEN_ADDRESS, AAPL_AGGREGATOR_ADDRESS)`
   - On `RiskEngine`: Call `setVault(LENDING_VAULT_ADDRESS)`

### Step 4: Test the Flow Manually
1. **Mint Tokens**: On your AAPL `MockERC20` contract, call `mint(YOUR_REMIX_ADDRESS, 100000000000000000000)` (mints 100 tokens; 18 decimals).
2. **Approve Vault**: On your AAPL `MockERC20`, call `approve(LENDING_VAULT_ADDRESS, 100000000000000000000)`.
3. **Deposit Collateral**: On the `LendingVault`, call `deposit(AAPL_TOKEN_ADDRESS, 10000000000000000000)` (deposits 10 AAPL).
4. **Initialize Oracle**: On the `VolatilityOracle`, call `poke(AAPL_TOKEN_ADDRESS)`. This sets the baseline price.
5. **Simulate a Volatility Spike**:
   - On your `MockV3Aggregator`, call `updateAnswer(17000000000)` (price drops from $215 to $170).
   - On the `VolatilityOracle`, call `poke(AAPL_TOKEN_ADDRESS)` again to process the price drop.
   - On the `VolatilityOracle`, click `annualizedVolBps(AAPL_TOKEN_ADDRESS)` to see the volatility spike in basis points!
6. **Borrow & Check LTV**:
   - On the `LendingVault`, call `maxBorrowable(YOUR_REMIX_ADDRESS, AAPL_TOKEN_ADDRESS)`.
   - You will see the max borrow limit dynamically restricted based on the new, higher volatility band from the `RiskEngine`!

---

## Foundry Usage

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```
