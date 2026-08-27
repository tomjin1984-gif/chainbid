import { getNetworkConfig } from "@/lib/config/networks";
import type { PaymentOrderRecord } from "@/lib/domain/types";
import { requestJsonRpc } from "../rpc";
import type { PaymentVerifier } from "../types";
import { ensureTxHint, verificationResult } from "./base";

type SolanaCommitment = "confirmed" | "finalized";

interface SolanaTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
  };
}

interface SolanaTransferInstruction {
  sourceAddress: string | null;
  destinationAddress: string | null;
  amountAtomic: bigint;
}

interface SolanaParsedInstruction {
  parsed?: {
    type?: string;
    info?: Record<string, unknown>;
  };
}

interface SolanaTransaction {
  slot: number;
  transaction: {
    message: {
      accountKeys: Array<string | { pubkey: string }>;
      instructions?: SolanaParsedInstruction[];
    };
  };
  meta: {
    err: unknown;
    preTokenBalances?: SolanaTokenBalance[];
    postTokenBalances?: SolanaTokenBalance[];
    innerInstructions?: Array<{ instructions?: SolanaParsedInstruction[] }>;
  };
}

interface SolanaTokenAccountsResponse {
  value?: Array<{
    pubkey?: string;
  }>;
}

interface SolanaSignatureInfo {
  signature?: string;
  err?: unknown;
}

const transactionCache = new Map<string, Promise<SolanaTransaction | null>>();
const tokenAccountsCache = new Map<string, Promise<Set<string>>>();
const signaturesCache = new Map<string, Promise<SolanaSignatureInfo[]>>();
const DEFAULT_SOLANA_FALLBACK_RPC_URLS = ["https://solana-rpc.publicnode.com"];

