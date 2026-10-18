import crypto from "node:crypto";
import { SecretCommitment } from "./types.js";

export function generateSecretAndCommitment(): SecretCommitment {
  const secretBytes = crypto.randomBytes(32);
  const secret = secretBytes.toString("hex");
  const hashlock = "0x" + crypto.createHash("sha256").update(Buffer.from(secret, "utf8")).digest("hex");
  return { secret, hashlock };
}

export function computeHashlockFromSecret(secret: string): string {
  return "0x" + crypto.createHash("sha256").update(Buffer.from(secret, "utf8")).digest("hex");
}

export function verifySecretCommitment(secret: string, expectedHashlock: string): boolean {
  const computed = computeHashlockFromSecret(secret);
  const normExpected = expectedHashlock.startsWith("0x") ? expectedHashlock.toLowerCase() : "0x" + expectedHashlock.toLowerCase();
  return computed.toLowerCase() === normExpected;
}
