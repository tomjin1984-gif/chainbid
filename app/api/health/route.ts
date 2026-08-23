import { getNetworkConfigs } from "@/lib/config/networks";
import { getRepository } from "@/lib/repository";

export async function GET() {
  let database = "ok";
  try {
    await getRepository().getLeaderboard();
  } catch (error) {
    database = error instanceof Error ? error.message : "error";
  }

  return Response.json({
    status: database === "ok" ? "ok" : "degraded",
    database,
    networks: getNetworkConfigs().map((network) => ({
      network: network.network,
      label: network.label,
      enabled: network.enabled,
      rpcConfigured: Boolean(network.rpcUrl),
      sourceStatus: network.sourceStatus,
      finality: network.finality.description,
    })),
    worker: "payment monitor callable via worker/payment-monitor.ts or scheduled runtime",
  });
}
