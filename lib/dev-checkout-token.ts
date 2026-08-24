import { isProduction } from "./config/env";
import type { SupportedNetwork } from "./domain/types";

export interface DevelopmentCheckoutPayload {
  order: {
    publicId: string;
    network?: SupportedNetwork;
    status: string;
    receiverAddress: string;
    expectedTransferAmountDisplay: string;
    bidCreditUsdt: string;
    expiresAt: string;
    txHash: string | null;
    confirmations: number;
  };
  project: { name: string } | null;
  paymentPayload: string;
  network: {
    label: string;
    tokenStandard: string;
    warning: string;
  };
}

export function encodeDevelopmentCheckout(payload: DevelopmentCheckoutPayload) {
  if (isProduction()) {
    return null;
  }

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeDevelopmentCheckout(token: string | undefined) {
  if (isProduction() || !token) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as DevelopmentCheckoutPayload;
  } catch {
    return null;
  }
}
