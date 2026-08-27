import { readBooleanEnv } from "@/lib/config/env";
import type { Repository } from "@/lib/repository/types";
import { runPaymentWorkerCycle } from "./worker";

let lastSweepAt = 0;
let sweepInFlight: Promise<unknown> | null = null;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAutomaticPaymentSweep({
  repository,
  limit = 3,
  minIntervalMs = 10_000,
  maxWaitMs = 2_500,
}: {
  repository: Repository;
  limit?: number;
  minIntervalMs?: number;
  maxWaitMs?: number;
}) {
  if (!readBooleanEnv("AUTO_PAYMENT_SWEEP_ENABLED", true)) {
    return;
  }

  const now = Date.now();
  if (sweepInFlight || now - lastSweepAt < minIntervalMs) {
    return;
  }

  lastSweepAt = now;
  sweepInFlight = runPaymentWorkerCycle({
    repository,
    limit,
  })
    .catch(() => null)
    .finally(() => {
      sweepInFlight = null;
    });

  if (maxWaitMs > 0) {
    await Promise.race([sweepInFlight, wait(maxWaitMs)]);
  }
}
