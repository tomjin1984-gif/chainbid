import { requireEnv } from "@/lib/config/env";
import { decorateLeaderboard } from "@/lib/domain/ranking";
import type { PaymentOrderStatus, SupportedNetwork } from "@/lib/domain/types";
import type { PaymentOrderDraft, VerificationResult } from "@/lib/payment/types";
import {
  activityFromRow,
  bidFromRow,
  paymentOrderFromRow,
  projectFromRow,
} from "./serializers";
import type { CreateProjectInput, Repository } from "./types";

type Row = Record<string, unknown>;

function shouldPersistTxOnOrder(result: VerificationResult) {
  return result.status !== "not_found" && result.status !== "provider_error";
}

function serviceUrl(path: string) {
  return `${requireEnv("SUPABASE_URL").replace(/\/+$/, "")}${path}`;
}

async function supabaseFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(serviceUrl(path), {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${body.slice(0, 300)}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.text();
  if (!body.trim()) {
    return undefined as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Supabase returned unreadable JSON: ${body.slice(0, 300)}`);
  }
}

export class SupabaseRestRepository implements Repository {
  async getLeaderboard(category?: string) {
    const filters = ["status=eq.active"];
    if (category && category !== "All") {
      filters.push(`category=eq.${encodeURIComponent(category)}`);
    }

    const rows = await supabaseFetch<Row[]>(
      `/rest/v1/projects?select=*&${filters.join("&")}&order=total_bid_usdt.desc&order=ranking_timestamp.asc`,
      { method: "GET" },
    );

    return decorateLeaderboard(rows.map(projectFromRow));
  }

  async getActivity(limit = 20) {
    const rows = await supabaseFetch<Row[]>(
      `/rest/v1/activity_events?select=*&order=created_at.desc&limit=${limit}`,
      { method: "GET" },
    );
    return rows.map(activityFromRow);
  }

  async getProjectBySlug(slug: string) {
    const rows = await supabaseFetch<Row[]>(
      `/rest/v1/projects?select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { method: "GET" },
    );
    return rows[0] ? projectFromRow(rows[0]) : null;
  }

  async getProjectById(projectId: string) {
    const rows = await supabaseFetch<Row[]>(
      `/rest/v1/projects?select=*&id=eq.${encodeURIComponent(projectId)}&limit=1`,
      { method: "GET" },
    );
    return rows[0] ? projectFromRow(rows[0]) : null;
  }

  async findProjectByCanonicalKey(key: string) {
    const rows = await supabaseFetch<Row[]>(
      `/rest/v1/projects?select=*&canonical_listing_key=eq.${encodeURIComponent(key)}&limit=1`,
      { method: "GET" },
    );
    return rows[0] ? projectFromRow(rows[0]) : null;
  }

  async createProject(input: CreateProjectInput) {
    const [row] = await supabaseFetch<Row[]>("/rest/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        canonical_listing_key: input.canonicalListingKey,
        slug: input.slug,
        name: input.name,
        url: input.url,
        description: input.description,
        logo_url: input.logoUrl ?? null,
        x_url: input.xUrl ?? null,
        category: input.category,
        total_bid_usdt: 0,
        status: "pending",
      }),
    });
    return projectFromRow(row);
  }

  async listBidsForProject(projectId: string) {
    const rows = await supabaseFetch<Row[]>(
      `/rest/v1/bids?select=*&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc`,
      { method: "GET" },
    );
    return rows.map(bidFromRow);
  }

  async createPaymentOrder(draft: PaymentOrderDraft) {
    const [row] = await supabaseFetch<Row[]>("/rest/v1/payment_orders", {
      method: "POST",
      body: JSON.stringify({
        public_id: draft.publicId,
        project_id: draft.projectId,
        network: draft.network,
        receiver_address: draft.receiverAddress,
        token_contract_or_mint: draft.tokenContractOrMint,
        bid_credit_usdt: draft.bidCreditUsdt.toString(),
        expected_transfer_amount_atomic: draft.expectedTransferAmountAtomic.toString(),
        expected_transfer_amount_display: draft.expectedTransferAmountDisplay,
        expected_sender_address: draft.expectedSenderAddress,
        status: "waiting",
        expires_at: draft.expiresAt,
      }),
    });
    return paymentOrderFromRow(row);
  }

  async getPaymentOrder(publicId: string) {
    const rows = await supabaseFetch<Row[]>(
      `/rest/v1/payment_orders?select=*&public_id=eq.${encodeURIComponent(publicId)}&limit=1`,
      { method: "GET" },
    );
    return rows[0] ? paymentOrderFromRow(rows[0]) : null;
  }

  async findPaymentOrdersByTxHash(txHash: string) {
    const rows = await supabaseFetch<Row[]>(
      `/rest/v1/payment_orders?select=*&tx_hash=eq.${encodeURIComponent(txHash)}&order=created_at.desc&limit=20`,
      { method: "GET" },
    );
    return rows.map(paymentOrderFromRow);
  }

  async updateWaitingPaymentOrderNetwork(publicId: string, draft: PaymentOrderDraft) {
    const rows = await supabaseFetch<Row[]>(
      `/rest/v1/payment_orders?public_id=eq.${encodeURIComponent(publicId)}&status=eq.waiting`,
      {
        method: "PATCH",
        body: JSON.stringify({
          network: draft.network,
          receiver_address: draft.receiverAddress,
          token_contract_or_mint: draft.tokenContractOrMint,
          expected_transfer_amount_atomic: draft.expectedTransferAmountAtomic.toString(),
          expected_transfer_amount_display: draft.expectedTransferAmountDisplay,
          expected_sender_address: draft.expectedSenderAddress,
          expires_at: draft.expiresAt,
          tx_hash: null,
          confirmations: 0,
          block_number_or_slot: null,
          failure_reason: null,
        }),
      },
    );

    return rows[0] ? paymentOrderFromRow(rows[0]) : null;
  }

  async listOpenPaymentOrders(args: { statuses: PaymentOrderStatus[]; limit: number }) {
    const rows = await supabaseFetch<Row[]>(
      `/rest/v1/payment_orders?select=*&status=in.(${args.statuses.join(",")})&order=created_at.asc&limit=${args.limit}`,
      { method: "GET" },
    );
    return rows.map(paymentOrderFromRow);
  }

  async recordVerification(
    publicId: string,
    result: VerificationResult,
    nextStatus: PaymentOrderStatus,
  ) {
    const persistTx = result.txHash && shouldPersistTxOnOrder(result);

    if (persistTx) {
      await supabaseFetch("/rest/v1/blockchain_transactions?on_conflict=network,tx_hash", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          network: result.network,
          tx_hash: result.txHash,
          token_contract_or_mint: result.tokenContractOrMint,
          sender_address: result.senderAddress,
          receiver_address: result.receiverAddress,
          amount_atomic: result.amountAtomic?.toString(),
          block_number_or_slot: result.blockNumberOrSlot,
          verification_status: result.status,
          confirmed_at: result.status === "confirmed" ? new Date().toISOString() : null,
          raw_reference: result.rawReference,
        }),
      });
    }

    const rows = await supabaseFetch<Row[]>(
      `/rest/v1/payment_orders?public_id=eq.${encodeURIComponent(publicId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: nextStatus,
          tx_hash: persistTx ? result.txHash : null,
          block_number_or_slot: result.blockNumberOrSlot,
          confirmations: result.confirmations,
          detected_at: persistTx ? new Date().toISOString() : null,
          confirmed_at: nextStatus === "confirmed" ? new Date().toISOString() : null,
          failure_reason: result.failureReason,
        }),
      },
    );

    return rows[0] ? paymentOrderFromRow(rows[0]) : null;
  }

  async creditPaymentOrder(publicId: string) {
    const [row] = await supabaseFetch<Row[]>("/rest/v1/rpc/credit_payment_order_atomic", {
      method: "POST",
      body: JSON.stringify({ order_public_id: publicId }),
    });

    return {
      credited: Boolean(row?.credited),
      order: row?.payment_order ? paymentOrderFromRow(row.payment_order as Row) : null,
      bid: row?.bid ? bidFromRow(row.bid as Row) : null,
    };
  }

  async recordClick(projectId: string, requestMeta: { ipHash: string; userAgent: string }) {
    const rows = await supabaseFetch<Row[]>("/rest/v1/rpc/record_project_click", {
      method: "POST",
      body: JSON.stringify({
        p_target_project_id: projectId,
        p_ip_hash: requestMeta.ipHash,
        p_user_agent: requestMeta.userAgent,
      }),
    });

    return rows[0]?.url ? String(rows[0].url) : null;
  }

  async adminSnapshot() {
    const [projects, payments, activity] = await Promise.all([
      supabaseFetch<Row[]>("/rest/v1/projects?select=*&order=created_at.desc&limit=200", {
        method: "GET",
      }),
      supabaseFetch<Row[]>("/rest/v1/payment_orders?select=*&order=created_at.desc&limit=200", {
        method: "GET",
      }),
      supabaseFetch<Row[]>("/rest/v1/activity_events?select=*&order=created_at.desc&limit=50", {
        method: "GET",
      }),
    ]);

    return {
      projects: projects.map(projectFromRow),
      payments: payments.map(paymentOrderFromRow),
      activity: activity.map(activityFromRow),
      networks: ["tron", "ethereum", "bsc", "solana"] as SupportedNetwork[],
    };
  }
}
