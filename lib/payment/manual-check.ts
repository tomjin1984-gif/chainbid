import {
  getNetworkConfigs,
  isNetworkAvailableForCheckout,
} from "@/lib/config/networks";
import type {
  PaymentOrderRecord,
  PaymentOrderStatus,
  SupportedNetwork,
} from "@/lib/domain/types";
import type { Repository } from "@/lib/repository/types";
import { createPaymentOrderDraftForPublicId } from "./orders";
import { networksForTransactionHash } from "./network-detection";
import type { PaymentOrderDraft, PaymentVerifier, VerificationResult } from "./types";
import { createPaymentVerifier } from "./verifiers";
import { processPaymentOrder, statusFromVerification } from "./worker";

export const MANUAL_CHECK_OPEN_STATUSES: PaymentOrderStatus[] = [
  "waiting",
  "detected",
  "confirming",
  "confirmed",
  "failed",
  "underpaid",
  "overpaid",
  "manual_review",
  "expired",
];

interface ManualCheckCandidate {
  order: PaymentOrderRecord;
  result: VerificationResult;
  draft: PaymentOrderDraft | null;
}

export interface ManualCheckProbe {
  order: PaymentOrderRecord;
  network: SupportedNetwork;
  result: VerificationResult;
}

export interface ManualCheckOutcome {
  order: PaymentOrderRecord;
  result: VerificationResult | null;
  credited: boolean;
  networkChanged: boolean;
}

function isRetryableMiss(result: VerificationResult) {
  return result.status === "not_found" || result.status === "provider_error";
}

function isMatchingPayment(result: VerificationResult) {
  return (
    result.status === "confirmed" ||
    result.status === "unconfirmed" ||
    result.status === "manual_review"
  );
}

function availableNetworks(currentNetwork: SupportedNetwork, txHash: string) {
  const compatibleNetworks = new Set(networksForTransactionHash(txHash));
  const networks = [
    currentNetwork,
    ...getNetworkConfigs()
      .filter(isNetworkAvailableForCheckout)
      .map((network) => network.network)
      .filter((network) => network !== currentNetwork),
  ];

  return networks.filter((network) => compatibleNetworks.has(network));
}

function candidateForNetwork(order: PaymentOrderRecord, network: SupportedNetwork) {
  if (network === order.network) {
    return { order, draft: null };
  }

  const draft = createPaymentOrderDraftForPublicId({
    publicId: order.publicId,
    projectId: order.projectId,
    network,
    bidCreditUsdt: order.bidCreditUsdt,
    expectedSenderAddress: order.expectedSenderAddress,
  });

  return {
    draft,
    order: {
      ...order,
      network,
      receiverAddress: draft.receiverAddress,
      tokenContractOrMint: draft.tokenContractOrMint,
      expectedTransferAmountAtomic: draft.expectedTransferAmountAtomic,
      expectedTransferAmountDisplay: draft.expectedTransferAmountDisplay,
      expiresAt: order.expiresAt,
    },
  };
}

export async function findMatchingManualCheckCandidate(args: {
  order: PaymentOrderRecord;
  txHash: string;
  verifiers?: Partial<Record<SupportedNetwork, PaymentVerifier>>;
  onResult?: (probe: ManualCheckProbe) => void;
}): Promise<ManualCheckCandidate | null> {
  for (const network of availableNetworks(args.order.network, args.txHash)) {
    const candidate = candidateForNetwork(args.order, network);
    const verifier = args.verifiers?.[network] ?? createPaymentVerifier(network);
    const result = await verifier.verifyPayment(candidate.order, args.txHash);
    args.onResult?.({ order: candidate.order, network, result });

    if (isMatchingPayment(result)) {
      return { ...candidate, result };
    }

    if (!isRetryableMiss(result) && network === args.order.network && args.order.txHash === args.txHash) {
      return { ...candidate, result };
    }
  }

  return null;
}

export async function attachManualCheckToOrder(args: {
  order: PaymentOrderRecord;
  repository: Repository;
  txHash: string;
  verifiers?: Partial<Record<SupportedNetwork, PaymentVerifier>>;
  onResult?: (probe: ManualCheckProbe) => void;
}): Promise<ManualCheckOutcome | null> {
  if (args.order.status === "confirmed") {
    if (args.order.txHash !== args.txHash) {
      return null;
    }

    const credited = await args.repository.creditPaymentOrder(args.order.publicId);
    return {
      order: credited.order ?? args.order,
      result: null,
      credited: credited.credited,
      networkChanged: false,
    };
  }

  const candidate = await findMatchingManualCheckCandidate({
    order: args.order,
    txHash: args.txHash,
    verifiers: args.verifiers,
    onResult: args.onResult,
  });

  if (!candidate) {
    return null;
  }

  let activeOrder = args.order;
  let networkChanged = false;
  if (candidate.draft) {
    const updated = await args.repository.updateWaitingPaymentOrderNetwork(
      args.order.publicId,
      candidate.draft,
    );
    if (!updated) {
      return null;
    }

    activeOrder = updated;
    networkChanged = true;
  }

  const nextStatus = statusFromVerification(activeOrder, candidate.result);
  await args.repository.recordVerification(activeOrder.publicId, candidate.result, nextStatus);

  if (nextStatus === "confirmed") {
    const credited = await args.repository.creditPaymentOrder(activeOrder.publicId);
    return {
      order: credited.order ?? ((await args.repository.getPaymentOrder(activeOrder.publicId)) ?? activeOrder),
      result: candidate.result,
      credited: credited.credited,
      networkChanged,
    };
  }

  return {
    order: (await args.repository.getPaymentOrder(activeOrder.publicId)) ?? activeOrder,
    result: candidate.result,
    credited: false,
    networkChanged,
  };
}

export async function refreshKnownManualCheckOrder(args: {
  order: PaymentOrderRecord;
  repository: Repository;
}): Promise<ManualCheckOutcome> {
  if (args.order.status === "confirmed") {
    const credited = await args.repository.creditPaymentOrder(args.order.publicId);
    return {
      order: credited.order ?? args.order,
      result: null,
      credited: credited.credited,
      networkChanged: false,
    };
  }

  if (
    args.order.txHash &&
    (args.order.status === "detected" || args.order.status === "confirming")
  ) {
    const result = await processPaymentOrder({
      order: args.order,
      repository: args.repository,
    });
    return {
      order: (await args.repository.getPaymentOrder(args.order.publicId)) ?? args.order,
      result: result.result ?? null,
      credited: result.credited,
      networkChanged: false,
    };
  }

  return {
    order: args.order,
    result: null,
    credited: false,
    networkChanged: false,
  };
}
