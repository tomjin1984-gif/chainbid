import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const supportedNetwork = pgEnum("supported_network", [
  "tron",
  "ethereum",
  "bsc",
  "solana",
]);

export const projectStatus = pgEnum("project_status", [
  "pending",
  "active",
  "hidden",
  "banned",
]);

export const paymentOrderStatus = pgEnum("payment_order_status", [
  "created",
  "waiting",
  "detected",
  "confirming",
  "confirmed",
  "credited",
  "expired",
  "underpaid",
  "overpaid",
  "manual_review",
  "failed",
]);

export const verificationStatus = pgEnum("verification_status", [
  "not_found",
  "wrong_network",
  "wrong_token",
  "wrong_receiver",
  "wrong_amount",
  "wrong_sender",
  "failed_transaction",
  "unconfirmed",
  "confirmed",
  "manual_review",
  "provider_error",
]);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    canonicalListingKey: text("canonical_listing_key").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    description: text("description").notNull().default(""),
    logoUrl: text("logo_url"),
    xUrl: text("x_url"),
    category: text("category").notNull(),
    totalBidUsdt: bigint("total_bid_usdt", { mode: "bigint" }).notNull().default(sql`0`),
    rankingTimestamp: timestamp("ranking_timestamp", { withTimezone: true }).notNull().defaultNow(),
    clickCount: bigint("click_count", { mode: "bigint" }).notNull().default(sql`0`),
    status: projectStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastBidAt: timestamp("last_bid_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("projects_canonical_listing_key_uidx").on(table.canonicalListingKey),
    index("projects_leaderboard_idx").on(
      table.status,
      table.totalBidUsdt,
      table.rankingTimestamp,
    ),
  ],
);

export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicId: text("public_id").notNull().unique(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    bidId: uuid("bid_id"),
    network: supportedNetwork("network").notNull(),
    receiverAddress: text("receiver_address").notNull(),
    tokenContractOrMint: text("token_contract_or_mint").notNull(),
    bidCreditUsdt: bigint("bid_credit_usdt", { mode: "bigint" }).notNull(),
    expectedTransferAmountAtomic: numeric("expected_transfer_amount_atomic", {
      precision: 78,
      scale: 0,
    }).notNull(),
    expectedTransferAmountDisplay: text("expected_transfer_amount_display").notNull(),
    expectedSenderAddress: text("expected_sender_address"),
    status: paymentOrderStatus("status").notNull().default("created"),
    txHash: text("tx_hash"),
    blockNumberOrSlot: text("block_number_or_slot"),
    confirmations: integer("confirmations").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    creditedAt: timestamp("credited_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
  },
  (table) => [
    uniqueIndex("payment_orders_network_tx_hash_uidx").on(table.network, table.txHash),
    index("payment_orders_status_idx").on(table.status, table.createdAt),
    index("payment_orders_project_idx").on(table.projectId),
  ],
);

export const bids = pgTable(
  "bids",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    paymentOrderId: uuid("payment_order_id").notNull().references(() => paymentOrders.id).unique(),
    previousTotalUsdt: bigint("previous_total_usdt", { mode: "bigint" }).notNull(),
    incrementUsdt: bigint("increment_usdt", { mode: "bigint" }).notNull(),
    newTotalUsdt: bigint("new_total_usdt", { mode: "bigint" }).notNull(),
    rankBefore: integer("rank_before"),
    rankAfter: integer("rank_after"),
    network: supportedNetwork("network").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("bids_project_created_idx").on(table.projectId, table.createdAt),
  ],
);

export const blockchainTransactions = pgTable(
  "blockchain_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    network: supportedNetwork("network").notNull(),
    txHash: text("tx_hash").notNull(),
    tokenContractOrMint: text("token_contract_or_mint"),
    senderAddress: text("sender_address"),
    receiverAddress: text("receiver_address"),
    amountAtomic: numeric("amount_atomic", { precision: 78, scale: 0 }),
    blockNumberOrSlot: text("block_number_or_slot"),
    verificationStatus: verificationStatus("verification_status").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    rawReference: text("raw_reference"),
  },
  (table) => [
    uniqueIndex("blockchain_transactions_network_tx_uidx").on(table.network, table.txHash),
  ],
);

export const activityEvents = pgTable("activity_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  paymentOrderId: uuid("payment_order_id").references(() => paymentOrders.id),
  headline: text("headline").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clickEvents = pgTable(
  "click_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    ipHash: text("ip_hash").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("click_events_project_created_idx").on(table.projectId, table.createdAt)],
);

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  admin: text("admin").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
