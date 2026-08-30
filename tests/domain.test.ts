import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { getNetworkConfig } from "../lib/config/networks";
import { parseWholeUsdt, createUniqueTransferAmountAtomic, formatAtomicAmount } from "../lib/domain/money";
import {
  claimTopBid,
  clickIncrementForRank,
  sortProjectsForLeaderboard,
  targetToPassRank,
} from "../lib/domain/ranking";
import { normalizeProjectUrl } from "../lib/domain/url";
import { errorMessage } from "../lib/http";
import { assertSafeMetadataUrl } from "../lib/security/ssrf";
import { createPaymentOrderDraft, createPaymentOrderDraftForPublicId } from "../lib/payment/orders";
import { attachManualCheckToOrder } from "../lib/payment/manual-check";
import { networksForTransactionHash } from "../lib/payment/network-detection";
import { processPaymentOrder } from "../lib/payment/worker";
import { EvmUsdtVerifier } from "../lib/payment/verifiers/evm";
import { SolanaUsdtVerifier } from "../lib/payment/verifiers/solana";
import { TronUsdtVerifier } from "../lib/payment/verifiers/tron";
import { devRepository } from "../lib/repository/dev-store";
import { POST as createPaymentOrder } from "../app/api/payment-orders/route";
import type { PaymentVerifier, VerificationResult } from "../lib/payment/types";
import type { PaymentOrderRecord } from "../lib/domain/types";

function evmAddressTopic(address: string) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

test("validates whole-USDT bid minimum without a product-level cap", () => {
  assert.equal(parseWholeUsdt("5"), BigInt(5));
  assert.equal(parseWholeUsdt("999999"), BigInt(999999));
  assert.equal(parseWholeUsdt("10000"), BigInt(10000));
  assert.equal(parseWholeUsdt("1000000000"), BigInt(1000000000));

  for (const invalid of ["4", "5.5", "-10", "0", "NaN", "Infinity"]) {
    assert.throws(() => parseWholeUsdt(invalid));
  }
});

test("applies ranking, #1 claim, normal pass, and tie ordering", () => {
  const projects = [
    { totalBidUsdt: BigInt(500), rankingTimestamp: "2026-01-02T00:00:00.000Z" },
    { totalBidUsdt: BigInt(1000), rankingTimestamp: "2026-01-03T00:00:00.000Z" },
    { totalBidUsdt: BigInt(1000), rankingTimestamp: "2026-01-01T00:00:00.000Z" },
  ];

  const sorted = sortProjectsForLeaderboard(projects);
  assert.equal(sorted[0].rankingTimestamp, "2026-01-01T00:00:00.000Z");
  assert.equal(claimTopBid(projects), BigInt(1005));
  assert.equal(targetToPassRank(2, projects), BigInt(1001));
});

test("weights outbound clicks by leaderboard rank", () => {
  assert.equal(clickIncrementForRank(1), 15);
  assert.equal(clickIncrementForRank(3), 15);
  assert.equal(clickIncrementForRank(4), 10);
  assert.equal(clickIncrementForRank(10), 10);
  assert.equal(clickIncrementForRank(11), 5);
  assert.equal(clickIncrementForRank(20), 5);
  assert.equal(clickIncrementForRank(21), 3);
});

test("creates exact unique transfer amounts without changing bid credit", () => {
  const atomic = createUniqueTransferAmountAtomic({
    bidCreditUsdt: BigInt(100),
    tokenDecimals: 6,
    orderPublicId: "po_test_order",
  });

  assert.equal(atomic > BigInt(100_000_000), true);
  assert.match(formatAtomicAmount(atomic, 6), /^100\.[0-9]+$/);
});

test("detects likely payment network from transaction hash shape", () => {
  assert.deepEqual(
    networksForTransactionHash("0xc213f2fb294960a8b15a448c6c4fa77beabb2f55b38f8c7f8d77a1b8e9e9e9e9"),
    ["ethereum", "bsc"],
  );
  assert.deepEqual(
    networksForTransactionHash("806856e09b7fcb70939fe8d315f0b89f0338c17f6ab615d3f109364996286ec3"),
    ["tron"],
  );
  assert.deepEqual(
    networksForTransactionHash("5B6HtpmpqsnPrKtP9QQ7vpHSkm4poW88TfVj1DtfnW3w7V9c9m3jijyMkamqsMmjfSaZYv8rsdW6kLP8KSnJ4v42"),
    ["solana"],
  );
});

test("keeps safe numeric payment defaults in production", () => {
  const originalAppEnv = process.env.APP_ENV;
  const originalSolanaDecimals = process.env.USDT_DECIMALS_SOLANA;
  const originalSolanaConfirmations = process.env.SOLANA_MIN_CONFIRMATIONS;
  const originalBscDecimals = process.env.USDT_DECIMALS_BSC;
  const originalBscConfirmations = process.env.BSC_CONFIRMATIONS;

  process.env.APP_ENV = "production";
  delete process.env.USDT_DECIMALS_SOLANA;
  delete process.env.SOLANA_MIN_CONFIRMATIONS;
  delete process.env.USDT_DECIMALS_BSC;
  delete process.env.BSC_CONFIRMATIONS;

  try {
    const solana = getNetworkConfig("solana");
    const bsc = getNetworkConfig("bsc");

    assert.equal(solana.decimals, 6);
    assert.equal(solana.finality.confirmations, 32);
    assert.equal(bsc.decimals, 18);
    assert.equal(bsc.finality.confirmations, 45);
  } finally {
    if (originalAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = originalAppEnv;
    }
    if (originalSolanaDecimals === undefined) {
      delete process.env.USDT_DECIMALS_SOLANA;
    } else {
      process.env.USDT_DECIMALS_SOLANA = originalSolanaDecimals;
    }
    if (originalSolanaConfirmations === undefined) {
      delete process.env.SOLANA_MIN_CONFIRMATIONS;
    } else {
      process.env.SOLANA_MIN_CONFIRMATIONS = originalSolanaConfirmations;
    }
    if (originalBscDecimals === undefined) {
      delete process.env.USDT_DECIMALS_BSC;
    } else {
      process.env.USDT_DECIMALS_BSC = originalBscDecimals;
    }
    if (originalBscConfirmations === undefined) {
      delete process.env.BSC_CONFIRMATIONS;
    } else {
      process.env.BSC_CONFIRMATIONS = originalBscConfirmations;
    }
  }
});

