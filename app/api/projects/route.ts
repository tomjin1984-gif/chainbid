import { z } from "zod";
import { categories } from "@/lib/seed";
import { normalizeProjectUrl, slugifyProjectName } from "@/lib/domain/url";
import { assertSafeMetadataUrl } from "@/lib/security/ssrf";
import { resolveProjectLogoUrl } from "@/lib/project-icons";
import { getRepository } from "@/lib/repository";
import { publicProject } from "@/lib/repository/serializers";
import { errorMessage, jsonError, readJson } from "@/lib/http";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

const projectSchema = z.object({
  url: z.string().min(4).max(2048),
  name: z.string().min(2).max(96),
  description: z.string().min(10).max(280),
  category: z.string().refine((value) => categories.includes(value as never), "Unsupported category."),
  xUrl: z.string().max(2048).optional().nullable(),
  logoUrl: z.string().max(2048).optional().nullable(),
});

export async function POST(request: Request) {
  const limited = checkRateLimit({
    key: rateLimitKey(request, "project-submit"),
    limit: 12,
    windowMs: 60_000,
  });

  if (!limited.allowed) {
    return jsonError("Too many project submissions.", 429);
  }

  try {
    const payload = projectSchema.parse(await readJson(request));
    const normalized = normalizeProjectUrl(payload.url);
    assertSafeMetadataUrl(normalized.url);

    const repository = getRepository();
    const duplicate = await repository.findProjectByCanonicalKey(
      normalized.canonicalListingKey,
    );

    if (duplicate) {
      return Response.json(
        { duplicate: true, project: publicProject(duplicate) },
        { status: 409 },
      );
    }

    const logoUrl = await resolveProjectLogoUrl(normalized.url, payload.logoUrl);

    const project = await repository.createProject({
      canonicalListingKey: normalized.canonicalListingKey,
      slug: slugifyProjectName(payload.name, normalized.hostname),
      name: payload.name.trim(),
      url: normalized.url,
      description: payload.description.trim(),
      category: payload.category,
      xUrl: payload.xUrl?.trim() || null,
      logoUrl,
    });

    return Response.json({ project: publicProject(project) }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
