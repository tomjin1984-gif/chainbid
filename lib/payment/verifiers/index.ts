import type { SupportedNetwork } from "@/lib/domain/types";
import type { PaymentVerifier } from "../types";
import { EvmUsdtVerifier } from "./evm";
import { SolanaUsdtVerifier } from "./solana";
import { TronUsdtVerifier } from "./tron";

export function createPaymentVerifier(network: SupportedNetwork): PaymentVerifier {
  if (network === "ethereum" || network === "bsc") {
    return new EvmUsdtVerifier(network);
  }

  if (network === "tron") {
    return new TronUsdtVerifier();
  }

  return new SolanaUsdtVerifier();
}
