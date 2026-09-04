import { runPaymentWorkerCycle } from "@/lib/payment/worker";
import { getRepository } from "@/lib/repository";

export async function runPaymentMonitor() {
  const results = await runPaymentWorkerCycle({
    repository: getRepository(),
    limit: Number(process.env.PAYMENT_WORKER_BATCH_SIZE ?? 10),
  });

  console.log(
    JSON.stringify({
      event: "payment_worker_finished",
      processed: results.length,
      credited: results.filter((result) => result.credited).length,
      failed: results.filter((result) => result.error).length,
    }),
  );

  return results;
}

if (process.env.RUN_PAYMENT_MONITOR_ONCE === "true") {
  runPaymentMonitor()
    .then((results) => {
      console.log(
        JSON.stringify({
          event: "payment_worker_finished",
          processed: results.length,
          credited: results.filter((result) => result.credited).length,
        }),
      );
    })
    .catch((error) => {
      console.error(
        JSON.stringify({
          event: "payment_worker_failed",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      process.exitCode = 1;
    });
}
