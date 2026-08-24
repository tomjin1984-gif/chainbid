import { z } from "zod";
import { getRepository } from "@/lib/repository";
import { processPaymentOrder } from "@/lib/payment/worker";
import type { VerificationResult } from "@/lib/payment/types";
import { publicPaymentOrder } from "@/lib/repository/serializers";
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

    const result = await processPaymentOrder({
      order,
      repository,
      txHashHint: payload.txHash,
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
