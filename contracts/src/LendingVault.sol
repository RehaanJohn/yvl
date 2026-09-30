// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./VolatilityOracle.sol";
import "./RiskEngine.sol";

/// @title LendingVault
/// @notice Non-custodial lending vault that accepts AAPL-token and PLTR-token as collateral
///         and lends USDC. Max LTV is dynamically computed from live EWMA volatility.
///
///         Key flows:
///           deposit(asset, amount)           — lock collateral
///           borrow(asset, usdcAmount)        — borrow against deposited collateral
///           repay(usdcAmount)                — repay outstanding debt
///           withdraw(asset, amount)          — retrieve collateral (if health factor OK)
///           liquidate(borrower, asset)       — seize collateral when HF < 1
///
///         Every borrow/withdraw checks VolatilityOracle + RiskEngine inline,
///         so the vault self-updates on user activity even without a keeper.
///
/// @dev Hackathon scope: two hard-coded assets, no interest accrual, 1:1 USD price
///      assumed via Chainlink feed (feed price IS the collateral value).
contract LendingVault {
    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant WAD                 = 1e18;
    uint256 public constant LIQUIDATION_BONUS   = 500;  // 5% bonus to liquidators (bps)
    uint256 public constant LIQUIDATION_THRESHOLD = 9_500; // HF must drop below 0.95 to be liquidatable

    // ─── Immutables ───────────────────────────────────────────────────────────

    VolatilityOracle public immutable oracle;
    RiskEngine       public immutable riskEngine;
    IERC20           public immutable usdc;

    // ─── Storage ──────────────────────────────────────────────────────────────

    /// @notice Supported collateral assets. Only AAPL-token and PLTR-token for hackathon.
    mapping(address => bool) public supportedAssets;

    /// @notice Chainlink USD price feed per collateral asset (same feeds as oracle).
    mapping(address => AggregatorV3Interface) public priceFeeds;
    mapping(address => uint8) public feedDecimals;

    /// @notice Collateral deposited: user → asset → amount (in asset's native decimals).
    mapping(address => mapping(address => uint256)) public collateral;

    /// @notice USDC debt per user (6 decimals, same as USDC).
    mapping(address => uint256) public debt;

    address public owner;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AssetRegistered(address indexed asset, address indexed feed);
    event Deposited(address indexed user, address indexed asset, uint256 amount);
    event Borrowed(address indexed user, address indexed asset, uint256 usdcAmount, uint256 ltv);
    event Repaid(address indexed user, uint256 usdcAmount);
    event Withdrawn(address indexed user, address indexed asset, uint256 amount);
    event Liquidated(
        address indexed liquidator,
        address indexed borrower,
        address indexed asset,
        uint256 debtRepaid,
        uint256 collateralSeized
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error AssetNotSupported(address asset);
    error InsufficientCollateral();
    error ExceedsMaxBorrow();
    error HealthFactorOK();
    error ZeroAmount();
    error TransferFailed();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _oracle, address _riskEngine, address _usdc) {
        oracle      = VolatilityOracle(_oracle);
        riskEngine  = RiskEngine(_riskEngine);
        usdc        = IERC20(_usdc);
        owner       = msg.sender;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Register a collateral asset with its USD price feed.
    ///         The same feed address should be registered in VolatilityOracle too.
    function registerAsset(address asset, address feed) external {
        if (msg.sender != owner) revert NotOwner();
        supportedAssets[asset] = true;
        priceFeeds[asset]      = AggregatorV3Interface(feed);
        feedDecimals[asset]    = AggregatorV3Interface(feed).decimals();
        emit AssetRegistered(asset, feed);
    }

    // ─── User actions ─────────────────────────────────────────────────────────

    /// @notice Deposit collateral. Pokes the oracle so vol is fresh on first borrow.
    function deposit(address asset, uint256 amount) external {
        if (!supportedAssets[asset]) revert AssetNotSupported(asset);
        if (amount == 0) revert ZeroAmount();

        collateral[msg.sender][asset] += amount;
        _safeTransferFrom(IERC20(asset), msg.sender, address(this), amount);

        // Opportunistic oracle update on deposit activity (no keeper needed for demo)
        try oracle.poke(asset) {} catch {}

        emit Deposited(msg.sender, asset, amount);
    }

    /// @notice Borrow USDC against deposited collateral.
    ///         Refreshes oracle + RiskEngine inline so LTV is always current.
    function borrow(address asset, uint256 usdcAmount) external {
        if (!supportedAssets[asset]) revert AssetNotSupported(asset);
        if (usdcAmount == 0) revert ZeroAmount();

        uint256 maxBorrow = maxBorrowable(msg.sender, asset);
        if (debt[msg.sender] + usdcAmount > maxBorrow) revert ExceedsMaxBorrow();

        debt[msg.sender] += usdcAmount;

        uint256 ltv = riskEngine.currentLTV(asset);
        _safeTransfer(usdc, msg.sender, usdcAmount);

        emit Borrowed(msg.sender, asset, usdcAmount, ltv);
    }

    /// @notice Repay USDC debt (full or partial).
    function repay(uint256 usdcAmount) external {
        if (usdcAmount == 0) revert ZeroAmount();
        uint256 owed = debt[msg.sender];
        uint256 repayAmt = usdcAmount > owed ? owed : usdcAmount;

        debt[msg.sender] -= repayAmt;
        _safeTransferFrom(usdc, msg.sender, address(this), repayAmt);

        emit Repaid(msg.sender, repayAmt);
    }

    /// @notice Withdraw collateral. Reverts if withdrawal would breach current LTV.
    function withdraw(address asset, uint256 amount) external {
        if (!supportedAssets[asset]) revert AssetNotSupported(asset);
        if (amount == 0) revert ZeroAmount();
        if (collateral[msg.sender][asset] < amount) revert InsufficientCollateral();

        // Check health factor remains safe after withdrawal
        uint256 remaining = collateral[msg.sender][asset] - amount;
        uint256 ltv = _getLTV(msg.sender, asset);

        if (debt[msg.sender] > 0) {
            uint256 remainingValue = _collateralValueUsdc(asset, remaining);
            uint256 maxDebt = (remainingValue * ltv) / 10_000;
            if (debt[msg.sender] > maxDebt) revert ExceedsMaxBorrow();
        }

        collateral[msg.sender][asset] -= amount;
        _safeTransfer(IERC20(asset), msg.sender, amount);

        emit Withdrawn(msg.sender, asset, amount);
    }

    /// @notice Liquidate an underwater position.
    ///         Caller repays `debtAmount` USDC and receives collateral + 5% bonus.
    function liquidate(address borrower, address asset, uint256 debtAmount) external {
        if (healthFactor(borrower, asset) >= LIQUIDATION_THRESHOLD) revert HealthFactorOK();

        uint256 owed = debt[borrower];
        uint256 repayAmt = debtAmount > owed ? owed : debtAmount;

        // Calculate collateral to seize: debt value + liquidation bonus
        uint256 collatToSeize = _usdcToCollateral(
            asset,
            repayAmt + (repayAmt * LIQUIDATION_BONUS) / 10_000
        );
        if (collatToSeize > collateral[borrower][asset]) {
            collatToSeize = collateral[borrower][asset];
        }

        debt[borrower]                     -= repayAmt;
        collateral[borrower][asset]         -= collatToSeize;

        _safeTransferFrom(usdc, msg.sender, address(this), repayAmt);
        _safeTransfer(IERC20(asset), msg.sender, collatToSeize);

        emit Liquidated(msg.sender, borrower, asset, repayAmt, collatToSeize);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @notice Maximum USDC a user can borrow against their collateral of `asset`.
    ///         Pokes the oracle and updates the RiskEngine — the primary demo-wiring point.
    function maxBorrowable(address user, address asset) public returns (uint256) {
        // Inline oracle poke — vault is self-updating on every borrow query
        try oracle.poke(asset) {} catch {}

        uint256 volBps = oracle.annualizedVolBps(asset);
        uint256 ltv    = riskEngine.updateLTV(asset, volBps);
        uint256 collatValue = _collateralValueUsdc(asset, collateral[user][asset]);
        return (collatValue * ltv) / 10_000;
    }

    /// @notice Health factor in bps (10_000 = 100%). Below LIQUIDATION_THRESHOLD = liquidatable.
    ///         Returns type(uint256).max if debt is zero.
    function healthFactor(address user, address asset) public view returns (uint256) {
        uint256 d = debt[user];
        if (d == 0) return type(uint256).max;

        uint256 ltv         = riskEngine.currentLTV(asset);
        uint256 collatValue = _collateralValueUsdc(asset, collateral[user][asset]);
        uint256 maxDebt     = (collatValue * ltv) / 10_000;

        return (maxDebt * 10_000) / d;
    }

    /// @notice USD value of a given collateral amount, denominated in USDC (6 dp).
    function collateralValueUsdc(address asset, uint256 amount) external view returns (uint256) {
        return _collateralValueUsdc(asset, amount);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _getLTV(address user, address asset) internal view returns (uint256) {
        // Read-only LTV from RiskEngine (no state mutation)
        return riskEngine.currentLTV(asset);
    }

    function _collateralValueUsdc(address asset, uint256 amount) internal view returns (uint256) {
        if (amount == 0) return 0;
        (, int256 rawPrice,,,) = priceFeeds[asset].latestRoundData();
        if (rawPrice <= 0) return 0;

        uint8 dec = feedDecimals[asset];
        // price has `dec` decimals, amount has 18 decimals (ERC-20), result in 6 dp (USDC)
        // formula: (amount_18 * price_dec) / (10^18 * 10^dec) * 10^6
        //        = (amount_18 * price_dec * 1e6) / (1e18 * 10^dec)
        return (amount * uint256(rawPrice) * 1e6) / (WAD * (10 ** dec));
    }

    function _usdcToCollateral(address asset, uint256 usdcAmount) internal view returns (uint256) {
        (, int256 rawPrice,,,) = priceFeeds[asset].latestRoundData();
        if (rawPrice <= 0) return 0;

        uint8 dec = feedDecimals[asset];
        // inverse of _collateralValueUsdc
        return (usdcAmount * WAD * (10 ** dec)) / (uint256(rawPrice) * 1e6);
    }

    function _safeTransfer(IERC20 token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, amount)
        );
        if (!ok || (data.length > 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, amount)
        );
        if (!ok || (data.length > 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}

// ─── Minimal ERC-20 interface ─────────────────────────────────────────────────

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}
