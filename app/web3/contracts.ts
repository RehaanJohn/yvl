import { arbitrumSepolia, arbitrum } from 'wagmi/chains';

// ─── Contract Addresses (fill after deployment) ───────────────────────────────
export const CONTRACTS = {
  [arbitrumSepolia.id]: {
    volatilityOracle: '0xAF0b421d5C681f2C59AFB39dBF85AE85bCa094E0' as `0x${string}`,
    riskEngine:       '0xEbe17B74fF509d75cC05Ba6E920ECfD0fb54B19A' as `0x${string}`,
    lendingVault:     '0x762eb42051EFE8B55f92118D2412752AFBecA306' as `0x${string}`,
    mockUsdc:         '0xe9bf3a4FD2227072D606b60ab6538167172A8E36' as `0x${string}`,
    wethToken:        '0x39f0F2F34710327A5926979221DB6D946F5DB10f' as `0x${string}`,
    wbtcToken:        '0xa4184Fdc099203a22244E1832e552801D68a70c2' as `0x${string}`,
    linkToken:        '0xf192bD6F15dD4449E9ea7880713d327943123F3B' as `0x${string}`,
    // Legacy
    protocol:         '0x0000000000000000000000000000000000000000' as `0x${string}`,
    usdc:             '0x0000000000000000000000000000000000000000' as `0x${string}`,
    usdg:             '0x0000000000000000000000000000000000000000' as `0x${string}`,
  },
  [arbitrum.id]: {
    volatilityOracle: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    riskEngine:       '0x0000000000000000000000000000000000000000' as `0x${string}`,
    lendingVault:     '0x0000000000000000000000000000000000000000' as `0x${string}`,
    aaplToken:        '0x0000000000000000000000000000000000000000' as `0x${string}`,
    pltrToken:        '0x0000000000000000000000000000000000000000' as `0x${string}`,
    mockUsdc:         '0x0000000000000000000000000000000000000000' as `0x${string}`,
    protocol:         '0x0000000000000000000000000000000000000000' as `0x${string}`,
    usdc:             '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
    usdg:             '0x0000000000000000000000000000000000000000' as `0x${string}`,
  },
} as const;

// ─── Supported Assets ────────────────────────────────────────────────────────

export type AssetSymbol = 'AAPL' | 'PLTR';

export const ASSETS: Record<AssetSymbol, {
  name: string;
  symbol: AssetSymbol;
  color: string;        // for UI band indicator
  accentColor: string;
}> = {
  AAPL: { name: 'Apple Inc.',        symbol: 'AAPL', color: '#60a5fa', accentColor: '#3b82f6' },
  PLTR: { name: 'Palantir Tech.',    symbol: 'PLTR', color: '#a78bfa', accentColor: '#8b5cf6' },
};

// ─── VolatilityOracle ABI ────────────────────────────────────────────────────

export const VOLATILITY_ORACLE_ABI = [
  {
    "inputs": [{"internalType": "address","name": "asset","type": "address"}],
    "name": "poke",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address","name": "asset","type": "address"},
      {"internalType": "address","name": "feed","type": "address"}
    ],
    "name": "registerFeed",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "asset","type": "address"}],
    "name": "annualizedVolBps",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "asset","type": "address"}],
    "name": "getVariance",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "asset","type": "address"}],
    "name": "lastUpdated",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "","type": "address"}],
    "name": "volState",
    "outputs": [
      {"internalType": "uint256","name": "lastPrice","type": "uint256"},
      {"internalType": "uint256","name": "variance","type": "uint256"},
      {"internalType": "uint256","name": "lastUpdated","type": "uint256"},
      {"internalType": "bool","name": "initialized","type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true,"internalType": "address","name": "asset","type": "address"},
      {"internalType": "uint256","name": "variance","type": "uint256"},
      {"internalType": "uint256","name": "annualizedVolBps","type": "uint256"}
    ],
    "name": "VolUpdated",
    "type": "event"
  }
] as const;

// ─── RiskEngine ABI ──────────────────────────────────────────────────────────

