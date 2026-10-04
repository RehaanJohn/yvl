import { parseAbi, type Address, type Hash, type PublicClient } from "viem";

export const LINK_DEMO_FEED =
  "0x2a29C1a762E5D8a3b98c852FD0566556D9E6acc7" as const;
export const DEMO_ORACLE_ABI = parseAbi([
  "function feeds(address) view returns (address)",
  "function volState(address) view returns (uint256,uint256,uint256,bool,uint256)",
  "function poke(address)",
]);
export const DEMO_FEED_ABI = parseAbi([
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function decimals() view returns (uint8)",
  "function updateAnswer(int256)",
]);

export type CrashStep = 0 | 1 | 2 | 3;

// Wait for each receipt before sending the dependent transaction. A rejected or
// reverted transaction stops the flow; no subsequent transaction is submitted.
export async function confirmDemoStep({
  client,
  submit,
  onSubmitted,
}: {
  client: Pick<PublicClient, "waitForTransactionReceipt">;
  submit: () => Promise<Hash>;
  onSubmitted: (hash: Hash) => void;
}) {
  const hash = await submit();
  onSubmitted(hash);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error("Transaction reverted. Retry this step in your wallet.");
  return hash;
}

export function requireDemoFeed(feed: Address) {
  if (feed.toLowerCase() !== LINK_DEMO_FEED.toLowerCase()) {
    throw new Error(
      "The LINK feed is not the configured demo aggregator. Price changes are disabled.",
    );
  }
}

export async function refreshDemoRisk({
  client,
  poke,
  refresh,
  onStep,
  onSubmitted,
}: {
  client: Pick<PublicClient, "waitForTransactionReceipt">;
  poke: () => Promise<Hash>;
  refresh: () => Promise<Hash>;
  onStep: (step: CrashStep) => void;
  onSubmitted: (hash: Hash) => void;
}) {
  onStep(1);
  await confirmDemoStep({ client, submit: poke, onSubmitted });
  onStep(2);
  await confirmDemoStep({ client, submit: refresh, onSubmitted });
}