test("normalizes listing URLs and preserves meaningful paths", () => {
  const first = normalizeProjectUrl("https://github.com/user/project-a?utm_source=x#readme");
  const second = normalizeProjectUrl("https://github.com/user/project-b?utm_source=x#readme");
  assert.notEqual(first.canonicalListingKey, second.canonicalListingKey);
  assert.equal(first.url, "https://github.com/user/project-a");
});

test("treats www and non-www homepages as the same listing", () => {
  const withWww = normalizeProjectUrl("https://www.uniswap.org/");
  const withoutWww = normalizeProjectUrl("https://uniswap.org/");

  assert.equal(withWww.canonicalListingKey, "uniswap.org");
  assert.equal(withoutWww.canonicalListingKey, "uniswap.org");
  assert.equal(withoutWww.canonicalListingKeyAlternates.includes("www.uniswap.org"), true);
});

test("blocks obvious SSRF metadata URLs", () => {
  for (const url of ["http://localhost", "http://127.0.0.1", "http://169.254.169.254", "file:///tmp/x"]) {
    assert.throws(() => assertSafeMetadataUrl(url));
  }

  assert.equal(assertSafeMetadataUrl("https://example.com").hostname, "example.com");
});

test("formats validation errors as readable form messages", () => {
  const schema = z.object({
    project: z.object({
      url: z.string().min(4),
      name: z.string().min(2),
      description: z.string().min(10),
    }),
  });

  const result = schema.safeParse({
    project: {
      url: "",
      name: "",
      description: "",
    },
  });

  assert.equal(result.success, false);
  assert.equal(
    errorMessage(result.error),
    "Enter a project URL. Enter a project name. Write a short project description of at least 10 characters.",
  );
});

test("credits a confirmed payment order only once", async () => {
  const project = await devRepository.getProjectBySlug("uniswap");
  assert.ok(project);

  const draft = createPaymentOrderDraft({
    projectId: project.id,
    network: "tron",
    bidCreditUsdt: BigInt(7),
    now: new Date("2026-08-23T00:00:00.000Z"),
  });
  const order = await devRepository.createPaymentOrder(draft);
  const result: VerificationResult = {
    status: "confirmed",
    network: "tron",
    txHash: "abc123confirmed",
    tokenContractOrMint: order.tokenContractOrMint,
    senderAddress: "sender",
    receiverAddress: order.receiverAddress,
    amountAtomic: order.expectedTransferAmountAtomic,
    blockNumberOrSlot: "100",
    confirmations: 27,
    rawReference: "abc123confirmed",
    failureReason: null,
  };

  await devRepository.recordVerification(order.publicId, result, "confirmed");
  const before = (await devRepository.listBidsForProject(project.id)).length;

  for (let index = 0; index < 10; index += 1) {
    await devRepository.creditPaymentOrder(order.publicId);
  }

  const after = (await devRepository.listBidsForProject(project.id)).length;
  assert.equal(after, before + 1);
});

test("provider lookup failures do not lock a waiting payment order to a hash", async () => {
  const project = await devRepository.getProjectBySlug("chainlink");
  assert.ok(project);

  const draft = createPaymentOrderDraft({
    projectId: project.id,
    network: "bsc",
    bidCreditUsdt: BigInt(11),
    now: new Date("2026-08-23T00:10:00.000Z"),
  });
  const order = await devRepository.createPaymentOrder(draft);
  const result: VerificationResult = {
    status: "provider_error",
    network: "bsc",
    txHash: "0xlookupfailed",
    tokenContractOrMint: null,
    senderAddress: null,
    receiverAddress: null,
    amountAtomic: null,
    blockNumberOrSlot: null,
    confirmations: 0,
    rawReference: null,
    failureReason: "RPC returned an empty response.",
  };

  await devRepository.recordVerification(order.publicId, result, "waiting");
  const updated = await devRepository.getPaymentOrder(order.publicId);
  assert.equal(updated?.status, "waiting");
  assert.equal(updated?.txHash, null);

  const ethDraft = createPaymentOrderDraftForPublicId({
    publicId: order.publicId,
    projectId: project.id,
    network: "ethereum",
    bidCreditUsdt: order.bidCreditUsdt,
    now: new Date("2026-08-23T00:12:00.000Z"),
  });
  const switched = await devRepository.updateWaitingPaymentOrderNetwork(order.publicId, ethDraft);
  assert.equal(switched?.network, "ethereum");
});

