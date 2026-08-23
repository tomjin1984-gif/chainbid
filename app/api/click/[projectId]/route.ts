import { getRepository } from "@/lib/repository";
import { hashRequestIp, jsonError } from "@/lib/http";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> | { projectId: string } },
) {
  const params = await context.params;
  const limited = checkRateLimit({
    key: rateLimitKey(request, "click", params.projectId),
    limit: 12,
    windowMs: 60_000,
  });

  if (!limited.allowed) {
    return jsonError("Too many outbound clicks.", 429);
  }

  const destination = await getRepository().recordClick(params.projectId, {
    ipHash: hashRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? "",
  });

  if (!destination) {
    return jsonError("Project was not found.", 404);
  }

  return Response.redirect(destination, 302);
}
