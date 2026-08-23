import { getRepository } from "@/lib/repository";
import { normalizeProjectUrl } from "@/lib/domain/url";
import { assertSafeMetadataUrl } from "@/lib/security/ssrf";
import { publicProject } from "@/lib/repository/serializers";
import { errorMessage, jsonError } from "@/lib/http";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectUrl = url.searchParams.get("url") ?? "";

  const limited = checkRateLimit({
    key: rateLimitKey(request, "duplicate", projectUrl),
    limit: 30,
    windowMs: 60_000,
  });

  if (!limited.allowed) {
    return jsonError("Too many duplicate checks.", 429);
  }

  try {
    const normalized = normalizeProjectUrl(projectUrl);
    assertSafeMetadataUrl(normalized.url);
    const duplicate = await getRepository().findProjectByCanonicalKey(
      normalized.canonicalListingKey,
    );
    return Response.json({
      duplicate: duplicate ? publicProject(duplicate) : null,
      canonicalListingKey: normalized.canonicalListingKey,
    });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
