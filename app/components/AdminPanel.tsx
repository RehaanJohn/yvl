'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { CONTRACTS, LENDING_VAULT_ABI, VOLATILITY_ORACLE_ABI } from '../web3/contracts';

export default function AdminPanel() {
  const [tokenAddress, setTokenAddress] = useState('');
  const [feedAddress, setFeedAddress] = useState('');
  const chainId = useChainId();
  const c = CONTRACTS[chainId as keyof typeof CONTRACTS] ?? CONTRACTS[421614];

  // We need to write to Vault and Oracle
  const { writeContractAsync: writeVault, data: vaultTxHash, isPending: isVaultPending } = useWriteContract();
  const { writeContractAsync: writeOracle, data: oracleTxHash, isPending: isOraclePending } = useWriteContract();

  const { isLoading: isVaultWaiting } = useWaitForTransactionReceipt({ hash: vaultTxHash });
  const { isLoading: isOracleWaiting } = useWaitForTransactionReceipt({ hash: oracleTxHash });

  const isPending = isVaultPending || isOraclePending || isVaultWaiting || isOracleWaiting;

  const handleRegister = async () => {
    if (!tokenAddress || !feedAddress) return;
    try {
      // 1. Register on Oracle
      await writeOracle({
        address: c.volatilityOracle,
        abi: VOLATILITY_ORACLE_ABI,
        functionName: 'registerFeed',
        args: [tokenAddress as `0x${string}`, feedAddress as `0x${string}`],
      });

      // 2. Register on Vault
      await writeVault({
        address: c.lendingVault,
        abi: LENDING_VAULT_ABI,
        functionName: 'registerAsset',
        args: [tokenAddress as `0x${string}`, feedAddress as `0x${string}`],
      });

      setTokenAddress('');
      setFeedAddress('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md mt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-syne font-bold text-white">Admin Console</h2>
          <p className="text-sm text-white/50">Register new dynamic markets on the fly.</p>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-white/70 mb-1">ERC-20 Token Address</label>
          <input 
            type="text" 
            placeholder="0x..." 
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-white/30"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-white/70 mb-1">Chainlink USD Feed Address</label>
          <input 
            type="text" 
            placeholder="0x..." 
            value={feedAddress}
            onChange={(e) => setFeedAddress(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-white/30"
          />
        </div>
        <button
          onClick={handleRegister}
          disabled={!tokenAddress || !feedAddress || isPending}
          className="bg-white text-black font-syne font-bold px-6 py-2 h-[42px] rounded-xl hover:bg-white/90 disabled:opacity-50 transition-all whitespace-nowrap"
        >
          {isPending ? 'Registering...' : '+ Add Market'}
        </button>
      </div>
    </div>
  );
}
