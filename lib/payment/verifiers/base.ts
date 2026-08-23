import type { PaymentOrderRecord, SupportedNetwork, VerificationStatus } from "@/lib/domain/types";
import type { VerificationResult } from "../types";

export function verificationResult(args: {
  status: VerificationStatus;
  network: SupportedNetwork;
  txHash?: string | null;
  tokenContractOrMint?: string | null;
  senderAddress?: string | null;
  receiverAddress?: string | null;
  amountAtomic?: bigint | null;
  blockNumberOrSlot?: string | null;
  confirmations?: number;
  rawReference?: string | null;
  failureReason?: string | null;
}): VerificationResult {
  return {
    status: args.status,
    network: args.network,
    txHash: args.txHash ?? null,
    tokenContractOrMint: args.tokenContractOrMint ?? null,
    senderAddress: args.senderAddress ?? null,
    receiverAddress: args.receiverAddress ?? null,
    amountAtomic: args.amountAtomic ?? null,
    blockNumberOrSlot: args.blockNumberOrSlot ?? null,
    confirmations: args.confirmations ?? 0,
    rawReference: args.rawReference ?? null,
    failureReason: args.failureReason ?? null,
  };
}

export function isExpired(order: PaymentOrderRecord, now = new Date()) {
  return new Date(order.expiresAt).getTime() < now.getTime();
}

export function ensureTxHint(order: PaymentOrderRecord, txHashHint?: string) {
  return txHashHint?.trim() || order.txHash?.trim() || null;
}
