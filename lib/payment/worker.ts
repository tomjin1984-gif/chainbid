import type { PaymentOrderRecord, PaymentOrderStatus, SupportedNetwork } from "@/lib/domain/types";
import type { Repository } from "@/lib/repository/types";
import type { PaymentVerifier, VerificationResult } from "./types";
import { createPaymentVerifier } from "./verifiers";
import { verificationResult } from "./verifiers/base";

const OPEN_STATUSES: PaymentOrderStatus[] = ["waiting", "detected", "confirming", "confirmed"];
const KNOWN_PAYMENT_STATUSES: PaymentOrderStatus[] = ["detected", "confirming", "confirmed"];

export interface PaymentWorkerResult {
  credited: boolean;
  result?: VerificationResult | null;
  error?: string;
}

function paymentWorkerError(error: unknown) {
  return error instanceof Error ? error.message : "Payment worker order processing failed.";
}

export function statusFromVerification(
  order: PaymentOrderRecord,
  result: VerificationResult,
): PaymentOrderStatus {
  if (result.status === "confirmed") {
    return "confirmed";
  }

  if (result.status === "unconfirmed") {
    return "confirming";
  }

  if (result.status === "wrong_amount") {
    if (!result.amountAtomic || result.amountAtomic <= BigInt(0)) {
      return "failed";
    }

    return result.amountAtomic > order.expectedTransferAmountAtomic
      ? "overpaid"
      : "underpaid";
  }

  if (result.status === "manual_review") {
    return "manual_review";
  }

  if (result.status === "provider_error" || result.status === "not_found") {
    if (order.txHash && KNOWN_PAYMENT_STATUSES.includes(order.status)) {
      return order.status;
    }

    return "waiting";
  }

  return "failed";
}

export async function processPaymentOrder(args: {
  order: PaymentOrderRecord;
  repository: Repository;
  verifier?: PaymentVerifier;
  txHashHint?: string;
}): Promise<PaymentWorkerResult> {
  if (args.order.status === "confirmed") {
    return args.repository.creditPaymentOrder(args.order.publicId);
  }

  const verifier = args.verifier ?? createPaymentVerifier(args.order.network);
  const result = await verifier.verifyPayment(args.order, args.txHashHint);
  const nextStatus = statusFromVerification(args.order, result);

  await args.repository.recordVerification(args.order.publicId, result, nextStatus);

  if (nextStatus === "confirmed") {
    return args.repository.creditPaymentOrder(args.order.publicId);
  }

  return { credited: false as const, result };
}

export async function runPaymentWorkerCycle(args: {
  repository: Repository;
  verifiers?: Partial<Record<SupportedNetwork, PaymentVerifier>>;
  limit?: number;
}) {
  const orders = await args.repository.listOpenPaymentOrders({
    statuses: OPEN_STATUSES,
    limit: args.limit ?? 50,
  });

  const results = [];
  for (const order of orders) {
    try {
      const verifier = args.verifiers?.[order.network] ?? createPaymentVerifier(order.network);
      results.push(
        await processPaymentOrder({
          order,
          repository: args.repository,
          verifier,
        }),
      );
    } catch (error) {
      const message = paymentWorkerError(error);
      console.error(
        JSON.stringify({
          event: "payment_worker_order_failed",
          order: order.publicId,
          network: order.network,
          error: message,
        }),
      );
      results.push({
        credited: false,
        result: verificationResult({
          status: "provider_error",
          network: order.network,
          txHash: order.txHash,
          failureReason: message,
        }),
        error: message,
      });
    }
  }

  return results;
}
