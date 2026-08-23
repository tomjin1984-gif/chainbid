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
    limit: 50,
  });

  return Response.json({
    processed: results.length,
    credited: results.filter((result) => result.credited).length,
  });
}
