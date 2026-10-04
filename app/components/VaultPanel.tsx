'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useChainId } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { useUserPosition, useAssetRisk } from '../web3/useProtocol';
import { CONTRACTS, LENDING_VAULT_ABI, ERC20_ABI } from '../web3/contracts';

interface VaultPanelProps {
  assetAddress: `0x${string}`;
  symbol: string;
  name: string;
}

type Tab = 'Deposit' | 'Borrow' | 'Repay' | 'Withdraw';

export default function VaultPanel({ assetAddress, symbol, name }: VaultPanelProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const c = CONTRACTS[chainId as keyof typeof CONTRACTS] ?? CONTRACTS[421614];
  
  // Hooks for live data
  const position = useUserPosition(address, assetAddress);
  const risk = useAssetRisk(assetAddress);

  // UI State
  const [activeTab, setActiveTab] = useState<Tab>('Deposit');
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  const handleAction = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Enter a valid amount');
      return;
    }

    setPending(true);
    setError(null);

    try {
      if (activeTab === 'Deposit') {
        const value = parseUnits(amount, 18);
        // 1. Approve
        await writeContractAsync({
          address: assetAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [c.lendingVault, value],
          maxFeePerGas: parseUnits('0.5', 9), // 0.1 gwei (Arbitrum base is ~0.05 gwei)
        });
        // 2. Deposit
        await writeContractAsync({
          address: c.lendingVault,
          abi: LENDING_VAULT_ABI,
          functionName: 'deposit',
          args: [assetAddress, value],
          maxFeePerGas: parseUnits('0.5', 9),
        });
      } else if (activeTab === 'Borrow') {
        const value = parseUnits(amount, 6); // USDC has 6 decimals
        await writeContractAsync({
          address: c.lendingVault,
          abi: LENDING_VAULT_ABI,
          functionName: 'borrow',
          args: [assetAddress, value],
          maxFeePerGas: parseUnits('0.5', 9),
        });
      } else if (activeTab === 'Repay') {
        const value = parseUnits(amount, 6);
        // 1. Approve USDC
        await writeContractAsync({
          address: c.mockUsdc,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [c.lendingVault, value],
          maxFeePerGas: parseUnits('0.5', 9),
        });
        // 2. Repay
        await writeContractAsync({
          address: c.lendingVault,
          abi: LENDING_VAULT_ABI,
          functionName: 'repay',
          args: [value],
          maxFeePerGas: parseUnits('0.5', 9),
        });
      } else if (activeTab === 'Withdraw') {
        const value = parseUnits(amount, 18);
        await writeContractAsync({
          address: c.lendingVault,
          abi: LENDING_VAULT_ABI,
          functionName: 'withdraw',
          args: [assetAddress, value],
          maxFeePerGas: parseUnits('0.5', 9),
        });
      }
      setAmount('');
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || 'Transaction failed');
    } finally {
      setPending(false);
    }
  };

  const formattedCollateral = formatUnits(position.collateral, 18);
  const formattedDebt = formatUnits(position.debt, 6);
  const formattedMaxBorrow = formatUnits(position.maxBorrowable, 6);
  
  // Calculate max borrow (collateral * LTV)
  // For demo purposes, we will just show the LTV % dynamically mapping to the health factor.
  const healthClass = position.isHealthy ? 'hf-safe' : 'hf-danger';

  return (
    <div className="vault-panel">
      <div className="vault-header">
        <h3 className="vault-title">{symbol} Vault</h3>
        <span className="vault-sub">Manage your {name} position</span>
      </div>

      <div className="vault-stats">
        <div className="v-stat">
          <span className="v-label">Deposited</span>
          <span className="v-val">{Number(formattedCollateral).toFixed(4)} {symbol}</span>
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

      <div className="vault-tabs">
        {(['Deposit', 'Borrow', 'Repay', 'Withdraw'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`v-tab ${activeTab === tab ? 'v-tab-active' : ''}`}
            onClick={() => { setActiveTab(tab); setError(null); setAmount(''); }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="vault-action-area">
        <div className="v-input-wrapper">
          <input
            type="number"
            className="v-input"
            placeholder={activeTab === 'Borrow' ? formattedMaxBorrow : "0.00"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={pending}
          />
          <span className="v-input-currency">
            {activeTab === 'Borrow' || activeTab === 'Repay' ? 'USDC' : symbol}
          </span>
        </div>

        {error && <div className="v-error">{error}</div>}

        <button className="btn-primary v-submit" onClick={handleAction} disabled={pending || !amount}>
          {pending ? 'Processing...' : `${activeTab} ${activeTab === 'Borrow' || activeTab === 'Repay' ? 'USDC' : symbol}`}
        </button>
      </div>
    </div>
  );
}
