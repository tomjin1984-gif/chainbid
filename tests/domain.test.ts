import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { parseWholeUsdt, createUniqueTransferAmountAtomic, formatAtomicAmount } from "../lib/domain/money";
import { claimTopBid, sortProjectsForLeaderboard, targetToPassRank } from "../lib/domain/ranking";
import { normalizeProjectUrl } from "../lib/domain/url";
import { errorMessage } from "../lib/http";
import { assertSafeMetadataUrl } from "../lib/security/ssrf";
import { createPaymentOrderDraft, createPaymentOrderDraftForPublicId } from "../lib/payment/orders";
import { processPaymentOrder } from "../lib/payment/worker";
import { devRepository } from "../lib/repository/dev-store";
import type { PaymentVerifier, VerificationResult } from "../lib/payment/types";
import type { PaymentOrderRecord } from "../lib/domain/types";

test("validates whole-USDT bid limits", () => {
  assert.equal(parseWholeUsdt("5"), BigInt(5));
  assert.equal(parseWholeUsdt("999999"), BigInt(999999));

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

test("creates exact unique transfer amounts without changing bid credit", () => {
  const atomic = createUniqueTransferAmountAtomic({
    bidCreditUsdt: BigInt(100),
    tokenDecimals: 6,
    orderPublicId: "po_test_order",
  });

  assert.equal(atomic > BigInt(100_000_000), true);
  assert.match(formatAtomicAmount(atomic, 6), /^100\.[0-9]+$/);
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
