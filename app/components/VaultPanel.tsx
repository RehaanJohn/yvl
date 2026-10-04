"use client";

import { useState, useRef } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits, formatUnits, type Hash } from "viem";
import { LoaderCircle, Plus } from "lucide-react";
import { useUserPosition } from "../web3/useProtocol";
import { CONTRACTS, LENDING_VAULT_ABI, ERC20_ABI } from "../web3/contracts";
import { TokenMark } from "./MarketCard";

interface VaultPanelProps {
  assetAddress: `0x${string}`;
  symbol: string;
  name: string;
}
type Tab = "Deposit" | "Borrow" | "Repay" | "Withdraw";
const c = CONTRACTS[421614];
const dollars = (v: bigint) =>
  Number(formatUnits(v, 6)).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });

export default function VaultPanel({
  assetAddress,
  symbol,
  name,
}: VaultPanelProps) {
  const { address, isConnected, chainId } = useAccount();
  const client = usePublicClient({ chainId: 421614 });
  const position = useUserPosition(address, assetAddress);
  const queries = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("Deposit");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string>();
  const { writeContractAsync } = useWriteContract();
  const locked = useRef(false);
  const ready = isConnected && chainId === 421614;

  const handleAction = async () => {
    if (locked.current || !ready || !client) return;
    locked.current = true;
    setPending(true);
    setError(undefined);
    try {
      const value = parseUnits(
        amount,
        activeTab === "Borrow" || activeTab === "Repay" ? 6 : 18,
      );
      if (value <= 0n) throw new Error("Enter an amount greater than zero.");
      const confirm = async (hash: Hash) => {
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw new Error(
            "Transaction reverted. Check your amount and try again.",
          );
      };
      if (activeTab === "Deposit" || activeTab === "Repay") {
        setStatus("Confirm token approval");
        const hash = await writeContractAsync({
          address: activeTab === "Deposit" ? assetAddress : c.mockUsdc,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [c.lendingVault, value],
          chainId: 421614,
        });
        setStatus("Waiting for approval");
        await confirm(hash);
      }
      setStatus(`Confirm ${activeTab.toLowerCase()}`);
      let hash: Hash;
      if (activeTab === "Deposit")
        hash = await writeContractAsync({
          address: c.lendingVault,
          abi: LENDING_VAULT_ABI,
          functionName: "deposit",
          args: [assetAddress, value],
          chainId: 421614,
        });
      else if (activeTab === "Borrow")
        hash = await writeContractAsync({
          address: c.lendingVault,
          abi: LENDING_VAULT_ABI,
          functionName: "borrow",
          args: [assetAddress, value],
          chainId: 421614,
        });
      else if (activeTab === "Repay")
        hash = await writeContractAsync({
          address: c.lendingVault,
          abi: LENDING_VAULT_ABI,
          functionName: "repay",
          args: [value],
          chainId: 421614,
        });
      else
        hash = await writeContractAsync({
          address: c.lendingVault,
          abi: LENDING_VAULT_ABI,
          functionName: "withdraw",
          args: [assetAddress, value],
          chainId: 421614,
        });
      setStatus("Waiting for confirmation");
      await confirm(hash);
      await queries.invalidateQueries();
      setAmount("");
      setStatus("Transaction confirmed");
    } catch (e) {
      setError(
        e instanceof Error
          ? (e as Error & { shortMessage?: string }).shortMessage || e.message
          : "Transaction failed. Try again.",
      );
      setStatus("");
    } finally {
      locked.current = false;
      setPending(false);
    }
  };
  const currency =
    activeTab === "Borrow" || activeTab === "Repay" ? "USDC" : symbol;
  return (
    <div className="vault-panel glass">
      <div className="vault-header">
        <span className="asset-heading">
          <TokenMark symbol={symbol} />
          <span>
            <h3>{symbol} position</h3>
            <span className="muted">{name}</span>
          </span>
        </span>
        {isConnected && (
          <span
            className={`status-chip ${position.isHealthy ? "safe" : "danger"}`}
          >
            <span className="status-dot" />
            {position.isLoading
              ? "Reading"
              : position.isHealthy
                ? "Healthy"
                : "At risk"}
          </span>
        )}
      </div>
      <div className="vault-stats">
        <div>
          <span className="metric-caption">Deposited</span>
          <strong>
            {isConnected
              ? Number(formatUnits(position.collateral, 18)).toLocaleString(
                  "en-US",
                  { maximumFractionDigits: 4 },
                )
              : "—"}{" "}
            <small>{symbol}</small>
          </strong>
        </div>
        <div>
          <span className="metric-caption">Borrowed</span>
          <strong>{isConnected ? `$${dollars(position.debt)}` : "—"}</strong>
        </div>
        <div>
          <span className="metric-caption">Available to borrow</span>
          <strong>
            {isConnected ? `$${dollars(position.maxBorrowable)}` : "—"}
          </strong>
        </div>
        <div>
          <span className="metric-caption">Health factor</span>
          <strong
            className={!position.isHealthy && isConnected ? "text-danger" : ""}
          >
            {!isConnected
              ? "—"
              : position.debt === 0n
                ? "∞"
                : position.healthFactorFloat.toFixed(2)}
          </strong>
        </div>
      </div>
      <div className="vault-tabs" aria-label="Position action">
        {(["Deposit", "Borrow", "Repay", "Withdraw"] as const).map((tab) => (
          <button
            key={tab}
            className={`v-tab ${activeTab === tab ? "v-tab-active" : ""}`}
            aria-pressed={activeTab === tab}
            disabled={pending}
            onClick={() => {
              setActiveTab(tab);
              setError(undefined);
              setAmount("");
              setStatus("");
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      <label className="amount-label" htmlFor={`amount-${assetAddress}`}>
        {activeTab} amount
      </label>
      <div className="v-input-wrapper">
        <input
          id={`amount-${assetAddress}`}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          className="v-input"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={pending}
        />
        <span className="v-input-currency">{currency}</span>
      </div>
      {error && (
        <p className="v-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="btn-primary v-submit"
        onClick={() => void handleAction()}
        disabled={pending || !amount || !ready}
      >
        {pending ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Plus size={17} />
        )}
        {!isConnected
          ? "Connect wallet to continue"
          : chainId !== 421614
            ? "Switch to Arbitrum Sepolia"
            : pending
              ? status
              : `${activeTab} ${currency}`}
      </button>
      <p className="vault-note" role="status" aria-live="polite">
        {status && !pending
          ? status
          : "Testnet assets only · Each transaction needs wallet confirmation"}
      </p>
    </div>
  );
}
