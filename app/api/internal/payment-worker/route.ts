import { readEnv, isProduction } from "@/lib/config/env";
import { runPaymentWorkerCycle } from "@/lib/payment/worker";
import { getRepository } from "@/lib/repository";
import { jsonError } from "@/lib/http";

function isAuthorized(request: Request) {
  const secret = readEnv("CRON_SECRET");
  if (!secret) {
    return !isProduction();
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return jsonError("Unauthorized.", 401);
  }

  const results = await runPaymentWorkerCycle({
    repository: getRepository(),
    limit: Number(process.env.PAYMENT_WORKER_BATCH_SIZE ?? 10),
  });

  return Response.json({
    processed: results.length,
    credited: results.filter((result) => result.credited).length,
    failed: results.filter((result) => result.error).length,
    errors: results.flatMap((result) => result.error ? [result.error] : []).slice(0, 5),
  });
}
