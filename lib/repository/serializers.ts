import type {
  ActivityEventRecord,
  BidRecord,
  LeaderboardEntry,
  PaymentOrderRecord,
  ProjectRecord,
  SupportedNetwork,
} from "@/lib/domain/types";

function big(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }

  return BigInt(String(value ?? 0));
}

export function projectFromRow(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    canonicalListingKey: String(row.canonical_listing_key),
    name: String(row.name),
    url: String(row.url),
    description: String(row.description ?? ""),
    logoUrl: row.logo_url ? String(row.logo_url) : null,
    xUrl: row.x_url ? String(row.x_url) : null,
    category: String(row.category),
    totalBidUsdt: big(row.total_bid_usdt),
    rankingTimestamp: String(row.ranking_timestamp),
    clickCount: big(row.click_count),
    status: String(row.status) as ProjectRecord["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastBidAt: row.last_bid_at ? String(row.last_bid_at) : null,
  };
}

export function paymentOrderFromRow(row: Record<string, unknown>): PaymentOrderRecord {
  return {
    id: String(row.id),
    publicId: String(row.public_id),
    projectId: String(row.project_id),
    bidId: row.bid_id ? String(row.bid_id) : null,
    network: String(row.network) as SupportedNetwork,
    receiverAddress: String(row.receiver_address),
    tokenContractOrMint: String(row.token_contract_or_mint),
    bidCreditUsdt: big(row.bid_credit_usdt),
    expectedTransferAmountAtomic: big(row.expected_transfer_amount_atomic),
    expectedTransferAmountDisplay: String(row.expected_transfer_amount_display),
    expectedSenderAddress: row.expected_sender_address ? String(row.expected_sender_address) : null,
    status: String(row.status) as PaymentOrderRecord["status"],
    txHash: row.tx_hash ? String(row.tx_hash) : null,
    blockNumberOrSlot: row.block_number_or_slot ? String(row.block_number_or_slot) : null,
    confirmations: Number(row.confirmations ?? 0),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    detectedAt: row.detected_at ? String(row.detected_at) : null,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    creditedAt: row.credited_at ? String(row.credited_at) : null,
    failureReason: row.failure_reason ? String(row.failure_reason) : null,
  };
}

export function bidFromRow(row: Record<string, unknown>): BidRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    paymentOrderId: String(row.payment_order_id),
    previousTotalUsdt: big(row.previous_total_usdt),
    incrementUsdt: big(row.increment_usdt),
    newTotalUsdt: big(row.new_total_usdt),
    rankBefore: row.rank_before === null || row.rank_before === undefined ? null : Number(row.rank_before),
    rankAfter: row.rank_after === null || row.rank_after === undefined ? null : Number(row.rank_after),
    network: String(row.network) as SupportedNetwork,
    createdAt: String(row.created_at),
  };
}

export function activityFromRow(row: Record<string, unknown>): ActivityEventRecord {
  return {
    id: String(row.id),
    kind: String(row.kind) as ActivityEventRecord["kind"],
    projectId: row.project_id ? String(row.project_id) : null,
    paymentOrderId: row.payment_order_id ? String(row.payment_order_id) : null,
    headline: String(row.headline),
    metadata:
      typeof row.metadata === "object" && row.metadata
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at),
  };
}

export function publicLeaderboardEntry(entry: LeaderboardEntry) {
  return {
    ...publicProject(entry),
    rank: entry.rank,
    nextRankTargetUsdt: entry.nextRankTargetUsdt.toString(),
  };
}

export function publicProject(project: ProjectRecord) {
  return {
    ...project,
    totalBidUsdt: project.totalBidUsdt.toString(),
    clickCount: project.clickCount.toString(),
  };
}

export function publicPaymentOrder(order: PaymentOrderRecord) {
  return {
    ...order,
    bidCreditUsdt: order.bidCreditUsdt.toString(),
    expectedTransferAmountAtomic: order.expectedTransferAmountAtomic.toString(),
  };
}
