"use client";

import { useRef, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useReadContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits, type Hash } from "viem";
import {
  ArrowDownRight,
  Check,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import {
  CONTRACTS,
  LENDING_VAULT_ABI,
  RISK_ENGINE_ABI,
} from "../web3/contracts";
import { useAssetRisk } from "../web3/useProtocol";
import {
  confirmDemoStep,
  refreshDemoRisk,
  requireDemoFeed,
  DEMO_FEED_ABI,
  DEMO_ORACLE_ABI,
  LINK_DEMO_FEED,
  type CrashStep,
} from "../web3/crashDemo";

const c = CONTRACTS[421614];
const steps = ["Price shock", "Oracle update", "Risk adjustment"];

export interface CrashPanelProps {
  rehearsal?: boolean;
  busy: boolean;
  step: CrashStep;
  crashed: boolean;
  error?: string;
  hash?: Hash;
  price: string;
  ltv: string;
  beforeLtv: string;
  volatility: string;
  enabled: boolean;
  buttonLabel: string;
  onCrash: () => void;
  onRestore: () => void;
  helper?: string;
}

export function CrashPanelView(p: CrashPanelProps) {
  return (
    <section
      className={`crash-panel glass ${p.crashed ? "crashed" : ""}`}
      aria-labelledby="crash-title"
    >
      <div className="crash-copy">
        <span className="soft-pill danger">
          <TriangleAlert size={13} />
          Black swan demo
        </span>
        <h2 id="crash-title">
          When the market falls,
          <br />
          the protocol responds.
        </h2>
        <p>Trigger a 50% LINK price shock and watch borrowing limits adapt.</p>
        <div className="crash-actions">
          <button
            className="btn-crash"
            disabled={!p.enabled || p.busy || (p.crashed && (p.step === 3 || !p.error))}
            onClick={p.onCrash}
          >
            {p.busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ArrowDownRight size={17} />
            )}
            {p.buttonLabel}
          </button>
          {p.crashed && (
            <button
              className="icon-button"
              onClick={p.onRestore}
              disabled={p.busy}
              aria-label={
                p.rehearsal ? "Reset rehearsal" : "Restore original LINK price"
              }
              title={
                p.rehearsal
                  ? "Reset rehearsal"
                  : "Restore price (volatility history remains)"
              }
            >
              <RefreshCw size={17} />
            </button>
          )}
        </div>
        <p className="crash-helper">
          {p.helper ||
            (p.rehearsal
              ? "Local simulation. No wallet or transactions required."
              : "LINK mock feed only. Three wallet confirmations; updates run immediately.")}
        </p>
      </div>
      <div className="crash-result">
        <div className="result-top">
          <span className="asset-heading">
            <span className="token-mark token-link">⬡</span>
            <span>
              <strong>LINK</strong>
              <span className="market-name muted">
                {p.rehearsal ? "Illustrative scenario" : "Testnet mock market"}
              </span>
            </span>
          </span>
          <span className={`status-chip ${p.crashed ? "danger" : ""}`}>
            <span className="status-dot" />
            {p.busy ? "Updating" : p.step === 3 ? "Risk refreshed" : "Ready"}
          </span>
        </div>
        <div className="result-numbers">
          <span>
            <span className="metric-caption">LINK price</span>
            <strong>{p.price}</strong>
          </span>
          <span>
            <span className="metric-caption">Max LTV</span>
            <strong className={p.crashed ? "text-danger" : ""}>
              {p.crashed && p.step === 3 && p.beforeLtv !== p.ltv && (
                <small>{p.beforeLtv}</small>
              )}
              {p.ltv}
            </strong>
          </span>
          <span>
            <span className="metric-caption">Annualized volatility</span>
            <strong className={p.crashed ? "text-danger" : ""}>
              {p.volatility}
            </strong>
          </span>
        </div>
        <ol className="demo-steps">
          {steps.map((label, i) => (
            <li
              key={label}
              className={
                i < p.step ? "done" : p.busy && i === p.step ? "current" : ""
              }
            >
              <span>
                {i < p.step ? (
                  <Check size={13} />
                ) : p.busy && i === p.step ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  i + 1
                )}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <div className="demo-feedback" role="status" aria-live="polite">
          {p.error ? (
            <span className="text-danger">{p.error}</span>
          ) : p.busy ? (
            `Confirming ${steps[p.step]?.toLowerCase() || "update"}…`
          ) : p.step === 3 ? (
            p.rehearsal ? (
              "Borrowing power reduced. Rehearsal complete."
            ) : (
              "On-chain updates confirmed. Live readings shown above."
            )
          ) : (
            "A calm market. Until it isn’t."
          )}
          {p.hash && (
            <a
              href={`https://sepolia.arbiscan.io/tx/${p.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

export default function CrashDemo() {
  const { address, chainId, isConnected } = useAccount();
  const client = usePublicClient({ chainId: 421614 });
  const { writeContractAsync } = useWriteContract();
  const queries = useQueryClient();
  const risk = useAssetRisk(c.linkToken);
  const { data: round } = useReadContract({
    address: LINK_DEMO_FEED,
    abi: DEMO_FEED_ABI,
    functionName: "latestRoundData",
    chainId: 421614,
    query: { refetchInterval: 5_000 },
  });
  const { data: decimals } = useReadContract({
    address: LINK_DEMO_FEED,
    abi: DEMO_FEED_ABI,
    functionName: "decimals",
    chainId: 421614,
  });
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<CrashStep>(0);
  const [crashed, setCrashed] = useState(false);
  const [originalPrice, setOriginalPrice] = useState<bigint>();
  const [beforeLtv, setBeforeLtv] = useState("—");
  const [error, setError] = useState<string>();
  const [hash, setHash] = useState<Hash>();
  const locked = useRef(false);
  const awaitingRisk = useRef(false);
  const restoring = useRef(false);

  const run = async (restore = false) => {
    if (locked.current || !client || !address || chainId !== 421614) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    setHash(undefined);
    try {
      const feed = await client.readContract({
        address: c.volatilityOracle,
        abi: DEMO_ORACLE_ABI,
        functionName: "feeds",
        args: [c.linkToken],
      });
      requireDemoFeed(feed);
      const state = await client.readContract({
        address: c.volatilityOracle,
        abi: DEMO_ORACLE_ABI,
        functionName: "volState",
        args: [c.linkToken],
      });
      if (!state[3])
        throw new Error(
          "Initialize the LINK oracle before running the crash demo.",
        );
      // If the price step already succeeded, retry only the remaining updates.
      if (!awaitingRisk.current) {
        const current = await client.readContract({
          address: feed,
          abi: DEMO_FEED_ABI,
          functionName: "latestRoundData",
        });
        if (current[1] <= 0n)
          throw new Error(
            "The LINK price is unavailable. Try again after the feed recovers.",
          );
        const target = restore ? originalPrice : current[1] / 2n;
        if (!target || target <= 0n)
          throw new Error("The original LINK price is unavailable.");
        if (!restore) {
          setOriginalPrice(current[1]);
          setBeforeLtv(risk.currentLTVPct);
        }
        setStep(0);
        await confirmDemoStep({
          client,
          submit: () =>
            writeContractAsync({
              address: feed,
              abi: DEMO_FEED_ABI,
              functionName: "updateAnswer",
              args: [target],
              chainId: 421614,
            }),
          onSubmitted: setHash,
        });
        setCrashed(!restore);
        restoring.current = restore;
        awaitingRisk.current = true;
      }
      await refreshDemoRisk({
        client,
        poke: () =>
          writeContractAsync({
            address: c.volatilityOracle,
            abi: DEMO_ORACLE_ABI,
            functionName: "poke",
            args: [c.linkToken],
            chainId: 421614,
          }),
        refresh: () =>
          writeContractAsync({
            address: c.lendingVault,
            abi: LENDING_VAULT_ABI,
            functionName: "maxBorrowable",
            args: [address, c.linkToken],
            chainId: 421614,
          }),
        onStep: setStep,
        onSubmitted: setHash,
      });
      const ltv = await client.readContract({
        address: c.riskEngine,
        abi: RISK_ENGINE_ABI,
        functionName: "currentLTV",
        args: [c.linkToken],
      });
      if (
        !restoring.current &&
        ltv >= risk.currentLTVBps &&
        risk.currentBand === 0
      ) {
        setError(
          "Updates confirmed, but this observation did not lower the LTV. The result depends on elapsed time and volatility history.",
        );
      }
      awaitingRisk.current = false;
      setStep(3);
      await queries.invalidateQueries();
    } catch (e) {
      setError(
        e instanceof Error
          ? (e as Error & { shortMessage?: string }).shortMessage || e.message
          : "The update failed. Retry the remaining steps.",
      );
      await queries.invalidateQueries();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const price =
    round && decimals !== undefined
      ? Number(formatUnits(round[1], decimals)).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })
      : "—";
  return (
    <CrashPanelView
      busy={busy}
      step={step}
      crashed={crashed}
      error={error}
      hash={hash}
      price={price}
      ltv={risk.currentLTVPct}
      beforeLtv={beforeLtv}
      volatility={risk.annualizedVolPct}
      enabled={isConnected && chainId === 421614}
      buttonLabel={
        busy
          ? "Confirm in wallet"
          : error && step >= 1 && step < 3
            ? "Retry risk update"
            : crashed
              ? "Crash confirmed"
              : "Simulate 50% crash"
      }
      onCrash={() => void run(restoring.current && awaitingRisk.current)}
      onRestore={() => void run(true)}
      helper={
        !isConnected
          ? "Connect a testnet wallet to run the on-chain demo, or switch to Rehearsal."
          : chainId !== 421614
            ? "Switch your wallet to Arbitrum Sepolia to run the demo."
            : !crashed && step === 3
              ? "Price restored. Volatility history remains; restoring price does not reset risk."
              : undefined
      }
    />
  );
}
