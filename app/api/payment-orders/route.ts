import { z } from "zod";
import { categories } from "@/lib/seed";
import { normalizeProjectUrl, slugifyProjectName } from "@/lib/domain/url";
import {
  MIN_BID_USDT,
  parseWholeUsdt,
} from "@/lib/domain/money";
import type {
  PaymentOrderRecord,
  PaymentOrderStatus,
  ProjectRecord,
  SupportedNetwork,
} from "@/lib/domain/types";
import { assertSafeMetadataUrl } from "@/lib/security/ssrf";
import { getNetworkConfig } from "@/lib/config/networks";
import { encodeDevelopmentCheckout } from "@/lib/dev-checkout-token";
import { createPaymentOrderDraft, createPaymentOrderDraftForPublicId } from "@/lib/payment/orders";
import { buildPaymentPayload, warningForNetwork } from "@/lib/payment/uris";
import { projectFaviconFallbackUrl, sanitizeProjectIconUrl } from "@/lib/project-icons";
import { inferProjectMetadataFromUrl } from "@/lib/project-metadata";
import { getRepository } from "@/lib/repository";
import { publicPaymentOrder, publicProject } from "@/lib/repository/serializers";
import type { Repository } from "@/lib/repository/types";
import { errorMessage, jsonError, readJson } from "@/lib/http";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import type { NormalizedProjectUrl } from "@/lib/domain/url";

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
  minimumBidTotalUsdt: z.union([z.string(), z.number(), z.bigint()]).optional(),
  expectedSenderAddress: z.string().max(160).optional().nullable(),
});

const reusableOrderStatuses: PaymentOrderStatus[] = [
  "waiting",
  "detected",
  "confirming",
  "confirmed",
];

function projectMatchesListing(project: ProjectRecord, normalized: NormalizedProjectUrl) {
  const acceptedKeys = new Set([
    normalized.canonicalListingKey,
    ...normalized.canonicalListingKeyAlternates,
  ]);

  if (acceptedKeys.has(project.canonicalListingKey)) {
    return true;
  }

  try {
    const existing = normalizeProjectUrl(project.url);
    return acceptedKeys.has(existing.canonicalListingKey);
  } catch {
    return false;
  }
}

async function findExistingProject(
  repository: Repository,
  normalized: NormalizedProjectUrl,
  slug?: string,
) {
  for (const key of [
    normalized.canonicalListingKey,
    ...normalized.canonicalListingKeyAlternates,
  ]) {
    const duplicate = await repository.findProjectByCanonicalKey(key);
    if (duplicate) {
      return duplicate;
    }
  }

  if (slug) {
    const bySlug = await repository.getProjectBySlug(slug);
    if (bySlug && projectMatchesListing(bySlug, normalized)) {
      return bySlug;
    }
  }

  return null;
}

function uniqueSlug(baseSlug: string, canonicalKey: string) {
  let hash = 0;
  for (const char of canonicalKey) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  const suffix = hash.toString(36).slice(0, 6);
  return `${baseSlug.slice(0, Math.max(1, 65 - suffix.length))}-${suffix}`;
}

function minimumTargetForProject(project: ProjectRecord, requestedMinimumTotal?: bigint | null) {
  const naturalMinimum =
    project.totalBidUsdt > BigInt(0)
      ? project.totalBidUsdt + BigInt(1)
      : MIN_BID_USDT;

  if (requestedMinimumTotal && requestedMinimumTotal > naturalMinimum) {
    return requestedMinimumTotal;
  }

  return naturalMinimum;
}

function calculateBidCredit(
  project: ProjectRecord,
  requestedTotal: bigint,
  requestedMinimumTotal?: bigint | null,
) {
  const minimumTarget = minimumTargetForProject(project, requestedMinimumTotal);

  if (requestedTotal < minimumTarget) {
    throw new Error(
      `Enter at least ${minimumTarget.toString()} USDT as the target total bid. You can enter any higher amount.`,
    );
  }

  return project.totalBidUsdt > BigInt(0)
    ? requestedTotal - project.totalBidUsdt
    : requestedTotal;
}

