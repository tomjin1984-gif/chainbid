import { getNetworkConfig } from "@/lib/config/networks";
import { getRepository } from "@/lib/repository";
import { publicPaymentOrder, publicProject } from "@/lib/repository/serializers";
import { buildPaymentPayload, warningForNetwork } from "@/lib/payment/uris";
import { errorMessage, jsonError } from "@/lib/http";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

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

    const project = await repository.getProjectById(order.projectId);
    const network = getNetworkConfig(order.network);
    return Response.json({
      order: publicPaymentOrder(order),
      project: project ? publicProject(project) : null,
      paymentPayload: buildPaymentPayload(order),
      network: {
        label: network.label,
        tokenStandard: network.tokenStandard,
        warning: warningForNetwork(network.label),
        explorerUrl: order.txHash ? network.explorerTxUrl(order.txHash) : null,
      },
    });
  } catch (error) {
    return jsonError(errorMessage(error), 500);
  }
}
