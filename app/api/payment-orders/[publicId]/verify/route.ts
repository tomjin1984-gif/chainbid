import { z } from "zod";
import {
  getNetworkConfigs,
  isNetworkAvailableForCheckout,
} from "@/lib/config/networks";
import type { PaymentOrderRecord, SupportedNetwork } from "@/lib/domain/types";
import { getRepository } from "@/lib/repository";
import { createPaymentOrderDraftForPublicId } from "@/lib/payment/orders";
import { createPaymentVerifier } from "@/lib/payment/verifiers";
import { processPaymentOrder, statusFromVerification } from "@/lib/payment/worker";
import type { VerificationResult } from "@/lib/payment/types";
import { publicPaymentOrder } from "@/lib/repository/serializers";
import type { Repository } from "@/lib/repository/types";
import { errorMessage, jsonError, readJson } from "@/lib/http";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

const txSchema = z.object({
  txHash: z.string().min(12).max(160),
});

function publicVerification(result: VerificationResult | null) {
  if (!result) {
    return null;
  }

  return {
    ...result,
    amountAtomic: result.amountAtomic?.toString() ?? null,
  };
}

function isRetryableNetworkMiss(result: VerificationResult | null | undefined) {
  return result?.status === "not_found" || result?.status === "provider_error";
}

function alternateNetworks(currentNetwork: SupportedNetwork) {
  return getNetworkConfigs()
    .filter(isNetworkAvailableForCheckout)
    .map((network) => network.network)
    .filter((network) => network !== currentNetwork);
}

async function processVerificationOnDetectedNetwork(args: {
  order: PaymentOrderRecord;
  repository: Repository;
  txHash: string;
}) {
  const firstAttempt = await processPaymentOrder({
    order: args.order,
    repository: args.repository,
    txHashHint: args.txHash,
  });

  if (!isRetryableNetworkMiss(firstAttempt.result) || args.order.status !== "waiting") {
    return firstAttempt;
  }

  for (const network of alternateNetworks(args.order.network)) {
    const draft = createPaymentOrderDraftForPublicId({
      publicId: args.order.publicId,
      projectId: args.order.projectId,
      network,
      bidCreditUsdt: args.order.bidCreditUsdt,
      expectedSenderAddress: args.order.expectedSenderAddress,
    });
    const candidateOrder: PaymentOrderRecord = {
      ...args.order,
      network,
      receiverAddress: draft.receiverAddress,
      tokenContractOrMint: draft.tokenContractOrMint,
      expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
      expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
    };
    const verification = await createPaymentVerifier(network).verifyPayment(
      candidateOrder,
      args.txHash,
    );

    if (isRetryableNetworkMiss(verification)) {
      continue;
    }

    const updatedOrder = await args.repository.updateWaitingPaymentOrderNetwork(
      args.order.publicId,
      draft,
    );
    if (!updatedOrder) {
      return firstAttempt;
    }

    const nextStatus = statusFromVerification(updatedOrder, verification);
    await args.repository.recordVerification(updatedOrder.publicId, verification, nextStatus);

    if (nextStatus === "confirmed") {
      return args.repository.creditPaymentOrder(updatedOrder.publicId);
    }

    return { credited: false as const, result: verification };
  }

  return firstAttempt;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> | { publicId: string } },
) {
  const params = await context.params;
  const limited = checkRateLimit({
    key: rateLimitKey(request, "manual-tx", params.publicId),
    limit: 6,
    windowMs: 60_000,
  });

  if (!limited.allowed) {
    return jsonError("Too many transaction verification requests.", 429);
  }

  try {
    const payload = txSchema.parse(await readJson(request));
    const repository = getRepository();
    const order = await repository.getPaymentOrder(params.publicId);
    if (!order) {
      return jsonError("Payment order was not found.", 404);
    }

    const result = await processVerificationOnDetectedNetwork({
      order,
      repository,
      txHash: payload.txHash,
    });
    const updated = await repository.getPaymentOrder(params.publicId);

    return Response.json({
      order: updated ? publicPaymentOrder(updated) : null,
      verification: publicVerification(result.result ?? null),
      credited: result.credited,
    });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
