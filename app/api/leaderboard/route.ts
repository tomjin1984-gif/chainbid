import { getRepository } from "@/lib/repository";
import { publicLeaderboardEntry } from "@/lib/repository/serializers";
import { errorMessage, jsonError } from "@/lib/http";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

export async function GET(request: Request) {
  const limited = checkRateLimit({
    key: rateLimitKey(request, "leaderboard"),
    limit: 120,
    windowMs: 60_000,
  });

  if (!limited.allowed) {
    return jsonError("Too many leaderboard requests.", 429);
  }

  try {
    const category = new URL(request.url).searchParams.get("category") ?? undefined;
    const repository = getRepository();
    const entries = await repository.getLeaderboard(category);
    return Response.json({ entries: entries.map(publicLeaderboardEntry) });
  } catch (error) {
    return jsonError(errorMessage(error), 500);
  }
}
