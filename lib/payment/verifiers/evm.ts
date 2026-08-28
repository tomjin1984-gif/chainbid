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

function readIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function logLookbackBlocks(network: Extract<SupportedNetwork, "ethereum" | "bsc">) {
  const specific = `${network.toUpperCase()}_LOG_LOOKBACK_BLOCKS`;
  const fallback = network === "bsc" ? 3_000 : 1_200;
  return readIntegerEnv(specific, readIntegerEnv("EVM_LOG_LOOKBACK_BLOCKS", fallback));
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

  private async latestBlockNumber(rpcUrl: string) {
    const latestHex = await requestJsonRpc<string>(
      rpcUrl,
      "eth_blockNumber",
      [],
      rpcOptions(this.network, rpcUrl),
    );
    return BigInt(latestHex);
  }

  private async findRecentTransferHash(order: PaymentOrderRecord, rpcUrl: string) {
    const latest = await this.latestBlockNumber(rpcUrl);
    const lookback = BigInt(logLookbackBlocks(this.network));
    const fromBlock = latest > lookback ? latest - lookback : BigInt(0);
    const logs = await requestJsonRpc<EvmLog[]>(
      rpcUrl,
      "eth_getLogs",
      [
        {
          address: order.tokenContractOrMint,
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: "latest",
          topics: [TRANSFER_TOPIC, null, addressTopic(order.receiverAddress)],
        },
      ],
      rpcOptions(this.network, rpcUrl),
    );

    const matchingLogs = logs
      .filter((log) => (
        log.transactionHash &&
        normalizeHex(log.address) === normalizeHex(order.tokenContractOrMint) &&
        normalizeHex(log.topics[0] ?? "") === TRANSFER_TOPIC &&
        normalizeHex(log.topics[2] ?? "") === normalizeHex(addressTopic(order.receiverAddress)) &&
        amountFromLogData(log.data) === order.expectedTransferAmountAtomic
      ))
      .sort((first, second) => Number(BigInt(second.blockNumber ?? "0x0") - BigInt(first.blockNumber ?? "0x0")));

    return matchingLogs[0]?.transactionHash ?? null;
  }

  async verifyPayment(order: PaymentOrderRecord, txHashHint?: string) {
    const config = getNetworkConfig(this.network);
    const txHash = ensureTxHint(order, txHashHint);

    if (!config.rpcUrl) {
      return verificationResult({
        status: "provider_error",
        network: this.network,
        txHash: txHash ?? undefined,
        failureReason: `${config.rpcEnv} is not configured.`,
      });
    }

    try {
      const detectedTxHash = txHash ?? await this.findRecentTransferHash(order, config.rpcUrl);
      if (!detectedTxHash) {
        return verificationResult({
          status: "not_found",
          network: this.network,
          failureReason: "No recent USDT Transfer log matched this order's unique amount.",
        });
      }

      const receipt = await requestJsonRpc<EvmReceipt | null>(
        config.rpcUrl,
        "eth_getTransactionReceipt",
        [detectedTxHash],
        rpcOptions(this.network, config.rpcUrl),
      );

      if (!receipt) {
        return verificationResult({
          status: "not_found",
          network: this.network,
          txHash: detectedTxHash,
          failureReason: "Transaction receipt was not found.",
        });
      }

      if (receipt.status !== "0x1") {
        return verificationResult({
          status: "failed_transaction",
          network: this.network,
          txHash: detectedTxHash,
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
          txHash: detectedTxHash,
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
          txHash: detectedTxHash,
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
          txHash: detectedTxHash,
          tokenContractOrMint: order.tokenContractOrMint,
          senderAddress: sender,
          receiverAddress: order.receiverAddress,
          amountAtomic,
          blockNumberOrSlot: receipt.blockNumber,
          rawReference: receipt.transactionHash,
          failureReason: "Transfer amount did not match the unique expected amount.",
        });
      }

      const latest = await this.latestBlockNumber(config.rpcUrl);
      const block = BigInt(receipt.blockNumber);
      const confirmations = Number(latest - block + BigInt(1));

      if (confirmations < config.finality.confirmations) {
        return verificationResult({
          status: "unconfirmed",
          network: this.network,
          txHash: detectedTxHash,
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
        txHash: detectedTxHash,
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
