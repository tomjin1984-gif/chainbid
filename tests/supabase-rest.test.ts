import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseRestRepository } from "../lib/repository/supabase-rest";
import type { VerificationResult } from "../lib/payment/types";

function paymentOrderRow() {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    public_id: "po_empty_response",
    project_id: "00000000-0000-0000-0000-000000000002",
    bid_id: null,
    network: "ethereum",
    receiver_address: "0x64182691a520444f9caaf9dcf5bf50e002b42413",
    token_contract_or_mint: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    bid_credit_usdt: "5",
    expected_transfer_amount_atomic: "5000000",
    expected_transfer_amount_display: "5 USDT",
    expected_sender_address: null,
    status: "confirmed",
    tx_hash: "0xconfirmed",
    block_number_or_slot: "0x1",
    confirmations: 64,
    created_at: "2026-08-23T00:00:00.000Z",
    expires_at: "2026-08-23T00:30:00.000Z",
    detected_at: "2026-08-23T00:01:00.000Z",
    confirmed_at: "2026-08-23T00:02:00.000Z",
    credited_at: null,
    failure_reason: null,
  };
}

test("supabase repository accepts empty success bodies from minimal writes", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls: string[] = [];

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input.toString();
    calls.push(url);

    if (url.includes("/rest/v1/blockchain_transactions")) {
      return new Response("", { status: 201 });
    }

    return Response.json([paymentOrderRow()]);
  }) as typeof fetch;

  const verification: VerificationResult = {
    status: "confirmed",
    network: "ethereum",
    txHash: "0xconfirmed",
    tokenContractOrMint: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    senderAddress: "0xsender",
    receiverAddress: "0x64182691a520444f9caaf9dcf5bf50e002b42413",
    amountAtomic: BigInt(5000000),
    blockNumberOrSlot: "0x1",
    confirmations: 64,
    rawReference: "0xconfirmed",
    failureReason: null,
  };

  try {
    const repository = new SupabaseRestRepository();
    const order = await repository.recordVerification(
      "po_empty_response",
      verification,
      "confirmed",
    );

    assert.equal(order?.txHash, "0xconfirmed");
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalUrl;
    }
    if (originalKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  }
});
