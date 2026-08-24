import { getNetworkConfigs } from "@/lib/config/networks";
import { getRepository, getRepositoryDiagnostics } from "@/lib/repository";

export async function GET() {
  let database = "ok";
  let leaderboardCount = 0;
  let topProjectName: string | null = null;

  try {
    const leaderboard = await getRepository().getLeaderboard();
    leaderboardCount = leaderboard.length;
    topProjectName = leaderboard[0]?.name ?? null;
  } catch (error) {
    database = error instanceof Error ? error.message : "error";
  }

  return Response.json({
    status: database === "ok" ? "ok" : "degraded",
    database,
    repository: getRepositoryDiagnostics(),
    leaderboardCount,
    topProjectName,
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