test("rechecking a confirming payment can credit it after finality", async () => {
  const project = await devRepository.getProjectBySlug("arbitrum");
  assert.ok(project);
  const draft = createPaymentOrderDraft({
    projectId: project.id,
    network: "ethereum",
    bidCreditUsdt: BigInt(12),
    now: new Date("2026-08-23T00:20:00.000Z"),
  });
  const order = await devRepository.createPaymentOrder(draft);

  const unconfirmedVerifier: PaymentVerifier = {
    network: "ethereum",
    async verifyPayment(paymentOrder: PaymentOrderRecord) {
      return {
        status: "unconfirmed",
        network: "ethereum",
        txHash: "0xeventuallyconfirmed",
        tokenContractOrMint: paymentOrder.tokenContractOrMint,
        senderAddress: "0xsender",
        receiverAddress: paymentOrder.receiverAddress,
        amountAtomic: paymentOrder.expectedTransferAmountAtomic,
        blockNumberOrSlot: "0x1",
        confirmations: 39,
        rawReference: "0xeventuallyconfirmed",
        failureReason: "Transaction exists but has not reached the configured finality policy.",
      };
    },
  };

  await processPaymentOrder({
    order,
    repository: devRepository,
    verifier: unconfirmedVerifier,
    txHashHint: "0xeventuallyconfirmed",
  });

  const confirming = await devRepository.getPaymentOrder(order.publicId);
  assert.equal(confirming?.status, "confirming");
  assert.equal(confirming?.confirmations, 39);

  const confirmedVerifier: PaymentVerifier = {
    network: "ethereum",
    async verifyPayment(paymentOrder: PaymentOrderRecord) {
      return {
        status: "confirmed",
        network: "ethereum",
        txHash: "0xeventuallyconfirmed",
        tokenContractOrMint: paymentOrder.tokenContractOrMint,
        senderAddress: "0xsender",
        receiverAddress: paymentOrder.receiverAddress,
        amountAtomic: paymentOrder.expectedTransferAmountAtomic,
        blockNumberOrSlot: "0x1",
        confirmations: 64,
        rawReference: "0xeventuallyconfirmed",
        failureReason: null,
      };
    },
  };

  assert.ok(confirming);
  const result = await processPaymentOrder({
    order: confirming,
    repository: devRepository,
    verifier: confirmedVerifier,
  });
  assert.equal(result.credited, true);

  const credited = await devRepository.getPaymentOrder(order.publicId);
  assert.equal(credited?.status, "credited");
});

test("confirmed payment orders credit without another RPC lookup", async () => {
  const project = await devRepository.getProjectBySlug("solana");
  assert.ok(project);

  const draft = createPaymentOrderDraft({
    projectId: project.id,
    network: "bsc",
    bidCreditUsdt: BigInt(7),
    now: new Date("2026-08-23T00:25:00.000Z"),
  });
  const order = await devRepository.createPaymentOrder(draft);
  await devRepository.recordVerification(
    order.publicId,
    {
      status: "confirmed",
      network: "bsc",
      txHash: "0xconfirmedwithoutsecondlookup",
      tokenContractOrMint: order.tokenContractOrMint,
      senderAddress: "0xsender",
      receiverAddress: order.receiverAddress,
      amountAtomic: order.expectedTransferAmountAtomic,
      blockNumberOrSlot: "0x10",
      confirmations: 45,
      rawReference: "0xconfirmedwithoutsecondlookup",
      failureReason: null,
    },
    "confirmed",
  );

  const confirmed = await devRepository.getPaymentOrder(order.publicId);
  assert.ok(confirmed);

  const result = await processPaymentOrder({
    order: confirmed,
    repository: devRepository,
    verifier: {
      network: "bsc",
      async verifyPayment() {
        throw new Error("RPC should not be called for an already confirmed order.");
      },
    },
  });

  assert.equal(result.credited, true);
  assert.equal((await devRepository.getPaymentOrder(order.publicId))?.status, "credited");
});

test("reuses a waiting payment order for the same project and can refresh its payable amount", async () => {
  const project = await devRepository.createProject({
    canonicalListingKey: "reusable-order.example",
    slug: "reusable-order-example",
    name: "Reusable Order",
    url: "https://reusable-order.example",
    description: "Reusable payment order test project.",
    category: "DeFi",
    logoUrl: null,
    xUrl: null,
  });
  const draft = createPaymentOrderDraft({
    projectId: project.id,
    network: "tron",
    bidCreditUsdt: BigInt(5),
  });
  const order = await devRepository.createPaymentOrder(draft);

  const reusable = await devRepository.findOpenPaymentOrderForProject({
    projectId: project.id,
    statuses: ["waiting", "detected", "confirming", "confirmed"],
  });
  assert.equal(reusable?.publicId, order.publicId);

  const updatedDraft = createPaymentOrderDraftForPublicId({
    publicId: order.publicId,
    projectId: project.id,
    network: "bsc",
    bidCreditUsdt: BigInt(8),
  });
  const updated = await devRepository.updateWaitingPaymentOrderNetwork(
    order.publicId,
    updatedDraft,
  );

  assert.equal(updated?.publicId, order.publicId);
  assert.equal(updated?.network, "bsc");
  assert.equal(updated?.bidCreditUsdt, BigInt(8));
  assert.equal(
    updated?.expectedTransferAmountAtomic,
    updatedDraft.expectedTransferAmountAtomic,
  );
});

test("creates a fresh payment order for each boost attempt", async () => {
  const project = await devRepository.getProjectBySlug("uniswap");
  if (!project) {
    throw new Error("Expected seeded Uniswap project.");
  }
  const boostProject = project;

  async function createBoostOrder() {
    const response = await createPaymentOrder(
      new Request("http://localhost/api/payment-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: boostProject.id,
          network: "tron",
          bidTotalUsdt: (boostProject.totalBidUsdt + BigInt(100)).toString(),
          minimumBidTotalUsdt: (boostProject.totalBidUsdt + BigInt(1)).toString(),
        }),
      }),
    );

    assert.equal(response.status, 201);
    const payload = await response.json() as {
      order?: {
        publicId: string;
        bidCreditUsdt: string;
        expectedTransferAmountDisplay: string;
      };
    };
    assert.ok(payload.order);
    return payload.order;
  }

  const first = await createBoostOrder();
  const second = await createBoostOrder();

  assert.notEqual(second.publicId, first.publicId);
  assert.equal(first.bidCreditUsdt, "100");
  assert.equal(second.bidCreditUsdt, "100");
  assert.notEqual(
    second.expectedTransferAmountDisplay,
    first.expectedTransferAmountDisplay,
  );
});

