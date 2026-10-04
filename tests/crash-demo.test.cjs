const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  confirmDemoStep,
  refreshDemoRisk,
  requireDemoFeed,
  LINK_DEMO_FEED,
} = require("../.demo-test/crashDemo.js");
const oracleHash = `0x${"1".repeat(64)}`;
const riskHash = `0x${"2".repeat(64)}`;

test("risk update waits for the oracle receipt before submitting", async () => {
  const events = [];
  let confirmOracle;
  const oracleReceipt = new Promise((resolve) => {
    confirmOracle = resolve;
  });
  const client = {
    waitForTransactionReceipt: ({ hash }) =>
      hash === oracleHash
        ? oracleReceipt
        : Promise.resolve({ status: "success" }),
  };
  const flow = refreshDemoRisk({
    client,
    poke: async () => {
      events.push("poke");
      return oracleHash;
    },
    refresh: async () => {
      events.push("refresh");
      return riskHash;
    },
    onStep: (step) => events.push(`step:${step}`),
    onSubmitted: () => {},
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["step:1", "poke"]);
  confirmOracle({ status: "success" });
  await flow;
  assert.deepEqual(events, ["step:1", "poke", "step:2", "refresh"]);
});

test("a reverted oracle transaction prevents the dependent risk update", async () => {
  let refreshCalled = false;
  await assert.rejects(
    refreshDemoRisk({
      client: {
        waitForTransactionReceipt: async () => ({ status: "reverted" }),
      },
      poke: async () => oracleHash,
      refresh: async () => {
        refreshCalled = true;
        return riskHash;
      },
      onStep: () => {},
      onSubmitted: () => {},
    }),
    /reverted/,
  );
  assert.equal(refreshCalled, false);
});

test("a rejected wallet request prevents all dependent updates", async () => {
  let refreshCalled = false;
  await assert.rejects(
    refreshDemoRisk({
      client: {
        waitForTransactionReceipt: async () => {
          throw new Error("Receipt must not be requested");
        },
      },
      poke: async () => {
        throw new Error("User rejected");
      },
      refresh: async () => {
        refreshCalled = true;
        return riskHash;
      },
      onStep: () => {},
      onSubmitted: () => {},
    }),
    /User rejected/,
  );
  assert.equal(refreshCalled, false);
});

test("receipt lookup errors are not presented as success", async () => {
  await assert.rejects(
    confirmDemoStep({
      client: {
        waitForTransactionReceipt: async () => {
          throw new Error("RPC unavailable");
        },
      },
      submit: async () => oracleHash,
      onSubmitted: () => {},
    }),
    /RPC unavailable/,
  );
});

test("price writes only target the known LINK mock aggregator", () => {
  assert.doesNotThrow(() => requireDemoFeed(LINK_DEMO_FEED.toLowerCase()));
  assert.throws(
    () => requireDemoFeed("0x0000000000000000000000000000000000000000"),
    /not the configured demo aggregator/,
  );
});
