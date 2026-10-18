import {
  SwapLifecycleState,
  SecretCommitment,
  SwapOrderRequest,
  SwapStatusResponse
} from "./types.js";
import { generateSecretAndCommitment, verifySecretCommitment } from "./crypto.js";

export class CrossChainClient {
  private localSwaps: Map<string, {
    request: SwapOrderRequest;
    swapId: string;
    state: SwapLifecycleState;
    sourceBlockDepth: number;
    destBlockDepth: number;
    revealedSecret?: string;
  }> = new Map();

  private sourceRequiredFinality: number;
  private destRequiredFinality: number;

  constructor(sourceRequiredFinality: number = 12, destRequiredFinality: number = 32) {
    this.sourceRequiredFinality = sourceRequiredFinality;
    this.destRequiredFinality = destRequiredFinality;
  }

  public createSecretCommitment(): SecretCommitment {
    return generateSecretAndCommitment();
  }

  public validateTimelockSafety(sourceTimelock: number, destTimelock: number, minBufferSec: number = 300): boolean {
    return sourceTimelock - destTimelock >= minBufferSec;
  }

  public initiateSwapOrder(request: SwapOrderRequest, minBufferSec: number = 300): { success: boolean; swapId: string; error?: string } {
    if (!this.validateTimelockSafety(request.sourceTimelock, request.destTimelock, minBufferSec)) {
      return {
        success: false,
        swapId: "",
        error: `INSUFFICIENT_TIMELOCK_DELTA: Source timelock must exceed destination timelock by at least ${minBufferSec}s`
      };
    }

    const swapId = "0x" + Math.random().toString(16).slice(2).padStart(64, "0");

    this.localSwaps.set(swapId, {
      request: Object.freeze({ ...request }),
      swapId,
      state: SwapLifecycleState.PENDING_SOURCE,
      sourceBlockDepth: 0,
      destBlockDepth: 0
    });

    return { success: true, swapId };
  }

  public updateBlockDepth(swapId: string, sourceDepth: number, destDepth: number): boolean {
    const s = this.localSwaps.get(swapId);
    if (!s) return false;

    s.sourceBlockDepth = sourceDepth;
    s.destBlockDepth = destDepth;

    if (sourceDepth >= this.sourceRequiredFinality && destDepth >= this.destRequiredFinality) {
      s.state = SwapLifecycleState.READY_TO_CLAIM;
    } else if (sourceDepth >= this.sourceRequiredFinality) {
      s.state = SwapLifecycleState.SOURCE_CONFIRMED;
    }
    return true;
  }

  public claim(swapId: string, secret: string, currentTimestamp: number = Math.floor(Date.now() / 1000)): { success: boolean; error?: string } {
    const s = this.localSwaps.get(swapId);
    if (!s) return { success: false, error: "SWAP_NOT_FOUND" };

    if (s.state === SwapLifecycleState.CLAIMED) {
      return { success: false, error: "ALREADY_CLAIMED" };
    }
    if (s.state === SwapLifecycleState.REFUNDED) {
      return { success: false, error: "MUTUAL_EXCLUSION_CANNOT_CLAIM_REFUNDED" };
    }

    if (currentTimestamp > s.request.destTimelock) {
      s.state = SwapLifecycleState.EXPIRED;
      return { success: false, error: "TIMELOCK_EXPIRED" };
    }

    if (!verifySecretCommitment(secret, s.request.hashlock)) {
      return { success: false, error: "INVALID_SECRET_PREIMAGE" };
    }

    s.revealedSecret = secret;
    s.state = SwapLifecycleState.CLAIMED;
    return { success: true };
  }

  public refund(swapId: string, currentTimestamp: number = Math.floor(Date.now() / 1000)): { success: boolean; error?: string } {
    const s = this.localSwaps.get(swapId);
    if (!s) return { success: false, error: "SWAP_NOT_FOUND" };

    if (s.state === SwapLifecycleState.CLAIMED) {
      return { success: false, error: "MUTUAL_EXCLUSION_CANNOT_REFUND_CLAIMED" };
    }
    if (s.state === SwapLifecycleState.REFUNDED) {
      return { success: false, error: "ALREADY_REFUNDED" };
    }

    if (currentTimestamp <= s.request.sourceTimelock) {
      return { success: false, error: "TIMELOCK_NOT_EXPIRED" };
    }

    s.state = SwapLifecycleState.REFUNDED;
    return { success: true };
  }

  public getSwapStatus(swapId: string, currentTimestamp: number = Math.floor(Date.now() / 1000)): SwapStatusResponse | undefined {
    const s = this.localSwaps.get(swapId);
    if (!s) return undefined;

    const timeRemaining = Math.max(0, s.request.destTimelock - currentTimestamp);
    return Object.freeze({
      swapId,
      state: s.state,
      sourceChainId: s.request.sourceChainId,
      destChainId: s.request.destChainId,
      sourceBlockDepth: s.sourceBlockDepth,
      destBlockDepth: s.destBlockDepth,
      sourceConfirmed: s.sourceBlockDepth >= this.sourceRequiredFinality,
      destConfirmed: s.destBlockDepth >= this.destRequiredFinality,
      timeRemainingSec: timeRemaining,
      revealedSecret: s.revealedSecret
    });
  }
}