function splitRpcUrls(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

function solanaRpcOptions(primaryUrl: string) {
  const configuredFallbacks = [
    ...splitRpcUrls(process.env.SOLANA_RPC_FALLBACK_URLS),
    ...splitRpcUrls(process.env.SOLANA_RPC_URL_FALLBACKS),
  ];
  const fallbackUrls = [...new Set([
    ...configuredFallbacks,
    ...DEFAULT_SOLANA_FALLBACK_RPC_URLS,
  ])].filter((url) => url !== primaryUrl);

  return {
    timeoutMs: 8_000,
    retries: 1,
    fallbackUrls,
  };
}

function solanaSignatureLookback() {
  const configured = Number(process.env.SOLANA_SIGNATURE_LOOKBACK ?? 25);
  if (!Number.isFinite(configured)) {
    return 25;
  }

  return Math.min(100, Math.max(5, Math.trunc(configured)));
}

function accountKeyAt(tx: SolanaTransaction, index: number) {
  const key = tx.transaction.message.accountKeys[index];
  return typeof key === "string" ? key : key?.pubkey;
}

function tokenBalanceKey(balance: SolanaTokenBalance, owner = balance.owner ?? "") {
  return `${balance.accountIndex}:${balance.mint}:${owner}`;
}

function tokenBalanceMap(balances: SolanaTokenBalance[] | undefined) {
  const map = new Map<string, bigint>();
  for (const balance of balances ?? []) {
    map.set(tokenBalanceKey(balance), BigInt(balance.uiTokenAmount.amount));
  }
  return map;
}

function previousTokenAmount(pre: Map<string, bigint>, balance: SolanaTokenBalance) {
  return pre.get(tokenBalanceKey(balance)) ?? pre.get(tokenBalanceKey(balance, "")) ?? BigInt(0);
}

function allParsedInstructions(tx: SolanaTransaction) {
  return [
    ...(tx.transaction.message.instructions ?? []),
    ...(tx.meta.innerInstructions ?? []).flatMap((group) => group.instructions ?? []),
  ];
}

function stringInfo(info: Record<string, unknown>, key: string) {
  const value = info[key];
  return typeof value === "string" ? value : null;
}

function transferAmountAtomic(info: Record<string, unknown>) {
  const tokenAmount = info.tokenAmount;
  if (tokenAmount && typeof tokenAmount === "object" && "amount" in tokenAmount) {
    const amount = (tokenAmount as { amount?: unknown }).amount;
    return typeof amount === "string" && /^\d+$/.test(amount) ? BigInt(amount) : null;
  }

  const amount = info.amount;
  return typeof amount === "string" && /^\d+$/.test(amount) ? BigInt(amount) : null;
}

function matchingTransferInstructions(
  tx: SolanaTransaction,
  order: PaymentOrderRecord,
): SolanaTransferInstruction[] {
  const transfers: SolanaTransferInstruction[] = [];

  for (const instruction of allParsedInstructions(tx)) {
    const type = instruction.parsed?.type;
    const info = instruction.parsed?.info;
    if (!info || (type !== "transfer" && type !== "transferChecked")) {
      continue;
    }

    const mint = stringInfo(info, "mint");
    if (mint && mint !== order.tokenContractOrMint) {
      continue;
    }

    if (transferAmountAtomic(info) !== order.expectedTransferAmountAtomic) {
      continue;
    }

    transfers.push({
      sourceAddress: stringInfo(info, "source") ?? stringInfo(info, "authority"),
      destinationAddress: stringInfo(info, "destination"),
      amountAtomic: order.expectedTransferAmountAtomic,
    });
  }

  return transfers;
}

function expectedTransferDestinations(tx: SolanaTransaction, order: PaymentOrderRecord) {
  const destinations = new Set<string>();

  for (const transfer of matchingTransferInstructions(tx, order)) {
    if (transfer.destinationAddress) {
      destinations.add(transfer.destinationAddress);
    }
  }

  return destinations;
}

export class SolanaUsdtVerifier implements PaymentVerifier {
  readonly network = "solana" as const;

  private getTransaction(rpcUrl: string, txHash: string, commitment: SolanaCommitment) {
    const cacheKey = `${rpcUrl}:${commitment}:${txHash}`;
    const cached = transactionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (transactionCache.size > 100) {
      transactionCache.clear();
    }

    let request: Promise<SolanaTransaction | null>;
    request = requestJsonRpc<SolanaTransaction | null>(
      rpcUrl,
      "getTransaction",
      [
        txHash,
        {
          commitment,
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
        },
      ],
      solanaRpcOptions(rpcUrl),
    ).catch((error) => {
      if (transactionCache.get(cacheKey) === request) {
        transactionCache.delete(cacheKey);
      }

      throw error;
    });
    transactionCache.set(cacheKey, request);
    return request;
  }

  private async getReceiverTokenAccounts(
    rpcUrl: string,
    ownerAddress: string,
    mint: string,
    commitment: SolanaCommitment,
  ) {
    const cacheKey = `${rpcUrl}:${commitment}:${ownerAddress}:${mint}`;
    const cached = tokenAccountsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (tokenAccountsCache.size > 100) {
      tokenAccountsCache.clear();
    }

    let request: Promise<Set<string>>;
    request = requestJsonRpc<SolanaTokenAccountsResponse>(
      rpcUrl,
      "getTokenAccountsByOwner",
      [
        ownerAddress,
        { mint },
        {
          commitment,
          encoding: "jsonParsed",
        },
      ],
      solanaRpcOptions(rpcUrl),
    )
      .then((response) => new Set((response.value ?? []).flatMap((account) => (
        account.pubkey ? [account.pubkey] : []
      ))))
      .catch(() => {
        if (tokenAccountsCache.get(cacheKey) === request) {
          tokenAccountsCache.delete(cacheKey);
        }

        return new Set<string>();
      });
    tokenAccountsCache.set(cacheKey, request);
    return request;
  }

  private getSignaturesForAddress(
    rpcUrl: string,
    address: string,
    commitment: SolanaCommitment,
  ) {
    const cacheKey = `${rpcUrl}:${commitment}:${address}:${solanaSignatureLookback()}`;
    const cached = signaturesCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (signaturesCache.size > 100) {
      signaturesCache.clear();
    }

    let request: Promise<SolanaSignatureInfo[]>;
    request = requestJsonRpc<SolanaSignatureInfo[]>(
      rpcUrl,
      "getSignaturesForAddress",
      [
        address,
        {
          commitment,
          limit: solanaSignatureLookback(),
        },
      ],
      solanaRpcOptions(rpcUrl),
    ).catch((error) => {
      if (signaturesCache.get(cacheKey) === request) {
        signaturesCache.delete(cacheKey);
      }

      throw error;
    });
    signaturesCache.set(cacheKey, request);
    return request;
  }

  private async recentReceiverSignatures(
    rpcUrl: string,
    order: PaymentOrderRecord,
  ) {
    const receiverTokenAccounts = await this.getReceiverTokenAccounts(
      rpcUrl,
      order.receiverAddress,
      order.tokenContractOrMint,
      "confirmed",
    );
    const addresses = [...new Set([...receiverTokenAccounts, order.receiverAddress])];
    const signatures = new Set<string>();
    let lastError: unknown = null;

    for (const address of addresses) {
      try {
        const response = await this.getSignaturesForAddress(rpcUrl, address, "confirmed");
        for (const item of response) {
          if (!item.err && item.signature) {
            signatures.add(item.signature);
          }
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!signatures.size && lastError) {
      throw lastError;
    }

    return [...signatures];
  }

  private async verifyKnownTransaction(
    order: PaymentOrderRecord,
    txHash: string,
  ) {
    const config = getNetworkConfig("solana");
    try {
      let finalized = true;
      let tx = await this.getTransaction(config.rpcUrl, txHash, "finalized");

      if (!tx) {
        finalized = false;
        tx = await this.getTransaction(config.rpcUrl, txHash, "confirmed");
      }

      if (!tx) {
        return verificationResult({
          status: "not_found",
          network: "solana",
          txHash,
          failureReason: "Finalized Solana transaction was not found.",
        });
      }

      if (tx.meta.err) {
        return verificationResult({
          status: "failed_transaction",
          network: "solana",
          txHash,
          blockNumberOrSlot: tx.slot.toString(),
          rawReference: txHash,
          failureReason: "Solana transaction meta.err is set.",
        });
      }

      const pre = tokenBalanceMap(tx.meta.preTokenBalances);
      const receiverDeltas: bigint[] = [];
      const postBalances = tx.meta.postTokenBalances ?? [];
      const matchingTransfers = matchingTransferInstructions(tx, order);
      const transferDestinations = expectedTransferDestinations(tx, order);
      const receiverTokenAccounts = await this.getReceiverTokenAccounts(
        config.rpcUrl,
        order.receiverAddress,
        order.tokenContractOrMint,
        finalized ? "finalized" : "confirmed",
      );
      const senderAddress =
        matchingTransfers.find((transfer) => transfer.sourceAddress)?.sourceAddress ?? null;

      for (const postBalance of postBalances) {
        if (postBalance.mint !== order.tokenContractOrMint) {
          continue;
        }

        const accountKey = accountKeyAt(tx, postBalance.accountIndex);
        const matchesReceiver =
          postBalance.owner === order.receiverAddress ||
          accountKey === order.receiverAddress ||
          Boolean(accountKey && receiverTokenAccounts.has(accountKey)) ||
          Boolean(accountKey && transferDestinations.has(accountKey));

        if (!matchesReceiver) {
          continue;
        }

        receiverDeltas.push(
          BigInt(postBalance.uiTokenAmount.amount) - previousTokenAmount(pre, postBalance),
        );
      }

      let receivedAtomic = receiverDeltas.reduce((sum, value) => sum + value, BigInt(0));

      if (receivedAtomic === BigInt(0)) {
        receivedAtomic = matchingTransfers
          .filter((transfer) => (
            transfer.destinationAddress === order.receiverAddress ||
            Boolean(transfer.destinationAddress && receiverTokenAccounts.has(transfer.destinationAddress))
          ))
          .reduce((sum, transfer) => sum + transfer.amountAtomic, BigInt(0));
      }

      if (receivedAtomic === BigInt(0)) {
        return verificationResult({
          status: "wrong_receiver",
          network: "solana",
          txHash,
          tokenContractOrMint: order.tokenContractOrMint,
          receiverAddress: order.receiverAddress,
          blockNumberOrSlot: tx.slot.toString(),
          rawReference: txHash,
          failureReason: "No finalized SPL USDT balance increase for the configured receiver was found.",
        });
      }

      if (receivedAtomic !== order.expectedTransferAmountAtomic) {
        return verificationResult({
          status: "wrong_amount",
          network: "solana",
          txHash,
          tokenContractOrMint: order.tokenContractOrMint,
          senderAddress,
          receiverAddress: order.receiverAddress,
          amountAtomic: receivedAtomic,
          blockNumberOrSlot: tx.slot.toString(),
          rawReference: txHash,
          failureReason: "SPL token balance delta did not match the unique expected amount.",
        });
      }

      if (!finalized) {
        return verificationResult({
          status: "unconfirmed",
          network: "solana",
          txHash,
          tokenContractOrMint: order.tokenContractOrMint,
          senderAddress,
          receiverAddress: order.receiverAddress,
          amountAtomic: receivedAtomic,
          blockNumberOrSlot: tx.slot.toString(),
          rawReference: txHash,
          failureReason: "Transaction exists but has not reached finalized Solana commitment yet.",
        });
      }

      return verificationResult({
        status: "confirmed",
        network: "solana",
        txHash,
        tokenContractOrMint: order.tokenContractOrMint,
        senderAddress,
        receiverAddress: order.receiverAddress,
        amountAtomic: receivedAtomic,
        blockNumberOrSlot: tx.slot.toString(),
        confirmations: config.finality.confirmations,
        rawReference: txHash,
      });
    } catch (error) {
      return verificationResult({
        status: "provider_error",
        network: "solana",
        txHash,
        failureReason: error instanceof Error ? error.message : "Solana verification failed.",
      });
    }
  }

  async verifyPayment(order: PaymentOrderRecord, txHashHint?: string) {
    const config = getNetworkConfig("solana");
    const txHash = ensureTxHint(order, txHashHint);

    if (!config.rpcUrl) {
      return verificationResult({
        status: "provider_error",
        network: "solana",
        txHash: txHash ?? undefined,
        failureReason: `${config.rpcEnv} is not configured.`,
      });
    }

    if (txHash) {
      return this.verifyKnownTransaction(order, txHash);
    }

    try {
      const signatures = await this.recentReceiverSignatures(config.rpcUrl, order);
      for (const signature of signatures) {
        const result = await this.verifyKnownTransaction(order, signature);
        if (result.status === "confirmed" || result.status === "unconfirmed") {
          return result;
        }
      }

      return verificationResult({
        status: "not_found",
        network: "solana",
        failureReason: "No recent Solana USDT transfer matched this order's unique amount.",
      });
    } catch (error) {
      return verificationResult({
        status: "provider_error",
        network: "solana",
        failureReason: error instanceof Error ? error.message : "Solana verification failed.",
      });
    }
  }
}
