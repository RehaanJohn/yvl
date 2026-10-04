// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title VolatilityOracle
/// @notice EWMA (Exponentially Weighted Moving Average) volatility oracle for tokenised equity assets.
///         Uses the RiskMetrics-standard decay factor λ=0.94. O(1) state per asset, O(1) update cost.
///         Designed for AAPL-token and PLTR-token on Arbitrum Sepolia (hackathon scope).
contract VolatilityOracle {
    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant WAD    = 1e18;
    /// @dev λ = 0.94 — J.P. Morgan RiskMetrics standard. Weights the most recent squared return
    ///      at (1-λ)=6% and decays older observations geometrically. Half-life ≈ 11.2 trading days.
    uint256 public constant LAMBDA = 0.94e18;

    /// @dev Variance is stored as a PER-SECOND variance (squared return ÷ seconds elapsed between
    ///      two feed observations), scaled by an extra VAR_PREC for precision. This makes the
    ///      annualised figure independent of how often anyone calls poke().
    uint256 public constant VAR_PREC          = 1e6;
    uint256 public constant SECONDS_PER_YEAR  = 365 days;

    // ─── Storage ──────────────────────────────────────────────────────────────

    struct VolState {
        uint256 lastPrice;    // WAD-scaled (18 dp)
        uint256 variance;     // EWMA per-second variance of simple returns, scaled by WAD * VAR_PREC
        uint256 lastUpdated;  // unix timestamp of last poke
        bool    initialized;  // false until first poke sets lastPrice
        uint256 lastFeedTime; // feed `updatedAt` of the last observation consumed
    }

    /// @notice Chainlink price feed per collateral asset address
    mapping(address => AggregatorV3Interface) public feeds;

    /// @notice EWMA state per collateral asset
    mapping(address => VolState) public volState;

    /// @notice Owner — can register feeds; transfers are intentionally omitted for hackathon scope
    address public owner;

    // ─── Events ───────────────────────────────────────────────────────────────

    event FeedRegistered(address indexed asset, address indexed feed);
    event VolUpdated(address indexed asset, uint256 variance, uint256 annualizedVolBps);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error FeedNotRegistered(address asset);
    error BadPrice();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Register a Chainlink price feed for a collateral asset.
    ///         Called once per asset during deployment.
    function registerFeed(address asset, address feed) external {
        if (msg.sender != owner) revert NotOwner();
        feeds[asset] = AggregatorV3Interface(feed);
        emit FeedRegistered(asset, feed);
    }

    // ─── Core — permissionless poke ───────────────────────────────────────────

    /// @notice Read the Chainlink feed and update the EWMA variance for `asset`.
    ///         Permissionless — callable by keepers, borrowers, or anyone.
    ///         First call initialises lastPrice; later calls consume a new observation only
    ///         when the feed itself has published a newer round (updatedAt advanced).
    function poke(address asset) external {
        AggregatorV3Interface feed = feeds[asset];
        if (address(feed) == address(0)) revert FeedNotRegistered(asset);

        (, int256 rawPrice,, uint256 feedTime,) = feed.latestRoundData();
        uint256 price = _scaleToWad(rawPrice, feed.decimals());

        VolState storage s = volState[asset];

        // ── First observation: seed lastPrice, nothing to compute yet ──────
        if (!s.initialized) {
            s.lastPrice    = price;
            s.initialized  = true;
            s.lastUpdated  = block.timestamp;
            s.lastFeedTime = feedTime;
            return;
        }

        s.lastUpdated = block.timestamp;

        // No new feed round since the last observation → nothing to learn.
        if (feedTime <= s.lastFeedTime) return;

        s.variance     = _ewma(s.variance, s.lastPrice, price, feedTime - s.lastFeedTime);
        s.lastPrice    = price;
        s.lastFeedTime = feedTime;

        emit VolUpdated(asset, s.variance, annualizedVolBps(asset));
    }

    // ─── Admin — history seeding ──────────────────────────────────────────────

    /// @notice Warm-start the EWMA from real historical prices so volatility is meaningful
    ///         from day one (instead of 0% until weeks of pokes accumulate).
    /// @param asset    Collateral asset (feed must be registered)
    /// @param prices   Historical prices, WAD-scaled, oldest first
    /// @param dts      dts[i] = seconds between prices[i-1] and prices[i] (dts[0] ignored)
    function seedHistory(address asset, uint256[] calldata prices, uint256[] calldata dts) external {
        if (msg.sender != owner) revert NotOwner();
        AggregatorV3Interface feed = feeds[asset];
        if (address(feed) == address(0)) revert FeedNotRegistered(asset);
        require(prices.length >= 2 && prices.length == dts.length, "bad history");

        uint256 v = 0;
        for (uint256 i = 1; i < prices.length; i++) {
            if (dts[i] == 0 || prices[i - 1] == 0) continue;
            v = _ewma(v, prices[i - 1], prices[i], dts[i]);
        }

        // Anchor to the live feed so the next real poke measures live-vs-live.
        (, int256 rawPrice,, uint256 feedTime,) = feed.latestRoundData();
        VolState storage s = volState[asset];
        s.variance     = v;
        s.lastPrice    = _scaleToWad(rawPrice, feed.decimals());
        s.lastUpdated  = block.timestamp;
        s.lastFeedTime = feedTime;
        s.initialized  = true;

        emit VolUpdated(asset, v, annualizedVolBps(asset));
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @notice Annualised volatility in plain basis points (3,000 = 30%).
    ///         σ_annual² = σ_per_second² × seconds_per_year, so the result does not depend on
    ///         how frequently the oracle is poked.
    ///         Returns 0 if the oracle is uninitialised or variance is still zero.
    function annualizedVolBps(address asset) public view returns (uint256) {
        uint256 annVar = volState[asset].variance * SECONDS_PER_YEAR / VAR_PREC; // WAD-scaled
        uint256 vol    = _sqrt(annVar * WAD);                                    // WAD-scaled fraction
        return vol * 10_000 / WAD;
    }

    /// @notice Raw EWMA variance, WAD-scaled (for advanced callers).
    function getVariance(address asset) external view returns (uint256) {
        return volState[asset].variance;
    }

    /// @notice Timestamp of the last poke for staleness checks.
    function lastUpdated(address asset) external view returns (uint256) {
        return volState[asset].lastUpdated;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /// @dev One EWMA step: σ²_t = λ·σ²_{t-1} + (1-λ)·(r_t² / dt), r_t = (p_t - p_{t-1}) / p_{t-1}.
    function _ewma(uint256 prevVar, uint256 prevPrice, uint256 price, uint256 dt)
        internal pure returns (uint256)
    {
        // Simple return (signed to handle down-moves). A production version would use ln(p_t/p_{t-1}).
        int256 ret    = (int256(price) - int256(prevPrice)) * int256(WAD) / int256(prevPrice);
        uint256 retSq = uint256(ret * ret) / WAD;        // r², WAD-scaled
        uint256 perSec = retSq * VAR_PREC / dt;          // per-second variance
        return (LAMBDA * prevVar + (WAD - LAMBDA) * perSec) / WAD;
    }

    /// @dev Integer square root via Babylonian method. Input and output are WAD-scaled.
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /// @dev Scale a Chainlink raw price (any decimal precision) to WAD (18 dp).
    function _scaleToWad(int256 price, uint8 decimals) internal pure returns (uint256) {
        if (price <= 0) revert BadPrice();
        if (decimals <= 18) {
            return uint256(price) * (10 ** (18 - decimals));
        } else {
            return uint256(price) / (10 ** (decimals - 18));
        }
    }
}
