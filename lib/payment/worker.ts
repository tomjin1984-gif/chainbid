import type { PaymentOrderRecord, PaymentOrderStatus, SupportedNetwork } from "@/lib/domain/types";
import type { Repository } from "@/lib/repository/types";
import type { PaymentVerifier, VerificationResult } from "./types";
import { createPaymentVerifier } from "./verifiers";

const OPEN_STATUSES: PaymentOrderStatus[] = ["waiting", "detected", "confirming"];

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
    return "waiting";
  }

  return "failed";
}

export async function processPaymentOrder(args: {
  order: PaymentOrderRecord;
  repository: Repository;
  verifier?: PaymentVerifier;
  txHashHint?: string;
}) {
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
    const verifier = args.verifiers?.[order.network] ?? createPaymentVerifier(order.network);
    results.push(
      await processPaymentOrder({
        order,
        repository: args.repository,
        verifier,
      }),
    );
  }

  return results;
}