test("evm verifier can discover a matching recent USDT transfer without a hash", async () => {
  const originalFetch = globalThis.fetch;
  const originalRpc = process.env.BSC_RPC_URL;
  const draft = createPaymentOrderDraft({
    projectId: "proj_bsc_auto",
    network: "bsc",
    bidCreditUsdt: BigInt(5),
  });
  const order: PaymentOrderRecord = {
    id: "pay_bsc_auto",
    publicId: draft.publicId,
    projectId: draft.projectId,
    bidId: null,
    network: draft.network,
    receiverAddress: draft.receiverAddress,
    tokenContractOrMint: draft.tokenContractOrMint,
    bidCreditUsdt: draft.bidCreditUsdt,
    expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
    expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
    expectedSenderAddress: null,
    status: "waiting",
    txHash: null,
    blockNumberOrSlot: null,
    confirmations: 0,
    createdAt: new Date().toISOString(),
    expiresAt: draft.expiresAt,
    detectedAt: null,
    confirmedAt: null,
    creditedAt: null,
    failureReason: null,
  };
  const txHash = "0xbscautodiscovered";
  const transferLog = {
    address: order.tokenContractOrMint,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      evmAddressTopic("0x1111111111111111111111111111111111111111"),
      evmAddressTopic(order.receiverAddress),
    ],
    data: `0x${order.expectedTransferAmountAtomic.toString(16)}`,
    blockNumber: "0x1000",
    transactionHash: txHash,
  };

  process.env.BSC_RPC_URL = "https://bsc-auto.test";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };

    if (body.method === "eth_blockNumber") {
      return Response.json({ jsonrpc: "2.0", id: 1, result: "0x1030" });
    }

    if (body.method === "eth_getLogs") {
      return Response.json({ jsonrpc: "2.0", id: 1, result: [transferLog] });
    }

    if (body.method === "eth_getTransactionReceipt") {
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: {
          transactionHash: txHash,
          status: "0x1",
          blockNumber: "0x1000",
          logs: [transferLog],
        },
      });
    }

    throw new Error(`Unexpected RPC method ${body.method}`);
  }) as typeof fetch;

  try {
    const result = await new EvmUsdtVerifier("bsc").verifyPayment(order);
    assert.equal(result.status, "confirmed");
    assert.equal(result.txHash, txHash);
    assert.equal(result.amountAtomic, order.expectedTransferAmountAtomic);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRpc === undefined) {
      delete process.env.BSC_RPC_URL;
    } else {
      process.env.BSC_RPC_URL = originalRpc;
    }
  }
});

test("tron verifier can discover a matching recent TRC20 transfer without a hash", async () => {
  const originalFetch = globalThis.fetch;
  const originalRpc = process.env.TRON_RPC_URL;
  const draft = createPaymentOrderDraft({
    projectId: "proj_tron_auto",
    network: "tron",
    bidCreditUsdt: BigInt(5),
  });
  const order: PaymentOrderRecord = {
    id: "pay_tron_auto",
    publicId: draft.publicId,
    projectId: draft.projectId,
    bidId: null,
    network: draft.network,
    receiverAddress: draft.receiverAddress,
    tokenContractOrMint: draft.tokenContractOrMint,
    bidCreditUsdt: draft.bidCreditUsdt,
    expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
    expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
    expectedSenderAddress: null,
    status: "waiting",
    txHash: null,
    blockNumberOrSlot: null,
    confirmations: 0,
    createdAt: new Date().toISOString(),
    expiresAt: draft.expiresAt,
    detectedAt: null,
    confirmedAt: null,
    creditedAt: null,
    failureReason: null,
  };
  const txHash = "806856e09b7fcb70939fe8d315f0b89f0338c17f6ab615d3f109364996286ec3";

  process.env.TRON_RPC_URL = "https://api.trongrid.test";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();

    if (init?.method === "GET" && url.includes("/transactions/trc20")) {
      return Response.json({
        data: [
          {
            transaction_id: txHash,
            token_info: { address: order.tokenContractOrMint },
            from: "TSourceAddress1111111111111111111111111",
            to: order.receiverAddress,
            value: order.expectedTransferAmountAtomic.toString(),
          },
        ],
      });
    }

    if (init?.method === "POST" && url.endsWith("/walletsolidity/gettransactioninfobyid")) {
      return Response.json({
        id: txHash,
        blockNumber: 123456,
        receipt: { result: "SUCCESS" },
        log: [
          {
            address: order.tokenContractOrMint,
            topics: [
              "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
              "0000000000000000000000000000000000000000000000000000000000000000",
              "000000000000000000000000e8e541bebe0d02583474c07734a5f60cb9ddd48d",
            ],
            data: order.expectedTransferAmountAtomic.toString(16),
          },
        ],
      });
    }

    throw new Error(`Unexpected TRON request ${url}`);
  }) as typeof fetch;

  try {
    const result = await new TronUsdtVerifier().verifyPayment(order);
    assert.equal(result.status, "confirmed");
    assert.equal(result.txHash, txHash);
    assert.equal(result.amountAtomic, order.expectedTransferAmountAtomic);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRpc === undefined) {
      delete process.env.TRON_RPC_URL;
    } else {
      process.env.TRON_RPC_URL = originalRpc;
    }
  }
});

