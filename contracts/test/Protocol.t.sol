// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/VolatilityOracle.sol";
import "../src/RiskEngine.sol";
import "../src/LendingVault.sol";
import "../src/MockERC20.sol";

/// @dev Minimal Chainlink V3 mock — lets tests control the price feed.
contract MockAgg {
    uint8   public decimals;
    int256  public latestAnswer;
    uint80  private _roundId = 1;

    constructor(uint8 d, int256 p) {
        decimals     = d;
        latestAnswer = p;
    }

    function updateAnswer(int256 p) external {
        latestAnswer = p;
        _roundId++;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, latestAnswer, block.timestamp, block.timestamp, _roundId);
    }
}

contract ProtocolTest is Test {
    VolatilityOracle oracle;
    RiskEngine       riskEng;
    LendingVault     vault;

    MockERC20  aaplToken;
    MockERC20  pltrToken;
    MockERC20  mockUsdc;
    MockAgg    aaplAgg;
    MockAgg    pltrAgg;

    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");

    function setUp() public {
        aaplToken = new MockERC20("AAPL Token", "AAPLt");
        pltrToken = new MockERC20("PLTR Token", "PLTRt");
        mockUsdc  = new MockERC20("USD Coin",   "USDC");

        // AAPL ~$215, PLTR ~$24 — 8 decimals
        aaplAgg = new MockAgg(8, 215_00_000_000);
        pltrAgg = new MockAgg(8,  24_00_000_000);

        oracle  = new VolatilityOracle();
        riskEng = new RiskEngine();
        vault   = new LendingVault(address(oracle), address(riskEng), address(mockUsdc));

        oracle.registerFeed(address(aaplToken), address(aaplAgg));
        oracle.registerFeed(address(pltrToken), address(pltrAgg));

        vault.registerAsset(address(aaplToken), address(aaplAgg));
        vault.registerAsset(address(pltrToken), address(pltrAgg));

        riskEng.setVault(address(vault));

        // Seed vault with USDC liquidity
        mockUsdc.mint(address(vault), 1_000_000 * 1e18);

        // Mint collateral to alice and bob
        aaplToken.mint(alice, 100 * 1e18);
        pltrToken.mint(alice, 500 * 1e18);
        aaplToken.mint(bob,   50  * 1e18);

        // Seed oracle
        oracle.poke(address(aaplToken));
        oracle.poke(address(pltrToken));
    }

    // ─── VolatilityOracle ─────────────────────────────────────────────────────

    function test_oracle_initialises_on_first_poke() public {
        VolState memory s = _volState(address(aaplToken));
        assertTrue(s.initialized);
        assertGt(s.lastPrice, 0);
        assertEq(s.variance, 0); // no variance yet — need two prices
    }

    function test_oracle_computes_variance_on_second_poke() public {
        // Simulate a 5% price move
        aaplAgg.updateAnswer(215_00_000_000 + 215_00_000_000 / 20);
        oracle.poke(address(aaplToken));

        VolState memory s = _volState(address(aaplToken));
        assertGt(s.variance, 0);
    }

    function test_oracle_annualized_vol_nonzero_after_move() public {
        aaplAgg.updateAnswer(220_00_000_000);
        oracle.poke(address(aaplToken));

        uint256 vol = oracle.annualizedVolBps(address(aaplToken));
        assertGt(vol, 0);
    }

    // ─── RiskEngine ───────────────────────────────────────────────────────────

    function test_risk_engine_band_0_low_vol() public {
        // vol < 2000 bps → band 0, LTV = 75%
        vm.prank(address(vault));
        uint256 ltv = riskEng.updateLTV(address(aaplToken), 1_500);
        assertEq(ltv, 7_500);
        assertEq(riskEng.currentBand(address(aaplToken)), 0);
    }

    function test_risk_engine_band_1_medium_vol() public {
        // vol exactly at 2000 = band 0; need 2000 + HYSTERESIS (300) = 2300 to flip
        vm.prank(address(vault));
        riskEng.updateLTV(address(aaplToken), 2_500); // should stay band 0 (only 500 above, need 300 buffer + prior band)
        // Actually 2500 > 2000 so target=1 but buffer check: 2500 < 2000+300=2300? No, 2500>2300 → flips
        assertEq(riskEng.currentBand(address(aaplToken)), 1);

        vm.prank(address(vault));
        uint256 ltv = riskEng.currentLTV(address(aaplToken));
        assertEq(ltv, 5_500);
    }

    function test_risk_engine_hysteresis_prevents_immediate_downgrade() public {
        // Move to band 1
        vm.prank(address(vault));
        riskEng.updateLTV(address(aaplToken), 2_500);
        assertEq(riskEng.currentBand(address(aaplToken)), 1);

        // Vol drops to 1_900 — below band 0 threshold (2000) but within hysteresis (2000-300=1700)
        // 1900 > 1700 → should stay in band 1
        vm.prank(address(vault));
        riskEng.updateLTV(address(aaplToken), 1_900);
        assertEq(riskEng.currentBand(address(aaplToken)), 1, "Hysteresis should block downgrade");

        // Vol drops to 1_600 — below 1700 → should now move to band 0
        vm.prank(address(vault));
        riskEng.updateLTV(address(aaplToken), 1_600);
        assertEq(riskEng.currentBand(address(aaplToken)), 0, "Should now downgrade to band 0");
    }

    // ─── LendingVault ─────────────────────────────────────────────────────────

    function test_deposit_increases_collateral() public {
        uint256 depositAmt = 10 * 1e18;
        vm.startPrank(alice);
        aaplToken.approve(address(vault), depositAmt);
        vault.deposit(address(aaplToken), depositAmt);
        vm.stopPrank();

        assertEq(vault.collateral(alice, address(aaplToken)), depositAmt);
    }

    function test_borrow_within_ltv() public {
        uint256 depositAmt = 10 * 1e18; // 10 AAPL @ $215 = $2,150 collateral
        vm.startPrank(alice);
        aaplToken.approve(address(vault), depositAmt);
        vault.deposit(address(aaplToken), depositAmt);

        // At initial state (variance=0, band 0, LTV=75%), max borrow ≈ $1,612
        uint256 maxBorrow = vault.maxBorrowable(alice, address(aaplToken));
        assertGt(maxBorrow, 0);

        // Borrow half of max
        vault.borrow(address(aaplToken), maxBorrow / 2);
        vm.stopPrank();

        assertEq(vault.debt(alice), maxBorrow / 2);
    }

    function test_borrow_reverts_over_ltv() public {
        uint256 depositAmt = 10 * 1e18;
        vm.startPrank(alice);
        aaplToken.approve(address(vault), depositAmt);
        vault.deposit(address(aaplToken), depositAmt);

        uint256 maxBorrow = vault.maxBorrowable(alice, address(aaplToken));

        vm.expectRevert(LendingVault.ExceedsMaxBorrow.selector);
        vault.borrow(address(aaplToken), maxBorrow + 1);
        vm.stopPrank();
    }

    function test_repay_reduces_debt() public {
        uint256 depositAmt = 10 * 1e18;
        vm.startPrank(alice);
        aaplToken.approve(address(vault), depositAmt);
        vault.deposit(address(aaplToken), depositAmt);

        uint256 maxBorrow = vault.maxBorrowable(alice, address(aaplToken));
        vault.borrow(address(aaplToken), maxBorrow / 2);

        // Approve USDC repayment
        mockUsdc.approve(address(vault), maxBorrow / 4);
        vault.repay(maxBorrow / 4);
        vm.stopPrank();

        assertEq(vault.debt(alice), maxBorrow / 4);
    }

    function test_health_factor_drops_on_vol_spike() public {
        // Alice deposits and borrows at max
        uint256 depositAmt = 10 * 1e18;
        vm.startPrank(alice);
        aaplToken.approve(address(vault), depositAmt);
        vault.deposit(address(aaplToken), depositAmt);
        uint256 maxBorrow = vault.maxBorrowable(alice, address(aaplToken));
        vault.borrow(address(aaplToken), maxBorrow);
        vm.stopPrank();

        uint256 hfBefore = vault.healthFactor(alice, address(aaplToken));

        // Simulate volatility spike — push AAPL price down 20% then poke
        aaplAgg.updateAnswer(215_00_000_000 * 80 / 100);
        oracle.poke(address(aaplToken));

        // After a big move, collateral value drops — HF should be lower
        uint256 hfAfter = vault.healthFactor(alice, address(aaplToken));
        assertLt(hfAfter, hfBefore, "Health factor should drop on price decline");
    }

    function test_liquidation_works_when_unhealthy() public {
        // Alice borrows max
        uint256 depositAmt = 10 * 1e18;
        vm.startPrank(alice);
        aaplToken.approve(address(vault), depositAmt);
        vault.deposit(address(aaplToken), depositAmt);
        uint256 maxBorrow = vault.maxBorrowable(alice, address(aaplToken));
        vault.borrow(address(aaplToken), maxBorrow);
        vm.stopPrank();

        // Crash AAPL price 40% — should make Alice liquidatable
        aaplAgg.updateAnswer(215_00_000_000 * 60 / 100);
        oracle.poke(address(aaplToken));

        uint256 hf = vault.healthFactor(alice, address(aaplToken));
        // HF should be below LIQUIDATION_THRESHOLD for liquidation to be possible
        // (depends on LTV band; at band 0 LTV=75%, a 40% price drop leaves HF = 60/75 = 80% < 95%)
        assertLt(hf, vault.LIQUIDATION_THRESHOLD());

        // Bob liquidates alice
        uint256 aliceDebt = vault.debt(alice);
        mockUsdc.mint(bob, aliceDebt);
        vm.startPrank(bob);
        mockUsdc.approve(address(vault), aliceDebt);
        vault.liquidate(alice, address(aaplToken), aliceDebt);
        vm.stopPrank();

        assertEq(vault.debt(alice), 0, "Alice's debt should be cleared");
        assertGt(aaplToken.balanceOf(bob), 0, "Bob should receive collateral");
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    struct VolState {
        uint256 lastPrice;
        uint256 variance;
        uint256 lastUpdated;
        bool    initialized;
    }

    function _volState(address asset) internal view returns (VolState memory s) {
        (s.lastPrice, s.variance, s.lastUpdated, s.initialized) = oracle.volState(asset);
    }
}
