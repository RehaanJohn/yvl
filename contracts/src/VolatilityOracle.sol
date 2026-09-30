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

    // ─── Storage ──────────────────────────────────────────────────────────────

    struct VolState {
        uint256 lastPrice;    // WAD-scaled (18 dp)
        uint256 variance;     // WAD-scaled EWMA variance of simple returns  r_t = (p_t - p_{t-1}) / p_{t-1}
        uint256 lastUpdated;  // unix timestamp of last poke
        bool    initialized;  // false until first poke sets lastPrice
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
    ///         First call initialises lastPrice; second call begins tracking variance.
    function poke(address asset) external {
        AggregatorV3Interface feed = feeds[asset];
        if (address(feed) == address(0)) revert FeedNotRegistered(asset);

        (, int256 rawPrice,,,) = feed.latestRoundData();
        uint256 price = _scaleToWad(rawPrice, feed.decimals());

        VolState storage s = volState[asset];

        // ── First observation: seed lastPrice, nothing to compute yet ──────
        if (!s.initialized) {
            s.lastPrice   = price;
            s.initialized = true;
            s.lastUpdated = block.timestamp;
            return;
        }

        // ── Compute simple return r_t = (p_t - p_{t-1}) / p_{t-1} ─────────
        // Using signed math to correctly handle down-moves.
        // Simple return is a fine approximation for daily moves in the hackathon context.
        // (A production implementation would use ln(p_t/p_{t-1}) via a TWAP or Taylor series.)
        int256 ret    = (int256(price) - int256(s.lastPrice)) * int256(WAD) / int256(s.lastPrice);
        uint256 retSq = uint256(ret * ret) / WAD; // r_t^2, WAD-scaled

        // ── EWMA update: σ²_t = λ·σ²_{t-1} + (1-λ)·r_t² ─────────────────
        s.variance    = (LAMBDA * s.variance + (WAD - LAMBDA) * retSq) / WAD;
        s.lastPrice   = price;
        s.lastUpdated = block.timestamp;

        emit VolUpdated(asset, s.variance, annualizedVolBps(asset));
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @notice Annualised volatility in basis-point-scale WAD units.
    ///         Annualisation: σ_annual = σ_daily × √252.
    ///         Assumes poke() is called approximately once per trading day.
    ///         Returns 0 if the oracle is uninitialised or variance is still zero.
    function annualizedVolBps(address asset) public view returns (uint256) {
        uint256 dailyVol = _sqrt(volState[asset].variance * WAD); // √(σ²), WAD-scaled
        // √252 ≈ 15.874; multiply then scale: result is a WAD fraction (e.g. 0.25e18 = 25%)
        return (dailyVol * 15874) / (WAD / 100); // expressed in bps-space (×10000) for RiskEngine
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