test("solana verifier matches an SPL destination token account", async () => {
  const originalFetch = globalThis.fetch;
  const originalRpc = process.env.SOLANA_RPC_URL;
  const draft = createPaymentOrderDraft({
    projectId: "proj_solana",
    network: "solana",
    bidCreditUsdt: BigInt(5),
  });
  const order: PaymentOrderRecord = {
    id: "pay_solana",
    publicId: draft.publicId,
    projectId: draft.projectId,
    bidId: null,
    network: draft.network,
    receiverAddress: draft.receiverAddress,
    tokenContractOrMint: draft.tokenContractOrMint,
    bidCreditUsdt: draft.bidCreditUsdt,
    expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
    expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
    expectedSenderAddress: null,
    status: "waiting",
    txHash: null,
    blockNumberOrSlot: null,
    confirmations: 0,
    createdAt: new Date().toISOString(),
    expiresAt: draft.expiresAt,
    detectedAt: null,
    confirmedAt: null,
    creditedAt: null,
    failureReason: null,
  };
  const destinationTokenAccount = "ReceiverAssociatedTokenAccount11111111111111111111";

  process.env.SOLANA_RPC_URL = "https://solana.test";
  globalThis.fetch = (async () => Response.json({
    jsonrpc: "2.0",
    id: 1,
    result: {
      slot: 12345,
      transaction: {
        message: {
          accountKeys: ["payer", destinationTokenAccount],
          instructions: [
            {
              parsed: {
                type: "transferChecked",
                info: {
                  mint: order.tokenContractOrMint,
                  destination: destinationTokenAccount,
                  tokenAmount: {
                    amount: order.expectedTransferAmountAtomic.toString(),
                  },
                },
              },
            },
          ],
        },
      },
      meta: {
        err: null,
        preTokenBalances: [
          {
            accountIndex: 1,
            mint: order.tokenContractOrMint,
            uiTokenAmount: { amount: "0", decimals: 6 },
          },
        ],
        postTokenBalances: [
          {
            accountIndex: 1,
            mint: order.tokenContractOrMint,
            uiTokenAmount: {
              amount: order.expectedTransferAmountAtomic.toString(),
              decimals: 6,
            },
          },
        ],
      },
    },
  })) as typeof fetch;

  try {
    const result = await new SolanaUsdtVerifier().verifyPayment(order, "solana_signature_finalized");
    assert.equal(result.status, "confirmed");
    assert.equal(result.amountAtomic, order.expectedTransferAmountAtomic);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRpc === undefined) {
      delete process.env.SOLANA_RPC_URL;
    } else {
      process.env.SOLANA_RPC_URL = originalRpc;
    }
  }
});

test("solana verifier falls back when the primary RPC rejects requests", async () => {
  const originalFetch = globalThis.fetch;
  const originalRpc = process.env.SOLANA_RPC_URL;
  const originalFallback = process.env.SOLANA_RPC_FALLBACK_URLS;
  const draft = createPaymentOrderDraft({
    projectId: "proj_solana_fallback",
    network: "solana",
    bidCreditUsdt: BigInt(5),
  });
  const order: PaymentOrderRecord = {
    id: "pay_solana_fallback",
    publicId: draft.publicId,
    projectId: draft.projectId,
    bidId: null,
    network: draft.network,
    receiverAddress: draft.receiverAddress,
    tokenContractOrMint: draft.tokenContractOrMint,
    bidCreditUsdt: draft.bidCreditUsdt,
    expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
    expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
    expectedSenderAddress: null,
    status: "waiting",
    txHash: null,
    blockNumberOrSlot: null,
    confirmations: 0,
    createdAt: new Date().toISOString(),
    expiresAt: draft.expiresAt,
    detectedAt: null,
    confirmedAt: null,
    creditedAt: null,
    failureReason: null,
  };
  const primaryUrl = "https://solana-blocked.test";
  const fallbackUrl = "https://solana-fallback.test";
  const receiverTokenAccount = "ReceiverFallbackTokenAccount111111111111111111111";
  const calls: string[] = [];

  process.env.SOLANA_RPC_URL = primaryUrl;
  process.env.SOLANA_RPC_FALLBACK_URLS = fallbackUrl;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    calls.push(url);

    if (url === primaryUrl) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    if (body.method === "getTokenAccountsByOwner") {
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: { value: [{ pubkey: receiverTokenAccount }] },
      });
    }

    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        slot: 12347,
        transaction: {
          message: {
            accountKeys: ["payer", receiverTokenAccount],
            instructions: [
              {
                parsed: {
                  type: "transferChecked",
                  info: {
                    mint: order.tokenContractOrMint,
                    source: "payerTokenAccount",
                    destination: receiverTokenAccount,
                    tokenAmount: {
                      amount: order.expectedTransferAmountAtomic.toString(),
                    },
                  },
                },
              },
            ],
          },
        },
        meta: {
          err: null,
          preTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              uiTokenAmount: { amount: "0", decimals: 6 },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              uiTokenAmount: {
                amount: order.expectedTransferAmountAtomic.toString(),
                decimals: 6,
              },
            },
          ],
        },
      },
    });
  }) as typeof fetch;

  try {
    const result = await new SolanaUsdtVerifier().verifyPayment(
      order,
      "solana_signature_fallback",
    );
    assert.equal(result.status, "confirmed");
    assert.equal(result.amountAtomic, order.expectedTransferAmountAtomic);
    assert.deepEqual(calls, [
      primaryUrl,
      primaryUrl,
      fallbackUrl,
      primaryUrl,
      primaryUrl,
      fallbackUrl,
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRpc === undefined) {
      delete process.env.SOLANA_RPC_URL;
    } else {
      process.env.SOLANA_RPC_URL = originalRpc;
    }
    if (originalFallback === undefined) {
      delete process.env.SOLANA_RPC_FALLBACK_URLS;
    } else {
      process.env.SOLANA_RPC_FALLBACK_URLS = originalFallback;
    }
  }
});

