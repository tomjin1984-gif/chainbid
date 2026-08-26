import { getNetworkConfig } from "@/lib/config/networks";
import type { PaymentOrderRecord } from "@/lib/domain/types";
import { requestJsonRpc } from "../rpc";
import type { PaymentVerifier } from "../types";
import { ensureTxHint, isExpired, verificationResult } from "./base";

interface SolanaTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
  };
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

function expectedTransferDestinations(tx: SolanaTransaction, order: PaymentOrderRecord) {
  const destinations = new Set<string>();

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

    const destination = stringInfo(info, "destination");
    if (destination) {
      destinations.add(destination);
    }
  }

  return destinations;
}

export class SolanaUsdtVerifier implements PaymentVerifier {
  readonly network = "solana" as const;

  async verifyPayment(order: PaymentOrderRecord, txHashHint?: string) {
    const config = getNetworkConfig("solana");
    const txHash = ensureTxHint(order, txHashHint);
    if (!txHash) {
      return verificationResult({
        status: "not_found",
        network: "solana",
        failureReason: "No transaction hash hint or indexer candidate was available.",
      });
    }

    if (!config.rpcUrl) {
      return verificationResult({
        status: "provider_error",
        network: "solana",
        txHash,
        failureReason: `${config.rpcEnv} is not configured.`,
      });
    }

    try {
      const tx = await requestJsonRpc<SolanaTransaction | null>(
        config.rpcUrl,
        "getTransaction",
        [
          txHash,
          {
            commitment: "finalized",
            encoding: "jsonParsed",
            maxSupportedTransactionVersion: 0,
          },
        ],
      );

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
      const transferDestinations = expectedTransferDestinations(tx, order);

      for (const postBalance of postBalances) {
        if (postBalance.mint !== order.tokenContractOrMint) {
          continue;
        }

        const accountKey = accountKeyAt(tx, postBalance.accountIndex);
        const matchesReceiver =
          postBalance.owner === order.receiverAddress ||
          accountKey === order.receiverAddress ||
          Boolean(accountKey && transferDestinations.has(accountKey));

        if (!matchesReceiver) {
          continue;
        }

        receiverDeltas.push(
          BigInt(postBalance.uiTokenAmount.amount) - previousTokenAmount(pre, postBalance),
        );
      }

      const receivedAtomic = receiverDeltas.reduce((sum, value) => sum + value, BigInt(0));

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
          receiverAddress: order.receiverAddress,
          amountAtomic: receivedAtomic,
          blockNumberOrSlot: tx.slot.toString(),
          rawReference: txHash,
          failureReason: "SPL token balance delta did not match the unique expected amount.",
        });
      }

      if (isExpired(order)) {
        return verificationResult({
          status: "manual_review",
          network: "solana",
          txHash,
          tokenContractOrMint: order.tokenContractOrMint,
          receiverAddress: order.receiverAddress,
          amountAtomic: receivedAtomic,
          blockNumberOrSlot: tx.slot.toString(),
          rawReference: txHash,
          failureReason: "Matching transaction arrived after the payment window expired.",
        });
      }

      return verificationResult({
        status: "confirmed",
        network: "solana",
        txHash,
        tokenContractOrMint: order.tokenContractOrMint,
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
}
