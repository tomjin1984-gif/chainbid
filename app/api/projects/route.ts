import { z } from "zod";
import { categories } from "@/lib/seed";
import { normalizeProjectUrl, slugifyProjectName } from "@/lib/domain/url";
import { assertSafeMetadataUrl } from "@/lib/security/ssrf";
import { resolveProjectLogoUrl } from "@/lib/project-icons";
import { resolveProjectMetadata } from "@/lib/project-metadata";
import { getRepository } from "@/lib/repository";
import { publicProject } from "@/lib/repository/serializers";
import { errorMessage, jsonError, readJson } from "@/lib/http";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

const projectSchema = z.object({
  url: z.string().min(4).max(2048),
  name: z.string().max(96).optional().nullable(),
  description: z.string().max(280).optional().nullable(),
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

    const [metadata, logoUrl] = await Promise.all([
      resolveProjectMetadata(normalized.url),
      resolveProjectLogoUrl(normalized.url, payload.logoUrl),
    ]);
    const name = payload.name?.trim() || metadata.name;
    const description = payload.description?.trim() || metadata.description;

    if (name.length < 2) {
      return jsonError("Project name could not be detected from this URL.", 400);
    }

    if (description.length < 10) {
      return jsonError("Project description could not be detected from this URL.", 400);
    }

    const project = await repository.createProject({
      canonicalListingKey: normalized.canonicalListingKey,
      slug: slugifyProjectName(name, normalized.hostname),
      name,
      url: normalized.url,
      description,
      category: payload.category,
      xUrl: payload.xUrl?.trim() || null,
      logoUrl,
    });

    return Response.json({ project: publicProject(project) }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