test("solana verifier retries after a transient cached RPC abort", async () => {
  const originalFetch = globalThis.fetch;
  const originalRpc = process.env.SOLANA_RPC_URL;
  const draft = createPaymentOrderDraft({
    projectId: "proj_solana_retry",
    network: "solana",
    bidCreditUsdt: BigInt(5),
  });
  const order: PaymentOrderRecord = {
    id: "pay_solana_retry",
    publicId: draft.publicId,
    projectId: draft.projectId,
    bidId: null,
    network: draft.network,
    receiverAddress: draft.receiverAddress,
    tokenContractOrMint: draft.tokenContractOrMint,
    bidCreditUsdt: draft.bidCreditUsdt,
    expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
    expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
    expectedSenderAddress: null,
    status: "waiting",
    txHash: null,
    blockNumberOrSlot: null,
    confirmations: 0,
    createdAt: new Date().toISOString(),
    expiresAt: draft.expiresAt,
    detectedAt: null,
    confirmedAt: null,
    creditedAt: null,
    failureReason: null,
  };
  const receiverTokenAccount = "ReceiverRetryTokenAccount11111111111111111111111";
  let failRpc = true;
  let calls = 0;

  process.env.SOLANA_RPC_URL = "https://solana-retry.test";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    if (failRpc) {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    if (body.method === "getTokenAccountsByOwner") {
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: { value: [{ pubkey: receiverTokenAccount }] },
      });
    }

    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        slot: 12348,
        transaction: {
          message: {
            accountKeys: ["payer", receiverTokenAccount],
            instructions: [
              {
                parsed: {
                  type: "transferChecked",
                  info: {
                    mint: order.tokenContractOrMint,
                    source: "payerTokenAccount",
                    destination: receiverTokenAccount,
                    tokenAmount: {
                      amount: order.expectedTransferAmountAtomic.toString(),
                    },
                  },
                },
              },
            ],
          },
        },
        meta: {
          err: null,
          preTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              uiTokenAmount: { amount: "0", decimals: 6 },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              uiTokenAmount: {
                amount: order.expectedTransferAmountAtomic.toString(),
                decimals: 6,
              },
            },
          ],
        },
      },
    });
  }) as typeof fetch;

  try {
    const verifier = new SolanaUsdtVerifier();
    const first = await verifier.verifyPayment(order, "solana_signature_retry");
    assert.equal(first.status, "provider_error");
    assert.match(first.failureReason ?? "", /RPC getTransaction timed out/);

    failRpc = false;
    const second = await verifier.verifyPayment(order, "solana_signature_retry");
    assert.equal(second.status, "confirmed");
    assert.equal(second.amountAtomic, order.expectedTransferAmountAtomic);
    assert.ok(calls > 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRpc === undefined) {
      delete process.env.SOLANA_RPC_URL;
    } else {
      process.env.SOLANA_RPC_URL = originalRpc;
    }
  }
});

test("solana verifier can discover a matching recent receiver transfer without a hash", async () => {
  const originalFetch = globalThis.fetch;
  const originalRpc = process.env.SOLANA_RPC_URL;
  const originalLookback = process.env.SOLANA_SIGNATURE_LOOKBACK;
  const draft = createPaymentOrderDraft({
    projectId: "proj_solana_indexed",
    network: "solana",
    bidCreditUsdt: BigInt(5),
  });
  const order: PaymentOrderRecord = {
    id: "pay_solana_indexed",
    publicId: draft.publicId,
    projectId: draft.projectId,
    bidId: null,
    network: draft.network,
    receiverAddress: draft.receiverAddress,
    tokenContractOrMint: draft.tokenContractOrMint,
    bidCreditUsdt: draft.bidCreditUsdt,
    expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
    expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
    expectedSenderAddress: null,
    status: "waiting",
    txHash: null,
    blockNumberOrSlot: null,
    confirmations: 0,
    createdAt: new Date().toISOString(),
    expiresAt: draft.expiresAt,
    detectedAt: null,
    confirmedAt: null,
    creditedAt: null,
    failureReason: null,
  };
  const receiverTokenAccount = "ReceiverIndexedTokenAccount111111111111111111111";
  const matchingSignature = "solana_signature_indexed";

  process.env.SOLANA_RPC_URL = "https://solana-indexed.test";
  process.env.SOLANA_SIGNATURE_LOOKBACK = "5";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };

    if (body.method === "getTokenAccountsByOwner") {
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: { value: [{ pubkey: receiverTokenAccount }] },
      });
    }

    if (body.method === "getSignaturesForAddress") {
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: [{ signature: matchingSignature, err: null }],
      });
    }

    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        slot: 12349,
        transaction: {
          message: {
            accountKeys: ["payer", receiverTokenAccount],
            instructions: [
              {
                parsed: {
                  type: "transferChecked",
                  info: {
                    mint: order.tokenContractOrMint,
                    source: "payerTokenAccount",
                    destination: receiverTokenAccount,
                    tokenAmount: {
                      amount: order.expectedTransferAmountAtomic.toString(),
                    },
                  },
                },
              },
            ],
          },
        },
        meta: {
          err: null,
          preTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              uiTokenAmount: { amount: "0", decimals: 6 },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              uiTokenAmount: {
                amount: order.expectedTransferAmountAtomic.toString(),
                decimals: 6,
              },
            },
          ],
        },
      },
    });
  }) as typeof fetch;

  try {
    const result = await new SolanaUsdtVerifier().verifyPayment(order);
    assert.equal(result.status, "confirmed");
    assert.equal(result.txHash, matchingSignature);
    assert.equal(result.amountAtomic, order.expectedTransferAmountAtomic);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRpc === undefined) {
      delete process.env.SOLANA_RPC_URL;
    } else {
      process.env.SOLANA_RPC_URL = originalRpc;
    }
    if (originalLookback === undefined) {
      delete process.env.SOLANA_SIGNATURE_LOOKBACK;
    } else {
      process.env.SOLANA_SIGNATURE_LOOKBACK = originalLookback;
    }
  }
});