async function paymentOrderPayload(
  order: PaymentOrderRecord,
  project: ProjectRecord,
  status = 201,
) {
  const network = getNetworkConfig(order.network);
  const publicOrder = publicPaymentOrder(order);
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
      project: publicProject(project),
      order: publicOrder,
      paymentPayload,
      network: networkPayload,
      developmentCheckoutToken,
    },
    { status },
  );
}

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
      const duplicate = await findExistingProject(repository, normalized);

      if (duplicate) {
        project = duplicate;
      } else {
        const metadata = inferProjectMetadataFromUrl(normalized.url);
        const logoUrl =
          sanitizeProjectIconUrl(payload.project.logoUrl ?? "", normalized.url) ||
          projectFaviconFallbackUrl(normalized.url);
        const name = payload.project.name?.trim() || metadata.name;
        const description = payload.project.description?.trim() || metadata.description;

        if (name.length < 2) {
          return jsonError("Project name could not be detected from this URL.", 400);
        }

        if (description.length < 10) {
          return jsonError("Project description could not be detected from this URL.", 400);
        }

        const baseSlug = slugifyProjectName(name, normalized.hostname);
        const existingBySlug = await findExistingProject(repository, normalized, baseSlug);
        if (existingBySlug) {
          project = existingBySlug;
        } else {
          const slug =
            (await repository.getProjectBySlug(baseSlug))
              ? uniqueSlug(baseSlug, normalized.canonicalListingKey)
              : baseSlug;

          try {
            project = await repository.createProject({
              canonicalListingKey: normalized.canonicalListingKey,
              slug,
              name,
              url: normalized.url,
              description,
              category: payload.project.category,
              xUrl: payload.project.xUrl?.trim() || null,
              logoUrl,
            });
          } catch (error) {
            const fallback = await findExistingProject(repository, normalized, baseSlug);
            if (fallback) {
              project = fallback;
            } else if (errorMessage(error).includes("duplicate key")) {
              return jsonError(
                "This project already has a pending or active listing. Open it from the leaderboard or try again in a moment.",
                409,
              );
            } else {
              throw error;
            }
          }
        }
      }
    }

    if (!project) {
      return jsonError("Project was not found.", 404);
    }

    const requestedTotal = parseWholeUsdt(payload.bidTotalUsdt);
    const requestedMinimumTotal = payload.minimumBidTotalUsdt
      ? parseWholeUsdt(payload.minimumBidTotalUsdt)
      : null;
    const reusableOrder = await repository.findOpenPaymentOrderForProject({
      projectId: project.id,
      statuses: reusableOrderStatuses,
    });

    if (reusableOrder) {
      let order = reusableOrder;

      if (reusableOrder.status === "waiting") {
        const draft = createPaymentOrderDraftForPublicId({
          publicId: reusableOrder.publicId,
          projectId: project.id,
          network: payload.network as SupportedNetwork,
          bidCreditUsdt: calculateBidCredit(project, requestedTotal, requestedMinimumTotal),
          expectedSenderAddress: payload.expectedSenderAddress,
        });
        order = (await repository.updateWaitingPaymentOrderNetwork(
          reusableOrder.publicId,
          draft,
        )) ?? reusableOrder;
      } else if (reusableOrder.status === "confirmed") {
        const credited = await repository.creditPaymentOrder(reusableOrder.publicId);
        order = credited.order ?? reusableOrder;
        project = (await repository.getProjectById(project.id)) ?? project;
      }

      return paymentOrderPayload(order, project, 200);
    }

    const bidCreditUsdt = calculateBidCredit(project, requestedTotal, requestedMinimumTotal);

    const draft = createPaymentOrderDraft({
      projectId: project.id,
      network: payload.network as SupportedNetwork,
      bidCreditUsdt,
      expectedSenderAddress: payload.expectedSenderAddress,
    });
    const order = await repository.createPaymentOrder(draft);
    return paymentOrderPayload(order, project);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
