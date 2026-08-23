import { decorateLeaderboard, rankForTotalBid } from "@/lib/domain/ranking";
import { normalizeProjectUrl, slugifyProjectName } from "@/lib/domain/url";
import type {
  ActivityEventRecord,
  BidRecord,
  PaymentOrderRecord,
  PaymentOrderStatus,
  ProjectRecord,
  SupportedNetwork,
} from "@/lib/domain/types";
import { developmentProjects } from "@/lib/seed";
import type { PaymentOrderDraft, VerificationResult } from "@/lib/payment/types";
import type { CreateProjectInput, Repository } from "./types";

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}_${uuid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;
}

function seedIconUrl(hostname: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
}

function toProject(seed: (typeof developmentProjects)[number]): ProjectRecord {
  const normalized = normalizeProjectUrl(seed.url);
  return {
    id: seed.id,
    slug: seed.slug,
    canonicalListingKey: normalized.canonicalListingKey,
    name: seed.name,
    url: seed.url,
    description: seed.description,
    logoUrl: seedIconUrl(normalized.hostname),
    xUrl: null,
    category: seed.category,
    totalBidUsdt: BigInt(seed.totalBidUsdt),
    rankingTimestamp: seed.rankingTimestamp,
    clickCount: BigInt(seed.clickCount),
    status: "active",
    createdAt: seed.rankingTimestamp,
    updatedAt: seed.rankingTimestamp,
    lastBidAt: seed.rankingTimestamp,
  };
}

class DevRepository implements Repository {
  private projects = new Map<string, ProjectRecord>();
  private payments = new Map<string, PaymentOrderRecord>();
  private bids = new Map<string, BidRecord>();
  private activity: ActivityEventRecord[] = [];
  private usedTransactions = new Set<string>();

  constructor() {
    for (const project of developmentProjects.map(toProject)) {
      this.projects.set(project.id, project);
    }

    this.activity = [
      {
        id: "act_1",
        kind: "rank_changed",
        projectId: "uniswap",
        paymentOrderId: null,
        headline: "uniswap.org took #1 - 14,023 USDT",
        metadata: { developmentSeed: true },
        createdAt: "2026-08-22T12:05:00.000Z",
      },
      {
        id: "act_2",
        kind: "payment_credited",
        projectId: "bittensor",
        paymentOrderId: null,
        headline: "bittensor.com raised its bid to 13,500 USDT",
        metadata: { developmentSeed: true },
        createdAt: "2026-08-22T09:14:00.000Z",
      },
    ];
  }

  async getLeaderboard(category?: string) {
    const projects = [...this.projects.values()].filter((project) => {
      return project.status === "active" && (!category || category === "All" || project.category === category);
    });

    return decorateLeaderboard(projects);
  }

  async getActivity(limit = 20) {
    return this.activity.slice(0, limit);
  }

  async getProjectBySlug(slug: string) {
    return [...this.projects.values()].find((project) => project.slug === slug) ?? null;
  }

  async getProjectById(projectId: string) {
    return this.projects.get(projectId) ?? null;
  }

  async findProjectByCanonicalKey(key: string) {
    return [...this.projects.values()].find((project) => project.canonicalListingKey === key) ?? null;
  }

  async createProject(input: CreateProjectInput) {
    const project: ProjectRecord = {
      id: id("proj"),
      slug: slugifyProjectName(input.name, input.canonicalListingKey),
      canonicalListingKey: input.canonicalListingKey,
      name: input.name,
      url: input.url,
      description: input.description,
      logoUrl: input.logoUrl ?? null,
      xUrl: input.xUrl ?? null,
      category: input.category,
      totalBidUsdt: BigInt(0),
      rankingTimestamp: nowIso(),
      clickCount: BigInt(0),
      status: "pending",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastBidAt: null,
    };

    this.projects.set(project.id, project);
    return project;
  }

