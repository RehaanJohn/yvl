"use client";

import { useState, useRef } from "react";
import {
  useAccount,
  useWriteContract,
  usePublicClient,
  useReadContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { isAddress, parseAbi } from "viem";
import {
  CONTRACTS,
  LENDING_VAULT_ABI,
  VOLATILITY_ORACLE_ABI,
} from "../web3/contracts";

const c = CONTRACTS[421614];
const ownerAbi = parseAbi(["function owner() view returns (address)"]);

export default function AdminPanel() {
  const [tokenAddress, setTokenAddress] = useState("");
  const [feedAddress, setFeedAddress] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: 421614 });
  const queries = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const { data: owner } = useReadContract({
    address: c.lendingVault,
    abi: ownerAbi,
    functionName: "owner",
    chainId: 421614,
  });
  const locked = useRef(false);
  const isOwner =
    !!address &&
    owner?.toLowerCase() === address.toLowerCase() &&
    chainId === 421614;
  const handleRegister = async () => {
    if (
      locked.current ||
      !isOwner ||
      !client ||
      !isAddress(tokenAddress) ||
      !isAddress(feedAddress)
    )
      return;
    locked.current = true;
    setPending(true);
    setFeedback("Confirm oracle registration in your wallet.");
    try {
      const oracleHash = await writeContractAsync({
        address: c.volatilityOracle,
        abi: VOLATILITY_ORACLE_ABI,
        functionName: "registerFeed",
        args: [tokenAddress, feedAddress],
        chainId: 421614,
      });
      if (
        (await client.waitForTransactionReceipt({ hash: oracleHash }))
          .status !== "success"
      )
        throw new Error("Oracle registration reverted.");
      setFeedback("Confirm vault registration in your wallet.");
      const vaultHash = await writeContractAsync({
        address: c.lendingVault,
        abi: LENDING_VAULT_ABI,
        functionName: "registerAsset",
        args: [tokenAddress, feedAddress],
        chainId: 421614,
      });
      if (
        (await client.waitForTransactionReceipt({ hash: vaultHash })).status !==
        "success"
      )
        throw new Error(
          "Vault registration reverted. Oracle registration was already confirmed.",
        );
      await queries.invalidateQueries();
      setTokenAddress("");
      setFeedAddress("");
      setFeedback("Market registered.");
    } catch (e) {
      setFeedback(
        e instanceof Error
          ? (e as Error & { shortMessage?: string }).shortMessage || e.message
          : "Registration failed. Try again.",
      );
    } finally {
      locked.current = false;
      setPending(false);
    }
  };
  return (
    <div className="admin-panel">
      <p>
        Register a collateral token and its price feed. Requires the protocol
        owner’s wallet.
      </p>
      <div className="admin-form">
        <label>
          Collateral token
          <input
            placeholder="0x…"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            disabled={pending}
          />
        </label>
        <label>
          USD price feed
          <input
            placeholder="0x…"
            value={feedAddress}
            onChange={(e) => setFeedAddress(e.target.value)}
            disabled={pending}
          />
        </label>
        <button
          className="btn-secondary"
          onClick={() => void handleRegister()}
          disabled={
            pending ||
            !isOwner ||
            !isAddress(tokenAddress) ||
            !isAddress(feedAddress)
          }
        >
          {pending ? "Confirming…" : "Register market"}
        </button>
      </div>
      {feedback && (
        <p className="demo-feedback" role="status">
          {feedback}
        </p>
      )}
    </div>
  );
}
