import { getNetworkConfig, assertNetworkReadyForCheckout } from "@/lib/config/networks";
import { readEnv } from "@/lib/config/env";
import {
  createUniqueTransferAmountAtomic,
  formatAtomicAmount,
} from "@/lib/domain/money";
import type { SupportedNetwork } from "@/lib/domain/types";
import type { PaymentOrderDraft } from "./types";

function createPublicId() {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `po_${uuid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 28)}`;
}

export function getPaymentExpiryMinutes() {
  const raw = Number(readEnv("PAYMENT_ORDER_EXPIRY_MINUTES", "30"));
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

export function createPaymentOrderDraft(args: {
  projectId: string;
  network: SupportedNetwork;
  bidCreditUsdt: bigint;
  expectedSenderAddress?: string | null;
  now?: Date;
}): PaymentOrderDraft {
  const publicId = createPublicId();
  return createPaymentOrderDraftForPublicId({
    ...args,
    publicId,
  });
}

export function createPaymentOrderDraftForPublicId(args: {
  publicId: string;
  projectId: string;
  network: SupportedNetwork;
  bidCreditUsdt: bigint;
  expectedSenderAddress?: string | null;
  now?: Date;
}): PaymentOrderDraft {
  const config = getNetworkConfig(args.network);
  assertNetworkReadyForCheckout(config);

  const expectedTransferAmountAtomic = createUniqueTransferAmountAtomic({
    bidCreditUsdt: args.bidCreditUsdt,
    tokenDecimals: config.decimals,
    orderPublicId: args.publicId,
  });

  const now = args.now ?? new Date();
  const expiresAt = new Date(
    now.getTime() + getPaymentExpiryMinutes() * 60 * 1000,
  ).toISOString();

  return {
    publicId: args.publicId,
    projectId: args.projectId,
    network: args.network,
    receiverAddress: config.receiverAddress,
    tokenContractOrMint: config.usdtContractOrMint,
    bidCreditUsdt: args.bidCreditUsdt,
    expectedTransferAmountAtomic,
    expectedTransferAmountDisplay: `${formatAtomicAmount(expectedTransferAmountAtomic, config.decimals)} USDT`,
    expectedSenderAddress: args.expectedSenderAddress?.trim() || null,
    expiresAt,
  };
}
