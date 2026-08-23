import type {
  PaymentOrderRecord,
  SupportedNetwork,
  VerificationStatus,
} from "@/lib/domain/types";

export interface VerificationResult {
  status: VerificationStatus;
  network: SupportedNetwork;
  txHash: string | null;
  tokenContractOrMint: string | null;
  senderAddress: string | null;
  receiverAddress: string | null;
  amountAtomic: bigint | null;
  blockNumberOrSlot: string | null;
  confirmations: number;
  rawReference: string | null;
  failureReason: string | null;
}

export interface PaymentVerifier {
  readonly network: SupportedNetwork;
  verifyPayment(order: PaymentOrderRecord, txHashHint?: string): Promise<VerificationResult>;
}

export interface PaymentOrderDraft {
  publicId: string;
  projectId: string;
  network: SupportedNetwork;
  receiverAddress: string;
  tokenContractOrMint: string;
  bidCreditUsdt: bigint;
  expectedTransferAmountAtomic: bigint;
  expectedTransferAmountDisplay: string;
  expectedSenderAddress: string | null;
  expiresAt: string;
}