  async listBidsForProject(projectId: string) {
    return [...this.bids.values()]
      .filter((bid) => bid.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createPaymentOrder(draft: PaymentOrderDraft) {
    const createdAt = nowIso();
    const order: PaymentOrderRecord = {
      id: id("pay"),
      publicId: draft.publicId,
      projectId: draft.projectId,
      bidId: null,
      network: draft.network,
      receiverAddress: draft.receiverAddress,
      tokenContractOrMint: draft.tokenContractOrMint,
      bidCreditUsdt: draft.bidCreditUsdt,
      expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
      expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
      expectedSenderAddress: draft.expectedSenderAddress,
      status: "waiting",
      txHash: null,
      blockNumberOrSlot: null,
      confirmations: 0,
      createdAt,
      expiresAt: draft.expiresAt,
      detectedAt: null,
      confirmedAt: null,
      creditedAt: null,
      failureReason: null,
    };

    this.payments.set(order.publicId, order);
    return order;
  }

  async getPaymentOrder(publicId: string) {
    return this.payments.get(publicId) ?? null;
  }

  async listOpenPaymentOrders(args: { statuses: PaymentOrderStatus[]; limit: number }) {
    return [...this.payments.values()]
      .filter((payment) => args.statuses.includes(payment.status))
      .slice(0, args.limit);
  }

  async recordVerification(
    publicId: string,
    result: VerificationResult,
    nextStatus: PaymentOrderStatus,
  ) {
    const order = this.payments.get(publicId);
    if (!order) {
      return null;
    }

    if (result.txHash) {
      const txKey = `${result.network}:${result.txHash}`;
      if (this.usedTransactions.has(txKey) && order.txHash !== result.txHash) {
        nextStatus = "manual_review";
      }
      this.usedTransactions.add(txKey);
    }

    const updated: PaymentOrderRecord = {
      ...order,
      status: nextStatus,
      txHash: result.txHash ?? order.txHash,
      blockNumberOrSlot: result.blockNumberOrSlot,
      confirmations: result.confirmations,
      detectedAt: order.detectedAt ?? (result.txHash ? nowIso() : null),
      confirmedAt: nextStatus === "confirmed" ? nowIso() : order.confirmedAt,
      failureReason: result.failureReason,
    };
    this.payments.set(publicId, updated);
    return updated;
  }

  async creditPaymentOrder(publicId: string) {
    const order = this.payments.get(publicId) ?? null;
    if (!order || order.status !== "confirmed") {
      return { credited: false as const, order, bid: null };
    }

    if (order.creditedAt && order.bidId) {
      return { credited: false as const, order, bid: this.bids.get(order.bidId) ?? null };
    }

    const project = this.projects.get(order.projectId);
    if (!project) {
      return { credited: false as const, order, bid: null };
    }

    const activeProjects = [...this.projects.values()].filter((item) => item.status === "active");
    const rankBefore = rankForTotalBid(project.totalBidUsdt, project.rankingTimestamp, activeProjects);
    const creditedAt = nowIso();
    const newTotalUsdt = project.totalBidUsdt + order.bidCreditUsdt;
    const updatedProject: ProjectRecord = {
      ...project,
      totalBidUsdt: newTotalUsdt,
      rankingTimestamp: creditedAt,
      status: "active",
      lastBidAt: creditedAt,
      updatedAt: creditedAt,
    };
    this.projects.set(project.id, updatedProject);

    const rankAfter = rankForTotalBid(
      newTotalUsdt,
      creditedAt,
      [...this.projects.values()].filter((item) => item.status === "active" && item.id !== project.id),
    );
    const bid: BidRecord = {
      id: id("bid"),
      projectId: project.id,
      paymentOrderId: order.id,
      previousTotalUsdt: project.totalBidUsdt,
      incrementUsdt: order.bidCreditUsdt,
      newTotalUsdt,
      rankBefore,
      rankAfter,
      network: order.network,
      createdAt: creditedAt,
    };
    this.bids.set(bid.id, bid);

    const creditedOrder = {
      ...order,
      status: "credited" as const,
      bidId: bid.id,
      creditedAt,
    };
    this.payments.set(publicId, creditedOrder);
    this.activity.unshift({
      id: id("act"),
      kind: "payment_credited",
      projectId: project.id,
      paymentOrderId: order.id,
      headline: `${updatedProject.name} raised its bid to ${newTotalUsdt.toString()} USDT`,
      metadata: { rankBefore, rankAfter, network: order.network },
      createdAt: creditedAt,
    });

    return { credited: true as const, order: creditedOrder, bid };
  }

  async recordClick(projectId: string) {
    const project = this.projects.get(projectId);
    if (!project) {
      return null;
    }

    const updated = { ...project, clickCount: project.clickCount + BigInt(1), updatedAt: nowIso() };
    this.projects.set(projectId, updated);
    return updated.url;
  }

  async adminSnapshot() {
    return {
      projects: [...this.projects.values()],
      payments: [...this.payments.values()],
      activity: this.activity,
      networks: ["tron", "ethereum", "bsc", "solana"] as SupportedNetwork[],
    };
  }
}

export const devRepository = new DevRepository();
