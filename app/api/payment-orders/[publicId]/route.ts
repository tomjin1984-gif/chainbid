import { z } from "zod";
import {
  getNetworkConfig,
  getNetworkConfigs,
  isNetworkAvailableForCheckout,
} from "@/lib/config/networks";
import type { PaymentOrderRecord, ProjectRecord, SupportedNetwork } from "@/lib/domain/types";
import { getRepository } from "@/lib/repository";
import { publicPaymentOrder, publicProject } from "@/lib/repository/serializers";
import { createPaymentOrderDraftForPublicId } from "@/lib/payment/orders";
import { createQrDataUrl } from "@/lib/payment/qr";
import { buildPaymentPayload, warningForNetwork } from "@/lib/payment/uris";
import { processPaymentOrder } from "@/lib/payment/worker";
import { errorMessage, jsonError } from "@/lib/http";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

const networkChangeSchema = z.object({
  network: z.enum(["tron", "ethereum", "bsc", "solana"]),
});

async function paymentOrderPayload(order: PaymentOrderRecord, project: ProjectRecord | null) {
  const network = getNetworkConfig(order.network);
  const paymentPayload = buildPaymentPayload(order);

  return {
    order: publicPaymentOrder(order),
    project: project ? publicProject(project) : null,
    paymentPayload,
    qrDataUrl: await createQrDataUrl(paymentPayload),
    network: {
      network: network.network,
      label: network.label,
      tokenStandard: network.tokenStandard,
      warning: warningForNetwork(network.label),
      explorerUrl: order.txHash ? network.explorerTxUrl(order.txHash) : null,
    },
    networks: getNetworkConfigs().map((option) => ({
      network: option.network,
      label: option.label,
      tokenStandard: option.tokenStandard,
      enabled: isNetworkAvailableForCheckout(option),
    })),
  };
}

function shouldRefreshVerification(order: PaymentOrderRecord) {
  if (order.network === "solana" && order.status === "waiting") {
    return true;
  }

  return Boolean(order.txHash) && (
    order.status === "detected" ||
    order.status === "confirming" ||
    order.status === "confirmed"
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> | { publicId: string } },
) {
  const params = await context.params;
  const limited = checkRateLimit({
    key: rateLimitKey(request, "payment-status", params.publicId),
    limit: 60,
    windowMs: 60_000,
  });

  if (!limited.allowed) {
    return jsonError("Too many payment status checks.", 429);
  }

  try {
    const repository = getRepository();
    const order = await repository.getPaymentOrder(params.publicId);
    if (!order) {
      return jsonError("Payment order was not found.", 404);
    }

    let currentOrder = order;
    if (shouldRefreshVerification(order)) {
      await processPaymentOrder({
        order,
        repository,
      });
      currentOrder = (await repository.getPaymentOrder(params.publicId)) ?? order;
    }

    const project = await repository.getProjectById(currentOrder.projectId);
    return Response.json(await paymentOrderPayload(currentOrder, project));
  } catch (error) {
    return jsonError(errorMessage(error), 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ publicId: string }> | { publicId: string } },
) {
  const params = await context.params;
  const limited = checkRateLimit({
    key: rateLimitKey(request, "payment-network", params.publicId),
    limit: 20,
    windowMs: 60_000,
  });

  if (!limited.allowed) {
    return jsonError("Too many payment network changes.", 429);
  }

  try {
    const payload = networkChangeSchema.parse(await request.json());
    const repository = getRepository();
    const order = await repository.getPaymentOrder(params.publicId);
    if (!order) {
      return jsonError("Payment order was not found.", 404);
    }

    if (order.status !== "waiting") {
      return jsonError("This order can no longer change payment network.", 409);
    }

    const nextDraft = createPaymentOrderDraftForPublicId({
      publicId: order.publicId,
      projectId: order.projectId,
      network: payload.network as SupportedNetwork,
      bidCreditUsdt: order.bidCreditUsdt,
      expectedSenderAddress: order.expectedSenderAddress,
    });
    const updatedOrder = await repository.updateWaitingPaymentOrderNetwork(
      order.publicId,
      nextDraft,
    );

    if (!updatedOrder) {
      return jsonError("Payment order could not be updated.", 409);
    }

    const project = await repository.getProjectById(updatedOrder.projectId);
    return Response.json(await paymentOrderPayload(updatedOrder, project));
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