test("solana verifier refreshes receiver signatures after an empty automatic scan", async () => {
  const originalFetch = globalThis.fetch;
  const originalRpc = process.env.SOLANA_RPC_URL;
  const draft = createPaymentOrderDraft({
    projectId: "proj_solana_uncached_signatures",
    network: "solana",
    bidCreditUsdt: BigInt(5),
  });
  const order: PaymentOrderRecord = {
    id: "pay_solana_uncached_signatures",
    publicId: draft.publicId,
    projectId: draft.projectId,
    bidId: null,
    network: draft.network,
    receiverAddress: draft.receiverAddress,
    tokenContractOrMint: draft.tokenContractOrMint,
    bidCreditUsdt: draft.bidCreditUsdt,
    expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
    expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
    expectedSenderAddress: null,
    status: "waiting",
    txHash: null,
    blockNumberOrSlot: null,
    confirmations: 0,
    createdAt: new Date().toISOString(),
    expiresAt: draft.expiresAt,
    detectedAt: null,
    confirmedAt: null,
    creditedAt: null,
    failureReason: null,
  };
  const receiverTokenAccount = "ReceiverUncachedTokenAccount111111111111111111";
  const matchingSignature = "solana_signature_after_empty_scan";
  let signatureLookups = 0;

  process.env.SOLANA_RPC_URL = "https://solana-uncached-signatures.test";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };

    if (body.method === "getTokenAccountsByOwner") {
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: { value: [{ pubkey: receiverTokenAccount }] },
      });
    }

    if (body.method === "getSignaturesForAddress") {
      signatureLookups += 1;
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: signatureLookups <= 3
          ? []
          : [{ signature: matchingSignature, err: null }],
      });
    }

    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        slot: 12351,
        transaction: {
          message: {
            accountKeys: ["payer", receiverTokenAccount],
            instructions: [
              {
                parsed: {
                  type: "transferChecked",
                  info: {
                    mint: order.tokenContractOrMint,
                    source: "payerTokenAccount",
                    destination: receiverTokenAccount,
                    tokenAmount: {
                      amount: order.expectedTransferAmountAtomic.toString(),
                    },
                  },
                },
              },
            ],
          },
        },
        meta: {
          err: null,
          preTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              uiTokenAmount: { amount: "0", decimals: 6 },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              uiTokenAmount: {
                amount: order.expectedTransferAmountAtomic.toString(),
                decimals: 6,
              },
            },
          ],
        },
      },
    });
  }) as typeof fetch;

  try {
    const verifier = new SolanaUsdtVerifier();
    const first = await verifier.verifyPayment(order);
    assert.equal(first.status, "not_found");

    const second = await verifier.verifyPayment(order);
    assert.equal(second.status, "confirmed");
    assert.equal(second.txHash, matchingSignature);
    assert.equal(second.amountAtomic, order.expectedTransferAmountAtomic);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRpc === undefined) {
      delete process.env.SOLANA_RPC_URL;
    } else {
      process.env.SOLANA_RPC_URL = originalRpc;
    }
  }
});

test("solana verifier can discover a matching transfer from a configured token account", async () => {
  const originalFetch = globalThis.fetch;
  const originalRpc = process.env.SOLANA_RPC_URL;
  const originalTokenAccount = process.env.USDT_RECEIVER_TOKEN_ACCOUNT_SOLANA;
  const draft = createPaymentOrderDraft({
    projectId: "proj_solana_configured_account",
    network: "solana",
    bidCreditUsdt: BigInt(5),
  });
  const order: PaymentOrderRecord = {
    id: "pay_solana_configured_account",
    publicId: draft.publicId,
    projectId: draft.projectId,
    bidId: null,
    network: draft.network,
    receiverAddress: draft.receiverAddress,
    tokenContractOrMint: draft.tokenContractOrMint,
    bidCreditUsdt: draft.bidCreditUsdt,
    expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
    expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
    expectedSenderAddress: null,
    status: "waiting",
    txHash: null,
    blockNumberOrSlot: null,
    confirmations: 0,
    createdAt: new Date().toISOString(),
    expiresAt: draft.expiresAt,
    detectedAt: null,
    confirmedAt: null,
    creditedAt: null,
    failureReason: null,
  };
  const configuredTokenAccount = "ConfiguredSolanaTokenAccount111111111111111111";
  const matchingSignature = "solana_signature_configured_account";
  const signatureLookups: string[] = [];

  process.env.SOLANA_RPC_URL = "https://solana-configured-account.test";
  process.env.USDT_RECEIVER_TOKEN_ACCOUNT_SOLANA = configuredTokenAccount;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      method?: string;
      params?: unknown[];
    };

    if (body.method === "getTokenAccountsByOwner") {
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: { value: [] },
      });
    }

    if (body.method === "getSignaturesForAddress") {
      signatureLookups.push(String(body.params?.[0] ?? ""));
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: body.params?.[0] === configuredTokenAccount
          ? [{ signature: matchingSignature, err: null }]
          : [],
      });
    }

    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        slot: 12350,
        transaction: {
          message: {
            accountKeys: ["payer", configuredTokenAccount],
            instructions: [
              {
                parsed: {
                  type: "transferChecked",
                  info: {
                    mint: order.tokenContractOrMint,
                    source: "payerTokenAccount",
                    destination: configuredTokenAccount,
                    tokenAmount: {
                      amount: order.expectedTransferAmountAtomic.toString(),
                    },
                  },
                },
              },
            ],
          },
        },
        meta: {
          err: null,
          preTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              uiTokenAmount: { amount: "0", decimals: 6 },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              uiTokenAmount: {
                amount: order.expectedTransferAmountAtomic.toString(),
                decimals: 6,
              },
            },
          ],
        },
      },
    });
  }) as typeof fetch;

  try {
    const result = await new SolanaUsdtVerifier().verifyPayment(order);
    assert.equal(result.status, "confirmed");
    assert.equal(result.txHash, matchingSignature);
    assert.equal(result.amountAtomic, order.expectedTransferAmountAtomic);
    assert.ok(signatureLookups.includes(configuredTokenAccount));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRpc === undefined) {
      delete process.env.SOLANA_RPC_URL;
    } else {
      process.env.SOLANA_RPC_URL = originalRpc;
    }
    if (originalTokenAccount === undefined) {
      delete process.env.USDT_RECEIVER_TOKEN_ACCOUNT_SOLANA;
    } else {
      process.env.USDT_RECEIVER_TOKEN_ACCOUNT_SOLANA = originalTokenAccount;
    }
  }
});

