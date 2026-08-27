import { getNetworkConfig } from "@/lib/config/networks";
import type { PaymentOrderRecord, SupportedNetwork } from "@/lib/domain/types";
import { requestJsonRpc } from "../rpc";
import type { PaymentVerifier } from "../types";
import { ensureTxHint, verificationResult } from "./base";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const FALLBACK_RPC_URLS: Partial<Record<Extract<SupportedNetwork, "ethereum" | "bsc">, string[]>> = {
  ethereum: ["https://ethereum-rpc.publicnode.com"],
  bsc: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"],
};

interface EvmLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber?: string;
  transactionHash?: string;
}

interface EvmReceipt {
  transactionHash: string;
  status: string;
  blockNumber: string;
  logs: EvmLog[];
}

function normalizeHex(value: string) {
  return value.toLowerCase();
}

function addressTopic(address: string) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function amountFromLogData(data: string) {
  return BigInt(data || "0x0");
}

function rpcOptions(network: Extract<SupportedNetwork, "ethereum" | "bsc">, primaryUrl: string) {
  return {
    timeoutMs: 4_000,
    retries: 0,
    fallbackUrls: (FALLBACK_RPC_URLS[network] ?? []).filter((url) => url !== primaryUrl),
  };
}

function providerFailureReason(error: unknown, label: string) {
  const message = error instanceof Error ? error.message : "EVM verification failed.";
  if (message.includes("empty response") || message.includes("unreadable JSON")) {
    return `${label} RPC did not return usable data. Please wait a few seconds and check again.`;
  }

  return message;
}

export class EvmUsdtVerifier implements PaymentVerifier {
  readonly network: Extract<SupportedNetwork, "ethereum" | "bsc">;

  constructor(network: Extract<SupportedNetwork, "ethereum" | "bsc">) {
    this.network = network;
  }

  async verifyPayment(order: PaymentOrderRecord, txHashHint?: string) {
    const config = getNetworkConfig(this.network);
    const txHash = ensureTxHint(order, txHashHint);
    if (!txHash) {
      return verificationResult({
        status: "not_found",
        network: this.network,
        failureReason: "No transaction hash hint or indexer candidate was available.",
      });
    }

    if (!config.rpcUrl) {
      return verificationResult({
        status: "provider_error",
        network: this.network,
        txHash,
        failureReason: `${config.rpcEnv} is not configured.`,
      });
    }

    try {
      const receipt = await requestJsonRpc<EvmReceipt | null>(
        config.rpcUrl,
        "eth_getTransactionReceipt",
        [txHash],
        rpcOptions(this.network, config.rpcUrl),
      );

      if (!receipt) {
        return verificationResult({
          status: "not_found",
          network: this.network,
          txHash,
          failureReason: "Transaction receipt was not found.",
        });
      }

      if (receipt.status !== "0x1") {
        return verificationResult({
          status: "failed_transaction",
          network: this.network,
          txHash,
          blockNumberOrSlot: receipt.blockNumber,
          rawReference: receipt.transactionHash,
          failureReason: "Transaction receipt status is failed.",
        });
      }

      const receiverTopic = addressTopic(order.receiverAddress);
      const transfer = receipt.logs.find((log) => {
        return (
          normalizeHex(log.address) === normalizeHex(order.tokenContractOrMint) &&
          normalizeHex(log.topics[0] ?? "") === TRANSFER_TOPIC &&
          normalizeHex(log.topics[2] ?? "") === normalizeHex(receiverTopic)
        );
      });

      if (!transfer) {
        return verificationResult({
          status: "wrong_receiver",
          network: this.network,
          txHash,
          tokenContractOrMint: order.tokenContractOrMint,
          receiverAddress: order.receiverAddress,
          blockNumberOrSlot: receipt.blockNumber,
          rawReference: receipt.transactionHash,
          failureReason: "No USDT Transfer log to the expected receiver was found.",
        });
      }

      const sender = `0x${(transfer.topics[1] ?? "").slice(-40)}`;
      if (
        order.expectedSenderAddress &&
        normalizeHex(order.expectedSenderAddress) !== normalizeHex(sender)
      ) {
        return verificationResult({
          status: "wrong_sender",
          network: this.network,
          txHash,
          tokenContractOrMint: order.tokenContractOrMint,
          senderAddress: sender,
          receiverAddress: order.receiverAddress,
          amountAtomic: amountFromLogData(transfer.data),
          blockNumberOrSlot: receipt.blockNumber,
          rawReference: receipt.transactionHash,
          failureReason: "Transfer sender did not match the expected sender.",
        });
      }

      const amountAtomic = amountFromLogData(transfer.data);
      if (amountAtomic !== order.expectedTransferAmountAtomic) {
        return verificationResult({
          status: "wrong_amount",
          network: this.network,
          txHash,
          tokenContractOrMint: order.tokenContractOrMint,
          senderAddress: sender,
          receiverAddress: order.receiverAddress,
          amountAtomic,
          blockNumberOrSlot: receipt.blockNumber,
          rawReference: receipt.transactionHash,
          failureReason: "Transfer amount did not match the unique expected amount.",
        });
      }

      const latestHex = await requestJsonRpc<string>(
        config.rpcUrl,
        "eth_blockNumber",
        [],
        rpcOptions(this.network, config.rpcUrl),
      );
      const latest = BigInt(latestHex);
      const block = BigInt(receipt.blockNumber);
      const confirmations = Number(latest - block + BigInt(1));

      if (confirmations < config.finality.confirmations) {
        return verificationResult({
          status: "unconfirmed",
          network: this.network,
          txHash,
          tokenContractOrMint: order.tokenContractOrMint,
          senderAddress: sender,
          receiverAddress: order.receiverAddress,
          amountAtomic,
          blockNumberOrSlot: receipt.blockNumber,
          confirmations,
          rawReference: receipt.transactionHash,
          failureReason: "Transaction exists but has not reached the configured finality policy.",
        });
      }

      return verificationResult({
        status: "confirmed",
        network: this.network,
        txHash,
        tokenContractOrMint: order.tokenContractOrMint,
        senderAddress: sender,
        receiverAddress: order.receiverAddress,
        amountAtomic,
        blockNumberOrSlot: receipt.blockNumber,
        confirmations,
        rawReference: receipt.transactionHash,
      });
    } catch (error) {
      return verificationResult({
        status: "provider_error",
        network: this.network,
        txHash,
        failureReason: providerFailureReason(error, config.label),
      });
    }
  }
}
