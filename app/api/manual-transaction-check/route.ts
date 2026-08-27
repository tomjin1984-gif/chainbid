import { z } from "zod";
import { getNetworkConfig } from "@/lib/config/networks";
import type { PaymentOrderRecord } from "@/lib/domain/types";
import { getRepository } from "@/lib/repository";
import { publicPaymentOrder, publicProject } from "@/lib/repository/serializers";
import {
  attachManualCheckToOrder,
  MANUAL_CHECK_OPEN_STATUSES,
  refreshKnownManualCheckOrder,
  type ManualCheckOutcome,
  type ManualCheckProbe,
} from "@/lib/payment/manual-check";
import type { VerificationResult } from "@/lib/payment/types";
import { errorMessage, jsonError, readJson } from "@/lib/http";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

const manualCheckSchema = z.object({
  txHash: z.string().trim().min(12).max(160),
});

function publicVerification(result: VerificationResult | null, order: PaymentOrderRecord) {
  const network = getNetworkConfig(order.network);

  return {
    status: result?.status ?? (order.status === "credited" ? "confirmed" : order.status),
    network: result?.network ?? order.network,
    txHash: result?.txHash ?? order.txHash,
    tokenContractOrMint: result?.tokenContractOrMint ?? order.tokenContractOrMint,
    senderAddress: result?.senderAddress ?? null,
    receiverAddress: result?.receiverAddress ?? order.receiverAddress,
    amountAtomic:
      result?.amountAtomic?.toString() ?? order.expectedTransferAmountAtomic.toString(),
    blockNumberOrSlot: result?.blockNumberOrSlot ?? order.blockNumberOrSlot,
    confirmations: result?.confirmations ?? order.confirmations,
    rawReference: result?.rawReference ?? order.txHash,
    failureReason: result?.failureReason ?? order.failureReason,
    explorerUrl: order.txHash ? network.explorerTxUrl(order.txHash) : null,
  };
}

function providerErrorMessage(errors: ManualCheckProbe[]) {
  const reasons = [...new Set(
    errors
      .map((probe) => probe.result.failureReason)
      .filter((reason): reason is string => Boolean(reason)),
  )];

  if (!reasons.length) {
    return null;
  }

  return [
    "Payment network RPC check failed. The transaction may be paid on-chain, but the site could not read it yet.",
    ...reasons.slice(0, 2),
  ].join(" ");
}

async function publicMatch(outcome: ManualCheckOutcome) {
  const repository = getRepository();
  const project = await repository.getProjectById(outcome.order.projectId);
  const network = getNetworkConfig(outcome.order.network);

  return {
    credited: outcome.credited,
    networkChanged: outcome.networkChanged,
    order: publicPaymentOrder(outcome.order),
    project: project ? publicProject(project) : null,
    network: {
      network: network.network,
      label: network.label,
      tokenStandard: network.tokenStandard,
    },
    verification: publicVerification(outcome.result, outcome.order),
  };
}

export async function POST(request: Request) {
  const limited = checkRateLimit({
    key: rateLimitKey(request, "manual-global-tx"),
    limit: 8,
    windowMs: 60_000,
  });

  if (!limited.allowed) {
    return jsonError("Too many manual transaction checks.", 429);
  }

  try {
    const payload = manualCheckSchema.parse(await readJson(request));
    const repository = getRepository();
    const matches = [];
    const providerErrors: ManualCheckProbe[] = [];
    const knownOrders = await repository.findPaymentOrdersByTxHash(payload.txHash);

    for (const order of knownOrders) {
      const outcome = await refreshKnownManualCheckOrder({ order, repository });
      matches.push(await publicMatch(outcome));
    }

    if (!matches.length) {
      const openOrders = await repository.listOpenPaymentOrders({
        statuses: MANUAL_CHECK_OPEN_STATUSES,
        limit: 100,
      });

      for (const order of openOrders) {
        const outcome = await attachManualCheckToOrder({
          order,
          repository,
          txHash: payload.txHash,
          onResult(probe) {
            if (probe.result.status === "provider_error") {
              providerErrors.push(probe);
            }
          },
        });

        if (outcome) {
          matches.push(await publicMatch(outcome));
          break;
        }
      }
    }

    const rpcMessage = providerErrorMessage(providerErrors);
    return Response.json({
      txHash: payload.txHash,
      matched: matches.length > 0,
      matches,
      message: matches.length
        ? "Transaction matched to a payment order."
        : rpcMessage ?? "No matching pending payment order was found for this transaction hash.",
    });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
