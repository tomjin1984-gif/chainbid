import { z } from "zod";
import { categories } from "@/lib/seed";
import { normalizeProjectUrl, slugifyProjectName } from "@/lib/domain/url";
import { parseBoostTarget, parseWholeUsdt, bidIncrementForTarget } from "@/lib/domain/money";
import type { SupportedNetwork } from "@/lib/domain/types";
import { assertSafeMetadataUrl } from "@/lib/security/ssrf";
import { getNetworkConfig } from "@/lib/config/networks";
import { encodeDevelopmentCheckout } from "@/lib/dev-checkout-token";
import { createPaymentOrderDraft } from "@/lib/payment/orders";
import { buildPaymentPayload, warningForNetwork } from "@/lib/payment/uris";
import { resolveProjectLogoUrl } from "@/lib/project-icons";
import { resolveProjectMetadata } from "@/lib/project-metadata";
import { getRepository } from "@/lib/repository";
import { publicPaymentOrder, publicProject } from "@/lib/repository/serializers";
import { errorMessage, jsonError, readJson } from "@/lib/http";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

const orderSchema = z.object({
  projectId: z.string().optional(),
  project: z
    .object({
      url: z.string().min(4).max(2048),
      name: z.string().max(96).optional().nullable(),
      description: z.string().max(280).optional().nullable(),
      category: z.string().refine((value) => categories.includes(value as never), "Unsupported category."),
      xUrl: z.string().max(2048).optional().nullable(),
      logoUrl: z.string().max(2048).optional().nullable(),
    })
    .optional(),
  network: z.enum(["tron", "ethereum", "bsc", "solana"]),
  bidTotalUsdt: z.union([z.string(), z.number(), z.bigint()]),
  expectedSenderAddress: z.string().max(160).optional().nullable(),
});

export async function POST(request: Request) {
  const limited = checkRateLimit({
    key: rateLimitKey(request, "payment-create"),
    limit: 10,
    windowMs: 60_000,
  });

  if (!limited.allowed) {
    return jsonError("Too many payment order requests.", 429);
  }

  try {
    const payload = orderSchema.parse(await readJson(request));
    const repository = getRepository();
    let project = payload.projectId
      ? await repository.getProjectById(payload.projectId)
      : null;

    if (!project && payload.project) {
      const normalized = normalizeProjectUrl(payload.project.url);
      assertSafeMetadataUrl(normalized.url);
      const duplicate = await repository.findProjectByCanonicalKey(
        normalized.canonicalListingKey,
      );

      if (duplicate) {
        project = duplicate;
      } else {
        const [metadata, logoUrl] = await Promise.all([
          resolveProjectMetadata(normalized.url),
          resolveProjectLogoUrl(normalized.url, payload.project.logoUrl),
        ]);
        const name = payload.project.name?.trim() || metadata.name;
        const description = payload.project.description?.trim() || metadata.description;

        if (name.length < 2) {
          return jsonError("Project name could not be detected from this URL.", 400);
        }

        if (description.length < 10) {
          return jsonError("Project description could not be detected from this URL.", 400);
        }

        project = await repository.createProject({
          canonicalListingKey: normalized.canonicalListingKey,
          slug: slugifyProjectName(name, normalized.hostname),
          name,
          url: normalized.url,
          description,
          category: payload.project.category,
          xUrl: payload.project.xUrl?.trim() || null,
          logoUrl,
        });
      }
    }

    if (!project) {
      return jsonError("Project was not found.", 404);
    }

    const requestedTotal = parseWholeUsdt(payload.bidTotalUsdt);
    const bidCreditUsdt =
      project.totalBidUsdt > BigInt(0)
        ? bidIncrementForTarget(project.totalBidUsdt, parseBoostTarget(project.totalBidUsdt, requestedTotal))
        : requestedTotal;

    const draft = createPaymentOrderDraft({
      projectId: project.id,
      network: payload.network as SupportedNetwork,
      bidCreditUsdt,
      expectedSenderAddress: payload.expectedSenderAddress,
    });
    const order = await repository.createPaymentOrder(draft);
    const network = getNetworkConfig(order.network);
    const publicOrder = publicPaymentOrder(order);
    const publicProjectPayload = publicProject(project);
    const paymentPayload = buildPaymentPayload(order);
    const networkPayload = {
      label: network.label,
      tokenStandard: network.tokenStandard,
      warning: warningForNetwork(network.label),
    };
    const developmentCheckoutToken = encodeDevelopmentCheckout({
      project: { name: project.name },
      order: publicOrder,
      paymentPayload,
      network: networkPayload,
    });

    return Response.json(
      {
        project: publicProjectPayload,
        order: publicOrder,
        paymentPayload,
        network: networkPayload,
        developmentCheckoutToken,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
