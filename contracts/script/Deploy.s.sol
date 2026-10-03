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
    // Official Chainlink Price Feeds on Arbitrum Sepolia
    address constant ETH_FEED  = 0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165; // ETH/USD
    address constant BTC_FEED  = 0x56a43EB56Da12C0dc1D972ACb089c06a5dEF8e69; // BTC/USD
    address constant LINK_FEED = 0xB7C8Fb1db45007F98a68DA0588E1Aa524C318F0d; // LINK/USD

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // ── 1. Mock collateral tokens (acting as testnet WETH, WBTC, LINK) ──
        MockERC20 wethToken = new MockERC20("Wrapped Ether", "WETH");
        MockERC20 wbtcToken = new MockERC20("Wrapped Bitcoin", "WBTC");
        MockERC20 linkToken = new MockERC20("Chainlink", "LINK");

        // ── 2. Mock USDC ──────────────────────────────────────────────────────
        MockERC20 mockUsdc  = new MockERC20("USD Coin", "USDC");

        // ── 3. Core protocol contracts ───────────────────────────────────────
        VolatilityOracle oracle    = new VolatilityOracle();
        RiskEngine       riskEng   = new RiskEngine();
        LendingVault     vault     = new LendingVault(
            address(oracle),
            address(riskEng),
            address(mockUsdc)
        );

        // ── 4. Wire up oracle to feeds ──────────────────────────────────
        oracle.registerFeed(address(wethToken), ETH_FEED);
        oracle.registerFeed(address(wbtcToken), BTC_FEED);

        MockV3Aggregator linkAgg = new MockV3Aggregator(8, 15_000_000_00); // LINK ~$15
        oracle.registerFeed(address(linkToken), address(linkAgg));

        // ── 5. Wire up vault feeds ───────────────────────────────────────────
        vault.registerAsset(address(wethToken), ETH_FEED);
        vault.registerAsset(address(wbtcToken), BTC_FEED);
        vault.registerAsset(address(linkToken), address(linkAgg));

        // ── 6. Register vault with RiskEngine ────────────────────────────────
        riskEng.setVault(address(vault));

        // ── 7. Seed USDC liquidity into vault for borrowers ──────────────────
        mockUsdc.mint(address(vault), 1_000_000 * 1e18);

        // ── 8. Faucet: mint collateral tokens to deployer for demo ───────────
        wethToken.mint(deployer, 100 * 1e18);
        wbtcToken.mint(deployer, 10 * 1e18);
        linkToken.mint(deployer, 5000 * 1e18);

        // Seed oracle with initial prices (reads from the live Arbitrum Sepolia network)
        oracle.poke(address(wethToken));
        oracle.poke(address(wbtcToken));
        oracle.poke(address(linkToken));

        vm.stopBroadcast();

        // ── Log deployed addresses ───────────────────────────────────────────
        console.log("=== YVL Deployment ===");
        console.log("VolatilityOracle:", address(oracle));
        console.log("RiskEngine:      ", address(riskEng));
        console.log("LendingVault:    ", address(vault));
        console.log("WETH Token:      ", address(wethToken));
        console.log("WBTC Token:      ", address(wbtcToken));
        console.log("LINK Token:      ", address(linkToken));
        console.log("Mock USDC:       ", address(mockUsdc));
        console.log("LINK Mock Agg:   ", address(linkAgg));
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
