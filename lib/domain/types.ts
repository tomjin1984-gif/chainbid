export type SupportedNetwork = "tron" | "ethereum" | "bsc" | "solana";

export type ProjectStatus = "pending" | "active" | "hidden" | "banned";

export type PaymentOrderStatus =
  | "created"
  | "waiting"
  | "detected"
  | "confirming"
  | "confirmed"
  | "credited"
  | "expired"
  | "underpaid"
  | "overpaid"
  | "manual_review"
  | "failed";

export type VerificationStatus =
  | "not_found"
  | "wrong_network"
  | "wrong_token"
  | "wrong_receiver"
  | "wrong_amount"
  | "wrong_sender"
  | "failed_transaction"
  | "unconfirmed"
  | "confirmed"
  | "manual_review"
  | "provider_error";

export interface ProjectRecord {
  id: string;
  slug: string;
  canonicalListingKey: string;
  name: string;
  url: string;
  description: string;
  logoUrl: string | null;
  xUrl: string | null;
  category: string;
  totalBidUsdt: bigint;
  rankingTimestamp: string;
  clickCount: bigint;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  lastBidAt: string | null;
}

export interface BidRecord {
  id: string;
  projectId: string;
  paymentOrderId: string;
  previousTotalUsdt: bigint;
  incrementUsdt: bigint;
  newTotalUsdt: bigint;
  rankBefore: number | null;
  rankAfter: number | null;
  network: SupportedNetwork;
  createdAt: string;
}

export interface PaymentOrderRecord {
  id: string;
  publicId: string;
  projectId: string;
  bidId: string | null;
  network: SupportedNetwork;
  receiverAddress: string;
  tokenContractOrMint: string;
  bidCreditUsdt: bigint;
  expectedTransferAmountAtomic: bigint;
  expectedTransferAmountDisplay: string;
  expectedSenderAddress: string | null;
  status: PaymentOrderStatus;
  txHash: string | null;
  blockNumberOrSlot: string | null;
  confirmations: number;
  createdAt: string;
  expiresAt: string;
  detectedAt: string | null;
  confirmedAt: string | null;
  creditedAt: string | null;
  failureReason: string | null;
}

export interface BlockchainTransactionRecord {
  id: string;
  network: SupportedNetwork;
  txHash: string;
  tokenContractOrMint: string;
  senderAddress: string;
  receiverAddress: string;
  amountAtomic: bigint;
  blockNumberOrSlot: string | null;
  verificationStatus: VerificationStatus;
  firstSeenAt: string;
  confirmedAt: string | null;
  rawReference: string | null;
}

export interface ActivityEventRecord {
  id: string;
  kind:
    | "project_created"
    | "payment_detected"
    | "payment_confirmed"
    | "payment_credited"
    | "rank_changed"
    | "manual_review";
  projectId: string | null;
  paymentOrderId: string | null;
  headline: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface LeaderboardEntry extends ProjectRecord {
  rank: number;
  nextRankTargetUsdt: bigint;
}
