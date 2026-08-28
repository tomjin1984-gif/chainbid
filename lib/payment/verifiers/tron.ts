import { createHash } from "node:crypto";
import { getNetworkConfig } from "@/lib/config/networks";
import type { PaymentOrderRecord } from "@/lib/domain/types";
import { requestJson } from "../rpc";
import type { PaymentVerifier } from "../types";
import { ensureTxHint, verificationResult } from "./base";

const TRON_TRANSFER_TOPIC =
  "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

interface TronLog {
  address: string;
  topics: string[];
  data: string;
}

interface TronTransactionInfo {
  id?: string;
  blockNumber?: number;
  receipt?: { result?: string };
  log?: TronLog[];
}

interface TronGridTrc20Event {
  transaction_id?: string;
  token_info?: {
    address?: string;
  };
  from?: string;
  to?: string;
  value?: string;
}

interface TronGridTrc20Response {
  data?: TronGridTrc20Event[];
}

function base58Decode(value: string) {
  let decoded = BigInt(0);
  for (const char of value) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error("Invalid base58 character.");
    }

    decoded = decoded * BigInt(58) + BigInt(index);
  }

  let hex = decoded.toString(16);
  if (hex.length % 2) {
    hex = `0${hex}`;
  }

  let bytes = Uint8Array.from(hex.match(/.{2}/g)?.map((item) => parseInt(item, 16)) ?? []);
  for (const char of value) {
    if (char !== "1") {
      break;
    }
    bytes = Uint8Array.from([0, ...bytes]);
  }

  return bytes;
}

function tronAddressToTopic(address: string) {
  const bytes = base58Decode(address);
  if (bytes.length !== 25) {
    throw new Error("Invalid TRON address length.");
  }

  const payload = bytes.slice(0, 21);
  const checksum = bytes.slice(21);
  const firstHash = createHash("sha256").update(payload).digest();
  const secondHash = createHash("sha256").update(firstHash).digest();
  const expected = secondHash.slice(0, 4);

  if (!checksum.every((byte, index) => byte === expected[index])) {
    throw new Error("Invalid TRON address checksum.");
  }

  const evmAddressHex = Buffer.from(payload.slice(1)).toString("hex");
  return evmAddressHex.padStart(64, "0").toLowerCase();
}

function tronApiBaseUrl(rpcUrl: string) {
  return rpcUrl.replace(/\/+(?:walletsolidity|wallet)?\/?$/i, "").replace(/\/+$/, "");
}

function tronScanLimit() {
  const configured = Number(process.env.TRON_EVENT_LOOKBACK ?? 50);
  if (!Number.isFinite(configured)) {
    return 50;
  }

  return Math.min(200, Math.max(10, Math.trunc(configured)));
}

async function fetchRecentTrc20Events(order: PaymentOrderRecord, rpcUrl: string) {
  const url = new URL(
    `/v1/accounts/${encodeURIComponent(order.receiverAddress)}/transactions/trc20`,
    tronApiBaseUrl(rpcUrl),
  );
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("limit", tronScanLimit().toString());
  url.searchParams.set("contract_address", order.tokenContractOrMint);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (process.env.TRONGRID_API_KEY) {
      headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`TRON TRC20 event scan failed with HTTP ${response.status}`);
    }

    const text = await response.text();
    if (!text.trim()) {
      throw new Error("TRON TRC20 event scan returned an empty response.");
    }

    return JSON.parse(text) as TronGridTrc20Response;
  } finally {
    clearTimeout(timeout);
  }
}

export class TronUsdtVerifier implements PaymentVerifier {
  readonly network = "tron" as const;

  private async findRecentTransferHash(order: PaymentOrderRecord, rpcUrl: string) {
    const response = await fetchRecentTrc20Events(order, rpcUrl);
    const transfer = (response.data ?? []).find((event) => (
      event.transaction_id &&
      event.to === order.receiverAddress &&
      event.token_info?.address === order.tokenContractOrMint &&
      event.value === order.expectedTransferAmountAtomic.toString()
    ));

    return transfer?.transaction_id ?? null;
  }

  async verifyPayment(order: PaymentOrderRecord, txHashHint?: string) {
    const config = getNetworkConfig("tron");
    const txHash = ensureTxHint(order, txHashHint);

    if (!config.rpcUrl) {
      return verificationResult({
        status: "provider_error",
        network: "tron",
        txHash: txHash ?? undefined,
        failureReason: `${config.rpcEnv} is not configured.`,
      });
    }

    try {
      const detectedTxHash = txHash ?? await this.findRecentTransferHash(order, config.rpcUrl);
      if (!detectedTxHash) {
        return verificationResult({
          status: "not_found",
          network: "tron",
          failureReason: "No recent TRC20 USDT transfer matched this order's unique amount.",
        });
      }

      const info = await requestJson<TronTransactionInfo>(
        `${config.rpcUrl.replace(/\/+$/, "")}/walletsolidity/gettransactioninfobyid`,
        { value: detectedTxHash },
      );

      if (!info?.id) {
        return verificationResult({
          status: "not_found",
          network: "tron",
          txHash: detectedTxHash,
          failureReason: "TRON transaction was not found in solidity endpoint.",
        });
      }

      if (info.receipt?.result && info.receipt.result !== "SUCCESS") {
        return verificationResult({
          status: "failed_transaction",
          network: "tron",
          txHash: detectedTxHash,
          blockNumberOrSlot: info.blockNumber?.toString() ?? null,
          rawReference: info.id,
          failureReason: "TRON transaction receipt is not SUCCESS.",
        });
      }

      const receiverTopic = tronAddressToTopic(order.receiverAddress);
      const transfer = info.log?.find((log) => {
        return (
          log.address.toLowerCase() === order.tokenContractOrMint.toLowerCase() &&
          log.topics?.[0]?.toLowerCase() === TRON_TRANSFER_TOPIC &&
          log.topics?.[2]?.toLowerCase() === receiverTopic
        );
      });

      if (!transfer) {
        return verificationResult({
          status: "wrong_receiver",
          network: "tron",
          txHash: detectedTxHash,
          tokenContractOrMint: order.tokenContractOrMint,
          receiverAddress: order.receiverAddress,
          blockNumberOrSlot: info.blockNumber?.toString() ?? null,
          rawReference: info.id,
          failureReason: "No TRC20 USDT Transfer log to the expected receiver was found.",
        });
      }

      const amountAtomic = BigInt(`0x${transfer.data || "0"}`);
      if (amountAtomic !== order.expectedTransferAmountAtomic) {
        return verificationResult({
          status: "wrong_amount",
          network: "tron",
          txHash: detectedTxHash,
          tokenContractOrMint: order.tokenContractOrMint,
          senderAddress: transfer.topics?.[1] ?? null,
          receiverAddress: order.receiverAddress,
          amountAtomic,
          blockNumberOrSlot: info.blockNumber?.toString() ?? null,
          rawReference: info.id,
          failureReason: "Transfer amount did not match the unique expected amount.",
        });
      }

      return verificationResult({
        status: "confirmed",
        network: "tron",
        txHash: detectedTxHash,
        tokenContractOrMint: order.tokenContractOrMint,
        senderAddress: transfer.topics?.[1] ?? null,
        receiverAddress: order.receiverAddress,
        amountAtomic,
        blockNumberOrSlot: info.blockNumber?.toString() ?? null,
        confirmations: config.finality.confirmations,
        rawReference: info.id,
      });
    } catch (error) {
      return verificationResult({
        status: "provider_error",
        network: "tron",
        txHash,
        failureReason: error instanceof Error ? error.message : "TRON verification failed.",
      });
    }
  }
}
