import { getNetworkConfig } from "@/lib/config/networks";
import type { PaymentOrderRecord } from "@/lib/domain/types";

export function buildPaymentPayload(order: PaymentOrderRecord): string {
  const config = getNetworkConfig(order.network);

  if (order.network === "ethereum" || order.network === "bsc") {
    return `ethereum:${order.tokenContractOrMint}@${config.chainId}/transfer?address=${order.receiverAddress}&uint256=${order.expectedTransferAmountAtomic.toString()}`;
  }

  if (order.network === "solana") {
    return `solana:${order.receiverAddress}`;
  }

  return order.receiverAddress;
}

export function warningForNetwork(networkLabel: string) {
  return `Send USDT only on ${networkLabel}. Sending another token or using the wrong network may result in permanent loss of funds.`;
}
