// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RiskEngine
/// @notice Translates annualised volatility (in bps-WAD units from VolatilityOracle) into
///         a max LTV for each collateral asset using 3 discrete volatility bands with hysteresis.
///
///         Band table (default, set in constructor):
///         ┌────────┬──────────────────────────────┬────────────────────┐
///         │  Band  │ Max annualised vol (bps-WAD)  │  Max LTV (bps)    │
///         ├────────┼──────────────────────────────┼────────────────────┤
///         │   0    │ ≤ 2,000 bps   (≤ 20%)        │ 7,500  (75%)      │
///         │   1    │ ≤ 4,000 bps   (≤ 40%)        │ 5,500  (55%)      │
///         │   2    │ > 4,000 bps                   │ 3,500  (35%)      │
///         └────────┴──────────────────────────────┴────────────────────┘
///
///         Hysteresis (300 bps buffer): vol must exceed a threshold by HYSTERESIS_BPS to step
///         *up* a band, and must fall below the threshold by HYSTERESIS_BPS to step *down*.
///         This prevents rapid LTV oscillation around a boundary — the key UX story for the demo.
contract RiskEngine {
    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant HYSTERESIS_BPS = 300; // 3% buffer in bps-WAD space

    // ─── Storage ──────────────────────────────────────────────────────────────

    struct Band {
        uint256 volThreshold; // inclusive upper bound of annualised vol in bps-WAD
        uint256 ltv;          // max LTV in basis points (10_000 = 100%)
    }

    /// @notice The three volatility bands. bands[2].volThreshold is type(uint256).max (catch-all).
    Band[3] public bands;

    /// @notice Current band index per asset. Updated lazily on each updateLTV() call.
    mapping(address => uint8) public currentBand;

    /// @notice LendingVault — only it may call updateLTV() to prevent griefing.
    address public vault;

    address public owner;

    // ─── Events ───────────────────────────────────────────────────────────────

    event BandChanged(address indexed asset, uint8 fromBand, uint8 toBand, uint256 newLtv);
    event VaultSet(address indexed vault);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error NotVault();
    error InvalidBandConfig();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;

        // Band 0 — low volatility: LTV 75%
        bands[0] = Band({ volThreshold: 2_000,                 ltv: 7_500 });
        // Band 1 — medium volatility: LTV 55%
        bands[1] = Band({ volThreshold: 4_000,                 ltv: 5_500 });
        // Band 2 — high volatility: LTV 35% (catch-all)
        bands[2] = Band({ volThreshold: type(uint256).max,     ltv: 3_500 });
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setVault(address _vault) external {
        if (msg.sender != owner) revert NotOwner();
        vault = _vault;
        emit VaultSet(_vault);
    }

    /// @notice Override band parameters post-deployment (e.g., governance upgrade path).
    function configureBands(
        uint256[3] calldata thresholds,
        uint256[3] calldata ltvs
    ) external {
        if (msg.sender != owner) revert NotOwner();
        for (uint8 i = 0; i < 3; i++) {
            bands[i] = Band({ volThreshold: thresholds[i], ltv: ltvs[i] });
        }
    }

    // ─── Core ─────────────────────────────────────────────────────────────────

    /// @notice Compute the current LTV for `asset` given its annualised vol.
    ///         Applies hysteresis: band transitions only occur when vol has cleared
    ///         the threshold by HYSTERESIS_BPS in the direction of travel.
    ///         Only callable by the registered vault.
    /// @param asset     Collateral token address
    /// @param volBps    Annualised vol in bps-WAD (from VolatilityOracle.annualizedVolBps)
    /// @return ltv      Max LTV in basis points
    function updateLTV(address asset, uint256 volBps) external returns (uint256 ltv) {
        if (msg.sender != vault) revert NotVault();

        uint8 cur    = currentBand[asset];
        uint8 target = _bandFor(volBps);

        // ── Hysteresis: dampen band oscillation at boundaries ─────────────
        if (target != cur) {
            if (target > cur) {
                // Trying to step UP: require vol to exceed the current band's upper
                // threshold by HYSTERESIS_BPS before committing.
                uint256 upperThreshold = bands[cur].volThreshold;
                if (volBps < upperThreshold + HYSTERESIS_BPS) {
                    target = cur; // not far enough above — stay in current band
                }
            } else {
                // Trying to step DOWN: require vol to fall below the target band's
                // upper threshold by HYSTERESIS_BPS before committing.
                uint256 targetUpperThreshold = bands[target].volThreshold;
                if (volBps > targetUpperThreshold - HYSTERESIS_BPS) {
                    target = cur; // not far enough below — stay in current band
                }
            }
        }

        if (target != cur) {
            emit BandChanged(asset, cur, target, bands[target].ltv);
            currentBand[asset] = target;
        }

        return bands[target].ltv;
    }

    /// @notice Pure read — current LTV without state mutation (for UI polling).
    function currentLTV(address asset) external view returns (uint256) {
        return bands[currentBand[asset]].ltv;
    }

    /// @notice Hypothetical band for a given volBps (no hysteresis, for simulation UI).
    function simulateBand(uint256 volBps) external view returns (uint8 band, uint256 ltv) {
        band = _bandFor(volBps);
        ltv  = bands[band].ltv;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @dev Returns the band index whose volThreshold is the first to be >= volBps.
    function _bandFor(uint256 volBps) internal view returns (uint8) {
        for (uint8 i = 0; i < 3; i++) {
            if (volBps <= bands[i].volThreshold) return i;
        }
        return 2; // safety — band[2].volThreshold is uint256.max so this should never fire
    }
}