test("solana verifier reports confirmed transactions as waiting for finality", async () => {
  const originalFetch = globalThis.fetch;
  const originalRpc = process.env.SOLANA_RPC_URL;
  const draft = createPaymentOrderDraft({
    projectId: "proj_solana_confirmed",
    network: "solana",
    bidCreditUsdt: BigInt(5),
  });
  const order: PaymentOrderRecord = {
    id: "pay_solana_confirmed",
    publicId: draft.publicId,
    projectId: draft.projectId,
    bidId: null,
    network: draft.network,
    receiverAddress: draft.receiverAddress,
    tokenContractOrMint: draft.tokenContractOrMint,
    bidCreditUsdt: draft.bidCreditUsdt,
    expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
    expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
    expectedSenderAddress: null,
    status: "waiting",
    txHash: null,
    blockNumberOrSlot: null,
    confirmations: 0,
    createdAt: new Date().toISOString(),
    expiresAt: draft.expiresAt,
    detectedAt: null,
    confirmedAt: null,
    creditedAt: null,
    failureReason: null,
  };
  const commitments: string[] = [];

  process.env.SOLANA_RPC_URL = "https://solana.test";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      params?: Array<{ commitment?: string } | string>;
    };
    const commitment = typeof body.params?.[1] === "object" ? body.params[1].commitment : null;
    if (commitment) {
      commitments.push(commitment);
    }

    if (commitment === "finalized") {
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: null,
      });
    }

    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        slot: 12346,
        transaction: {
          message: {
            accountKeys: ["payer", "receiverTokenAccount"],
            instructions: [
              {
                parsed: {
                  type: "transferChecked",
                  info: {
                    mint: order.tokenContractOrMint,
                    source: "payerTokenAccount",
                    destination: "receiverTokenAccount",
                    tokenAmount: {
                      amount: order.expectedTransferAmountAtomic.toString(),
                    },
                  },
                },
              },
            ],
          },
        },
        meta: {
          err: null,
          preTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              owner: order.receiverAddress,
              uiTokenAmount: { amount: "0", decimals: 6 },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 1,
              mint: order.tokenContractOrMint,
              owner: order.receiverAddress,
              uiTokenAmount: {
                amount: order.expectedTransferAmountAtomic.toString(),
                decimals: 6,
              },
            },
          ],
        },
      },
    });
  }) as typeof fetch;

  try {
    const result = await new SolanaUsdtVerifier().verifyPayment(order, "solana_signature_confirmed");
    assert.equal(result.status, "unconfirmed");
    assert.equal(result.senderAddress, "payerTokenAccount");
    assert.deepEqual(commitments, ["finalized", "confirmed"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRpc === undefined) {
      delete process.env.SOLANA_RPC_URL;
    } else {
      process.env.SOLANA_RPC_URL = originalRpc;
    }
  }
});

test("manual transaction check does not credit an unrelated confirmed order", async () => {
  const project = await devRepository.getProjectBySlug("dogecoin");
  assert.ok(project);

  const draft = createPaymentOrderDraft({
    projectId: project.id,
    network: "bsc",
    bidCreditUsdt: BigInt(6),
  });
  const order = await devRepository.createPaymentOrder(draft);
  await devRepository.recordVerification(
    order.publicId,
    {
      status: "confirmed",
      network: "bsc",
      txHash: "0xknownpayment",
      tokenContractOrMint: order.tokenContractOrMint,
      senderAddress: "0xsender",
      receiverAddress: order.receiverAddress,
      amountAtomic: order.expectedTransferAmountAtomic,
      blockNumberOrSlot: "0x1",
      confirmations: 45,
      rawReference: "0xknownpayment",
      failureReason: null,
    },
    "confirmed",
  );

  const outcome = await attachManualCheckToOrder({
    order: (await devRepository.getPaymentOrder(order.publicId)) ?? order,
    repository: devRepository,
    txHash: "0xdifferentpayment",
  });

  assert.equal(outcome, null);
  assert.equal((await devRepository.getPaymentOrder(order.publicId))?.status, "confirmed");
});

test("maps underpaid and overpaid verifier results without crediting", async () => {
  const project = await devRepository.getProjectBySlug("bittensor");
  assert.ok(project);
  const draft = createPaymentOrderDraft({
    projectId: project.id,
    network: "ethereum",
    bidCreditUsdt: BigInt(8),
    now: new Date("2026-08-23T00:00:00.000Z"),
  });
  const order = await devRepository.createPaymentOrder(draft);

  const verifier: PaymentVerifier = {
    network: "ethereum",
    async verifyPayment(paymentOrder: PaymentOrderRecord) {
      return {
        status: "wrong_amount",
        network: "ethereum",
        txHash: "0xunderpaid",
        tokenContractOrMint: paymentOrder.tokenContractOrMint,
        senderAddress: "0xsender",
        receiverAddress: paymentOrder.receiverAddress,
        amountAtomic: paymentOrder.expectedTransferAmountAtomic - BigInt(1),
        blockNumberOrSlot: "0x1",
        confirmations: 64,
        rawReference: "0xunderpaid",
        failureReason: "underpaid",
      };
    },
  };

  await processPaymentOrder({ order, repository: devRepository, verifier });
  const updated = await devRepository.getPaymentOrder(order.publicId);
  assert.equal(updated?.status, "underpaid");

  const overpaidDraft = createPaymentOrderDraft({
    projectId: project.id,
    network: "ethereum",
    bidCreditUsdt: BigInt(9),
    now: new Date("2026-08-23T00:05:00.000Z"),
  });
  const overpaidOrder = await devRepository.createPaymentOrder(overpaidDraft);
  const overpaidVerifier: PaymentVerifier = {
    network: "ethereum",
    async verifyPayment(paymentOrder: PaymentOrderRecord) {
      return {
        status: "wrong_amount",
        network: "ethereum",
        txHash: "0xoverpaid",
        tokenContractOrMint: paymentOrder.tokenContractOrMint,
        senderAddress: "0xsender",
        receiverAddress: paymentOrder.receiverAddress,
        amountAtomic: paymentOrder.expectedTransferAmountAtomic + BigInt(1),
        blockNumberOrSlot: "0x2",
        confirmations: 64,
        rawReference: "0xoverpaid",
        failureReason: "overpaid",
      };
    },
  };

  await processPaymentOrder({
    order: overpaidOrder,
    repository: devRepository,
    verifier: overpaidVerifier,
  });
  const overpaidUpdated = await devRepository.getPaymentOrder(overpaidOrder.publicId);
  assert.equal(overpaidUpdated?.status, "overpaid");
});
