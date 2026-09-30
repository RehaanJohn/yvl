// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/VolatilityOracle.sol";
import "../src/RiskEngine.sol";
import "../src/LendingVault.sol";
import "../src/MockERC20.sol";

/// @title Deploy
/// @notice Full deployment script for the YVL hackathon stack on Arbitrum Sepolia.
///
///         Run with:
///           forge script script/Deploy.s.sol \
///             --rpc-url $ARB_SEPOLIA_RPC \
///             --broadcast \
///             --verify \
///             --etherscan-api-key $ARBISCAN_KEY \
///             -vvvv
///
///         Required env vars:
///           PRIVATE_KEY         — deployer key (no 0x prefix needed if using cast wallet)
///           ARB_SEPOLIA_RPC     — e.g. https://sepolia-rollup.arbitrum.io/rpc
///           ARBISCAN_KEY        — for contract verification
///           USDC_ADDRESS        — mock USDC on Arb Sepolia (or deploy MockERC20 for it)
///
///         Chainlink feed addresses on Arbitrum Sepolia (as of 2024):
///           AAPL/USD: 0x8d0CC5f38f9E802475f2CFf7F958513be1c3D148  ← verify on docs.chain.link
///           PLTR/USD: 0x6aBbCB97DCD5A4e4b0A6c3FfB1A1B4DcF9e0c2b  ← placeholder, verify
///
contract Deploy is Script {
    // ── Chainlink Arb Sepolia feeds ──────────────────────────────────────────
    // NOTE: Verify these at https://docs.chain.link/data-feeds/price-feeds/addresses/?network=arbitrum-sepolia
    // AAPL and PLTR feeds may require Chainlink Functions / Data Streams on testnet.
    // For hackathon fallback: deploy MockV3Aggregator for both assets.
    address constant AAPL_FEED = 0x8D0cC5F38f9e802475F2cFf7F958513bE1C3D148;
    address constant PLTR_FEED = address(0); // placeholder — not used; mock aggregators deployed below

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // ── 1. Mock collateral tokens ────────────────────────────────────────
        MockERC20 aaplToken = new MockERC20("AAPL Token", "AAPLt");
        MockERC20 pltrToken = new MockERC20("PLTR Token", "PLTRt");

        // ── 2. Mock USDC (or use real USDC on testnet if available) ──────────
        MockERC20 mockUsdc  = new MockERC20("USD Coin", "USDC");
        // Override decimals to 6 if you want exact USDC parity — MockERC20 uses 18 for simplicity

        // ── 3. Core protocol contracts ───────────────────────────────────────
        VolatilityOracle oracle    = new VolatilityOracle();
        RiskEngine       riskEng   = new RiskEngine();
        LendingVault     vault     = new LendingVault(
            address(oracle),
            address(riskEng),
            address(mockUsdc)
        );

        // ── 4. Wire up oracle feeds ──────────────────────────────────────────
        // For hackathon: deploy MockV3Aggregators if real feeds aren't available
        // oracle.registerFeed(address(aaplToken), AAPL_FEED);
        // oracle.registerFeed(address(pltrToken), PLTR_FEED);

        // Hackathon path: use mock aggregators (see MockV3Aggregator below)
        MockV3Aggregator aaplAgg = new MockV3Aggregator(8, 21500_000_000_00); // AAPL ~$215
        MockV3Aggregator pltrAgg = new MockV3Aggregator(8,    24_000_000_00); // PLTR ~$24

        oracle.registerFeed(address(aaplToken), address(aaplAgg));
        oracle.registerFeed(address(pltrToken), address(pltrAgg));

        // ── 5. Wire up vault feeds ───────────────────────────────────────────
        vault.registerAsset(address(aaplToken), address(aaplAgg));
        vault.registerAsset(address(pltrToken), address(pltrAgg));

        // ── 6. Register vault with RiskEngine ────────────────────────────────
        riskEng.setVault(address(vault));

        // ── 7. Seed USDC liquidity into vault for borrowers ──────────────────
        mockUsdc.mint(address(vault), 1_000_000 * 1e18); // 1M mock USDC

        // ── 8. Faucet: mint collateral tokens to deployer for demo ───────────
        aaplToken.mint(deployer, 100 * 1e18);  // 100 AAPL tokens
        pltrToken.mint(deployer, 500 * 1e18);  // 500 PLTR tokens

        // Seed oracle with initial prices
        oracle.poke(address(aaplToken));
        oracle.poke(address(pltrToken));

        vm.stopBroadcast();

        // ── Log deployed addresses ───────────────────────────────────────────
        console.log("=== YVL Deployment ===");
        console.log("VolatilityOracle:", address(oracle));
        console.log("RiskEngine:      ", address(riskEng));
        console.log("LendingVault:    ", address(vault));
        console.log("AAPL Token:      ", address(aaplToken));
        console.log("PLTR Token:      ", address(pltrToken));
        console.log("Mock USDC:       ", address(mockUsdc));
        console.log("AAPL Aggregator: ", address(aaplAgg));
        console.log("PLTR Aggregator: ", address(pltrAgg));
    }
}

// ─── Minimal Mock Aggregator (Chainlink V3 compatible) ────────────────────────

contract MockV3Aggregator {
    uint8   public decimals;
    int256  public latestAnswer;
    uint256 public updatedAt;
    uint80  private _roundId;

    constructor(uint8 _decimals, int256 _initialAnswer) {
        decimals     = _decimals;
        latestAnswer = _initialAnswer;
        updatedAt    = block.timestamp;
        _roundId     = 1;
    }

    /// @notice Update price — called by keeper script or demo "spike" button
    function updateAnswer(int256 _answer) external {
        latestAnswer = _answer;
        updatedAt    = block.timestamp;
        _roundId++;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (_roundId, latestAnswer, updatedAt, updatedAt, _roundId);
    }

    function getRoundData(uint80 _id)
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (_id, latestAnswer, updatedAt, updatedAt, _id);
    }
}
