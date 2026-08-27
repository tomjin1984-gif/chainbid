import { supportedNetworks } from "@/lib/config/networks";
import type { SupportedNetwork } from "@/lib/domain/types";

const solanaBase58Pattern = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/;

export function networksForTransactionHash(txHash: string): SupportedNetwork[] {
  const value = txHash.trim();

  if (/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return ["ethereum", "bsc"];
  }

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return ["tron"];
  }

  if (solanaBase58Pattern.test(value)) {
    return ["solana"];
  }

  return supportedNetworks;
}

