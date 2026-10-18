import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CrossChainClient,
  SwapLifecycleState,
  generateSecretAndCommitment,
  verifySecretCommitment
} from "../dist/index.js";

test("1. Cryptographic commitment generation and validation", () => {
  const { secret, hashlock } = generateSecretAndCommitment();
  assert.ok(secret.length > 0);
  assert.ok(hashlock.startsWith("0x"));
  assert.equal(verifySecretCommitment(secret, hashlock), true);
  assert.equal(verifySecretCommitment("fake_secret", hashlock), false);
});

test("2. End-to-End Swap Order Creation, Confirmation & Claim", () => {
  const client = new CrossChainClient(12, 32);
  const { secret, hashlock } = client.createSecretCommitment();
  const now = Math.floor(Date.now() / 1000);

  const init = client.initiateSwapOrder({
    sender: "0xAlice",
    recipient: "0xBob",
    sourceToken: "0xUSDC",
    destToken: "0xMATIC",
    sourceAmount: 1000n * 10n**18n,
    destAmount: 1200n * 10n**18n,
    sourceTimelock: now + 3600,
    destTimelock: now + 1800,
    sourceChainId: 1,
    destChainId: 137,
    hashlock
  });

  assert.equal(init.success, true);
  assert.ok(init.swapId.startsWith("0x"));

  // Check state: PENDING_SOURCE
  let status = client.getSwapStatus(init.swapId, now);
  assert.equal(status.state, SwapLifecycleState.PENDING_SOURCE);

  // Update depth: 12 source, 32 dest -> READY_TO_CLAIM
  client.updateBlockDepth(init.swapId, 12, 32);
  status = client.getSwapStatus(init.swapId, now);
  assert.equal(status.state, SwapLifecycleState.READY_TO_CLAIM);
  assert.equal(status.sourceConfirmed, true);
  assert.equal(status.destConfirmed, true);

  // Claim with secret
  const claimRes = client.claim(init.swapId, secret, now);
  assert.equal(claimRes.success, true);

  status = client.getSwapStatus(init.swapId, now);
  assert.equal(status.state, SwapLifecycleState.CLAIMED);
  assert.equal(status.revealedSecret, secret);
});

test("3. Swap Refund after Expiration", () => {
  const client = new CrossChainClient(12, 32);
  const { secret, hashlock } = client.createSecretCommitment();
  const now = Math.floor(Date.now() / 1000);

  const init = client.initiateSwapOrder({
    sender: "0xAlice",
    recipient: "0xBob",
    sourceToken: "0xUSDC",
    destToken: "0xMATIC",
    sourceAmount: 1000n * 10n**18n,
    destAmount: 1200n * 10n**18n,
    sourceTimelock: now + 1000,
    destTimelock: now + 500,
    sourceChainId: 1,
    destChainId: 137,
    hashlock
  });

  // Premature refund before source timelock fails
  const premature = client.refund(init.swapId, now + 800);
  assert.equal(premature.success, false);
  assert.equal(premature.error, "TIMELOCK_NOT_EXPIRED");

  // Refund after source timelock succeeds
  const refundRes = client.refund(init.swapId, now + 1001);
  assert.equal(refundRes.success, true);

  const status = client.getSwapStatus(init.swapId, now + 1001);
  assert.equal(status.state, SwapLifecycleState.REFUNDED);
});

test("4. Mutual exclusion between claim and refund", () => {
  const client = new CrossChainClient(12, 32);
  const { secret, hashlock } = client.createSecretCommitment();
  const now = Math.floor(Date.now() / 1000);

  const init = client.initiateSwapOrder({
    sender: "0xAlice",
    recipient: "0xBob",
    sourceToken: "0xUSDC",
    destToken: "0xMATIC",
    sourceAmount: 1000n * 10n**18n,
    destAmount: 1200n * 10n**18n,
    sourceTimelock: now + 1000,
    destTimelock: now + 500,
    sourceChainId: 1,
    destChainId: 137,
    hashlock
  });

  client.updateBlockDepth(init.swapId, 12, 32);
  client.claim(init.swapId, secret, now);

  // Attempt to refund after claim fails
  const refundAttempt = client.refund(init.swapId, now + 2000);
  assert.equal(refundAttempt.success, false);
  assert.equal(refundAttempt.error, "MUTUAL_EXCLUSION_CANNOT_REFUND_CLAIMED");
});