export const RISK_ENGINE_ABI = [
  {
    "inputs": [{"internalType": "address","name": "asset","type": "address"}],
    "name": "currentBand",
    "outputs": [{"internalType": "uint8","name": "","type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "asset","type": "address"}],
    "name": "currentLTV",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "volBps","type": "uint256"}],
    "name": "simulateBand",
    "outputs": [
      {"internalType": "uint8","name": "band","type": "uint8"},
      {"internalType": "uint256","name": "ltv","type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "name": "bands",
    "outputs": [
      {"internalType": "uint256","name": "volThreshold","type": "uint256"},
      {"internalType": "uint256","name": "ltv","type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true,"internalType": "address","name": "asset","type": "address"},
      {"internalType": "uint8","name": "fromBand","type": "uint8"},
      {"internalType": "uint8","name": "toBand","type": "uint8"},
      {"internalType": "uint256","name": "newLtv","type": "uint256"}
    ],
    "name": "BandChanged",
    "type": "event"
  }
] as const;

// ─── LendingVault ABI ────────────────────────────────────────────────────────

export const LENDING_VAULT_ABI = [
  {
    "inputs": [
      {"internalType": "address","name": "asset","type": "address"},
      {"internalType": "address","name": "feed","type": "address"}
    ],
    "name": "registerAsset",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address","name": "asset","type": "address"},
      {"internalType": "uint256","name": "amount","type": "uint256"}
    ],
    "name": "deposit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address","name": "asset","type": "address"},
      {"internalType": "uint256","name": "usdcAmount","type": "uint256"}
    ],
    "name": "borrow",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "usdcAmount","type": "uint256"}],
    "name": "repay",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address","name": "asset","type": "address"},
      {"internalType": "uint256","name": "amount","type": "uint256"}
    ],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address","name": "borrower","type": "address"},
      {"internalType": "address","name": "asset","type": "address"},
      {"internalType": "uint256","name": "debtAmount","type": "uint256"}
    ],
    "name": "liquidate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address","name": "user","type": "address"},
      {"internalType": "address","name": "asset","type": "address"}
    ],
    "name": "maxBorrowable",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address","name": "user","type": "address"},
      {"internalType": "address","name": "asset","type": "address"}
    ],
    "name": "healthFactor",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address","name": "","type": "address"},
      {"internalType": "address","name": "","type": "address"}
    ],
    "name": "collateral",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "","type": "address"}],
    "name": "debt",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getSupportedAssets",
    "outputs": [{"internalType": "address[]","name": "","type": "address[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true,"internalType": "address","name": "user","type": "address"},
      {"indexed": true,"internalType": "address","name": "asset","type": "address"},
      {"internalType": "uint256","name": "amount","type": "uint256"}
    ],
    "name": "Deposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true,"internalType": "address","name": "user","type": "address"},
      {"indexed": true,"internalType": "address","name": "asset","type": "address"},
      {"internalType": "uint256","name": "usdcAmount","type": "uint256"},
      {"internalType": "uint256","name": "ltv","type": "uint256"}
    ],
    "name": "Borrowed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true,"internalType": "address","name": "liquidator","type": "address"},
      {"indexed": true,"internalType": "address","name": "borrower","type": "address"},
      {"indexed": true,"internalType": "address","name": "asset","type": "address"},
      {"internalType": "uint256","name": "debtRepaid","type": "uint256"},
      {"internalType": "uint256","name": "collateralSeized","type": "uint256"}
    ],
    "name": "Liquidated",
    "type": "event"
  }
] as const;

// ─── ERC-20 ABI ───────────────────────────────────────────────────────────────

export const ERC20_ABI = [
  {
    "inputs": [],
    "name": "name",
    "outputs": [{"internalType": "string","name": "","type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{"internalType": "string","name": "","type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "account","type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address","name": "spender","type": "address"},
      {"internalType": "uint256","name": "amount","type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"internalType": "bool","name": "","type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address","name": "owner","type": "address"},
      {"internalType": "address","name": "spender","type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address","name": "to","type": "address"},
      {"internalType": "uint256","name": "amount","type": "uint256"}
    ],
    "name": "mint",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// ─── MockV3Aggregator ABI (for demo price spike button) ───────────────────────

export const MOCK_AGGREGATOR_ABI = [
  {
    "inputs": [{"internalType": "int256","name": "_answer","type": "int256"}],
    "name": "updateAnswer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "latestAnswer",
    "outputs": [{"internalType": "int256","name": "","type": "int256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
