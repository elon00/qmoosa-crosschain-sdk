export enum SwapLifecycleState {
  INITIALIZED = "INITIALIZED",
  PENDING_SOURCE = "PENDING_SOURCE",
  SOURCE_CONFIRMED = "SOURCE_CONFIRMED",
  PENDING_DEST = "PENDING_DEST",
  DEST_CONFIRMED = "DEST_CONFIRMED",
  READY_TO_CLAIM = "READY_TO_CLAIM",
  CLAIMED = "CLAIMED",
  EXPIRED = "EXPIRED",
  REFUNDED = "REFUNDED"
}

export interface SecretCommitment {
  secret: string;
  hashlock: string;
}

export interface SwapOrderRequest {
  sender: string;
  recipient: string;
  sourceToken: string;
  destToken: string;
  sourceAmount: bigint;
  destAmount: bigint;
  sourceTimelock: number;
  destTimelock: number;
  sourceChainId: number;
  destChainId: number;
  hashlock: string;
}

export interface SwapStatusResponse {
  swapId: string;
  state: SwapLifecycleState;
  sourceChainId: number;
  destChainId: number;
  sourceBlockDepth: number;
  destBlockDepth: number;
  sourceConfirmed: boolean;
  destConfirmed: boolean;
  timeRemainingSec: number;
  revealedSecret?: string;
}
