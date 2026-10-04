'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useChainId } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { useUserPosition, useAssetMetadata, useAssetPrice } from '../web3/useProtocol';
import { CONTRACTS, LENDING_VAULT_ABI, ERC20_ABI } from '../web3/contracts';

interface VaultPanelProps {
  assets: `0x${string}`[];
}

type Tab = 'Deposit' | 'Borrow' | 'Repay' | 'Withdraw';

export default function VaultPanel({ assets }: VaultPanelProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const c = CONTRACTS[chainId as keyof typeof CONTRACTS] ?? CONTRACTS[421614];
  
  // UI State
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);
  const activeAsset = assets[activeAssetIndex] || c.wethToken; // Fallback
  
  const [activeTab, setActiveTab] = useState<Tab>('Deposit');
  const [usdAmount, setUsdAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hooks for live data for the active asset
  const { symbol, name } = useAssetMetadata(activeAsset);
  const { priceUsdc6Decimals } = useAssetPrice(activeAsset);
  const position = useUserPosition(address, activeAsset);
  
  const { writeContractAsync } = useWriteContract();

  // Helper to get symbol for the dropdown
  const getSymbol = (addr: string) => {
    if (!addr) return '';
    const a = addr.toLowerCase();
    if (a === c.wethToken.toLowerCase()) return 'WETH';
    if (a === c.wbtcToken.toLowerCase()) return 'WBTC';
    if (a === c.linkToken.toLowerCase()) return 'LINK';
    return addr.slice(0, 6);
  };

  const handleAction = async () => {
    if (!usdAmount || isNaN(Number(usdAmount)) || Number(usdAmount) <= 0) {
      setError('Enter a valid USD amount');
      return;
    }

    setPending(true);
    setError(null);

    try {
      // Allow up to 6 decimal places for USD, viem parseUnits handles it
      const parsedUsd = parseUnits(usdAmount, 6); 

      if (activeTab === 'Deposit' || activeTab === 'Withdraw') {
        if (!priceUsdc6Decimals || priceUsdc6Decimals === 0n) {
          throw new Error("Price feed not ready");
        }
        
        // Calculate token amount needed for this USD value
        // tokenAmount = (usdAmount * 1e18) / priceUsdc6Decimals
        const tokenAmount = (parsedUsd * 1000000000000000000n) / priceUsdc6Decimals;

        if (activeTab === 'Deposit') {
          // 1. Approve
          await writeContractAsync({
            address: activeAsset,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [c.lendingVault, tokenAmount],
            maxFeePerGas: parseUnits('0.5', 9),
          });
          // 2. Deposit
          await writeContractAsync({
            address: c.lendingVault,
            abi: LENDING_VAULT_ABI,
            functionName: 'deposit',
            args: [activeAsset, tokenAmount],
            maxFeePerGas: parseUnits('0.5', 9),
          });
        } else {
          // Withdraw
          await writeContractAsync({
            address: c.lendingVault,
            abi: LENDING_VAULT_ABI,
            functionName: 'withdraw',
            args: [activeAsset, tokenAmount],
            maxFeePerGas: parseUnits('0.5', 9),
          });
        }
      } else if (activeTab === 'Borrow' || activeTab === 'Repay') {
        const usdcAmount = parsedUsd;
        
        if (activeTab === 'Borrow') {
          await writeContractAsync({
            address: c.lendingVault,
            abi: LENDING_VAULT_ABI,
            functionName: 'borrow',
            args: [activeAsset, usdcAmount],
            maxFeePerGas: parseUnits('0.5', 9),
          });
        } else {
          // 1. Approve USDC
          await writeContractAsync({
            address: c.mockUsdc,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [c.lendingVault, usdcAmount],
            maxFeePerGas: parseUnits('0.5', 9),
          });
          // 2. Repay
          await writeContractAsync({
            address: c.lendingVault,
            abi: LENDING_VAULT_ABI,
            functionName: 'repay',
            args: [usdcAmount],
            maxFeePerGas: parseUnits('0.5', 9),
          });
        }
      }
      setUsdAmount('');
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || 'Transaction failed');
    } finally {
      setPending(false);
    }
  };

  const formattedCollateral = formatUnits(position.collateral, 18);
  const formattedCollateralUsdc = formatUnits(position.collateralUsdc, 6);
  const formattedDebt = formatUnits(position.debt, 6);
  const formattedMaxBorrow = formatUnits(position.maxBorrowable, 6);
  
  const healthClass = position.isHealthy ? 'hf-safe' : 'hf-danger';

  // Preview token conversion based on input USD amount
  const parsedUsdInput = Number(usdAmount) > 0 ? parseUnits(usdAmount, 6) : 0n;
  let tokenPreview = '0.00';
  if (parsedUsdInput > 0n && priceUsdc6Decimals > 0n && (activeTab === 'Deposit' || activeTab === 'Withdraw')) {
    const tokenAmount = (parsedUsdInput * 1000000000000000000n) / priceUsdc6Decimals;
    tokenPreview = Number(formatUnits(tokenAmount, 18)).toFixed(4);
  }

  return (
    <div className="vault-panel relative">
      <div className="vault-header flex justify-between items-center mb-6">
        <div>
          <h3 className="vault-title text-2xl font-bold font-syne text-white">Global Vault</h3>
          <span className="vault-sub text-white/50 text-sm">Manage your portfolio</span>
        </div>
        <select 
          className="bg-white/10 text-white font-syne font-bold rounded-lg px-4 py-2 outline-none border border-white/20 appearance-none cursor-pointer hover:bg-white/20 transition pr-8"
          style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.7rem top 50%', backgroundSize: '0.65rem auto' }}
          value={activeAssetIndex}
          onChange={(e) => setActiveAssetIndex(Number(e.target.value))}
        >
          {assets.map((a, i) => (
            <option key={a} value={i} className="text-black bg-white">{getSymbol(a)}</option>
          ))}
        </select>
      </div>

      <div className="vault-stats mt-6">
        <div className="v-stat">
          <span className="v-label">Deposited</span>
          <span className="v-val">
            ${Number(formattedCollateralUsdc).toFixed(2)}
            <span className="text-gray-400 text-sm ml-2">({Number(formattedCollateral).toFixed(4)} {symbol})</span>
          </span>
        </div>
        <div className="v-stat">
          <span className="v-label">Borrowed</span>
          <span className="v-val">${Number(formattedDebt).toFixed(2)} USDC</span>
        </div>
        <div className="v-stat">
          <span className="v-label">Available to Borrow</span>
          <span className="v-val hf-safe">${Number(formattedMaxBorrow).toFixed(2)} USDC</span>
        </div>
        <div className="v-stat">
          <span className="v-label">Health Factor</span>
          <span className={`v-val ${healthClass}`}>
            {position.debt === 0n ? '∞' : position.healthFactorFloat.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="vault-tabs mt-6">
        {(['Deposit', 'Borrow', 'Repay', 'Withdraw'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`v-tab ${activeTab === tab ? 'v-tab-active' : ''}`}
            onClick={() => { setActiveTab(tab); setError(null); setUsdAmount(''); }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="vault-action-area mt-4">
        <div className="v-input-wrapper relative">
          <input
            type="number"
            className="v-input pl-10 w-full"
            placeholder={activeTab === 'Borrow' ? formattedMaxBorrow : "1000.00"}
            value={usdAmount}
            onChange={(e) => setUsdAmount(e.target.value)}
            disabled={pending}
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 text-xl font-bold">$</span>
          <span className="v-input-currency absolute right-4 top-1/2 -translate-y-1/2 text-white/50 font-bold">
            USD
          </span>
        </div>
        
        {(activeTab === 'Deposit' || activeTab === 'Withdraw') && usdAmount && (
          <div className="text-right text-xs text-white/50 mt-2 px-2">
            ≈ {tokenPreview} {symbol}
          </div>
        )}

        {error && <div className="v-error mt-4">{error}</div>}

        <button className="btn-primary v-submit mt-4 w-full" onClick={handleAction} disabled={pending || !usdAmount}>
          {pending ? 'Processing...' : `${activeTab} $${usdAmount || '0'} USD`}
        </button>
      </div>
    </div>
  );
}
