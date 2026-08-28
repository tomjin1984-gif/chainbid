import { readBooleanEnv, isProduction } from "./env";
import type { SupportedNetwork } from "@/lib/domain/types";

export interface FinalityPolicy {
  mode: "finalized_tag" | "confirmations" | "solana_finalized" | "tron_solidity";
  confirmations: number;
  description: string;
}

export interface NetworkTokenConfig {
  network: SupportedNetwork;
  label: string;
  tokenStandard: string;
  chainId: number | null;
  receiverAddress: string;
  receiverEnv: string;
  usdtContractOrMint: string;
  tokenEnv: string;
  decimals: number;
  rpcUrl: string;
  rpcEnv: string;
  enabled: boolean;
  finality: FinalityPolicy;
  explorerTxUrl: (txHash: string) => string;
  sourceStatus: "primary_verified" | "network_verified" | "requires_manual_approval";
  sourceNote: string;
}

const RECEIVERS = {
  tron: "TXCeQc8ekY2M1xE6DkH9QaHwq4VLK7Vf79",
  ethereum: "0x64182691a520444f9caaf9dcf5bf50e002b42413",
  bsc: "0x64182691a520444f9caaf9dcf5bf50e002b42413",
  solana: "DF3GhEBESpTcLbXuKWyFxYPL9PD66CzQNGK4smFg7ew3",
};

const DEFAULT_USDT = {
  tron: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  ethereum: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  bsc: "0x55d398326f99059fF775485246999027B3197955",
  solana: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
};

function readConfiguredEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function readConfiguredUrlEnv(names: string[]) {
  const value = readConfiguredEnv(names);
  return value
    .split(",")
    .map((url) => url.trim())
    .find(Boolean) ?? "";
}

function readNetworkEnv(names: string[], fallback: string, production: boolean) {
  return readConfiguredEnv(names) || (production ? "" : fallback);
}

function readNumberEnv(names: string[], fallback: number) {
  const raw = readConfiguredEnv(names);
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const supportedNetworks: SupportedNetwork[] = [
  "tron",
  "ethereum",
  "bsc",
  "solana",
];

export function getNetworkConfig(network: SupportedNetwork): NetworkTokenConfig {
  const configs = getNetworkConfigs();
  const config = configs.find((item) => item.network === network);
  if (!config) {
    throw new Error(`Unsupported network ${network}`);
  }

  return config;
}

export function getNetworkConfigs(): NetworkTokenConfig[] {
  const bscApproved = readBooleanEnv("BSC_USDT_SOURCE_APPROVED", false);
  const production = isProduction();

  return [
    {
      network: "tron",
      label: "TRON",
      tokenStandard: "USDT TRC20",
      chainId: null,
      receiverAddress: readNetworkEnv(["USDT_RECEIVER_TRON"], RECEIVERS.tron, production),
      receiverEnv: "USDT_RECEIVER_TRON",
      usdtContractOrMint: readNetworkEnv(["USDT_CONTRACT_TRON"], DEFAULT_USDT.tron, production),
      tokenEnv: "USDT_CONTRACT_TRON",
      decimals: readNumberEnv(["USDT_DECIMALS_TRON"], 6),
      rpcUrl: readConfiguredUrlEnv(["TRON_RPC_URL", "TRON_RPC_FALLBACK_URLS"]),
      rpcEnv: "TRON_RPC_URL",
      enabled: readBooleanEnv("PAYMENTS_TRON_ENABLED", !production),
      finality: {
        mode: "tron_solidity",
        confirmations: readNumberEnv(["TRON_CONFIRMATIONS"], 27),
        description:
          "Use TRON solidity/confirmed endpoints and a conservative block confirmation floor.",
      },
      explorerTxUrl: (txHash) => `https://tronscan.org/#/transaction/${txHash}`,
      sourceStatus: "primary_verified",
      sourceNote: "Tether supported-protocols page lists TRON USDt at this contract.",
    },
    {
      network: "ethereum",
      label: "Ethereum",
      tokenStandard: "USDT ERC20",
      chainId: 1,
      receiverAddress: readNetworkEnv(["USDT_RECEIVER_ETHEREUM"], RECEIVERS.ethereum, production),
      receiverEnv: "USDT_RECEIVER_ETHEREUM",
      usdtContractOrMint: readNetworkEnv(["USDT_CONTRACT_ETHEREUM"], DEFAULT_USDT.ethereum, production),
      tokenEnv: "USDT_CONTRACT_ETHEREUM",
      decimals: readNumberEnv(["USDT_DECIMALS_ETHEREUM"], 6),
      rpcUrl: readConfiguredUrlEnv(["ETHEREUM_RPC_URL", "ETHEREUM_RPC_FALLBACK_URLS"]),
      rpcEnv: "ETHEREUM_RPC_URL",
      enabled: readBooleanEnv("PAYMENTS_ETHEREUM_ENABLED", !production),
      finality: {
        mode: "finalized_tag",
        confirmations: readNumberEnv(["ETHEREUM_CONFIRMATIONS"], 64),
        description:
          "Prefer the finalized block tag; fall back to a conservative confirmation floor if the RPC does not expose finalized.",
      },
      explorerTxUrl: (txHash) => `https://etherscan.io/tx/${txHash}`,
      sourceStatus: "primary_verified",
      sourceNote: "Tether supported-protocols page lists Ethereum USDt at this contract.",
    },
    {
      network: "bsc",
      label: "BNB Smart Chain",
      tokenStandard: "USDT BEP20",
      chainId: 56,
      receiverAddress: readNetworkEnv(["USDT_RECEIVER_BSC"], RECEIVERS.bsc, production),
      receiverEnv: "USDT_RECEIVER_BSC",
      usdtContractOrMint: readNetworkEnv(["USDT_CONTRACT_BSC"], DEFAULT_USDT.bsc, production),
      tokenEnv: "USDT_CONTRACT_BSC",
      decimals: readNumberEnv(["USDT_DECIMALS_BSC"], 18),
      rpcUrl: readConfiguredUrlEnv(["BSC_RPC_URL", "BSC_RPC_FALLBACK_URLS"]),
      rpcEnv: "BSC_RPC_URL",
      enabled:
        readBooleanEnv("PAYMENTS_BSC_ENABLED", !production) &&
        (!production || bscApproved),
      finality: {
        mode: "confirmations",
        confirmations: readNumberEnv(["BSC_CONFIRMATIONS"], 45),
        description:
          "Use a conservative confirmation floor unless a BSC finalized-safe RPC path is configured.",
      },
      explorerTxUrl: (txHash) => `https://bscscan.com/tx/${txHash}`,
      sourceStatus: bscApproved ? "network_verified" : "requires_manual_approval",
      sourceNote:
        "BSC is architecturally supported, but production enablement requires explicit approval of the BEP20 USDT contract source.",
    },
    {
      network: "solana",
      label: "Solana",
      tokenStandard: "USDT SPL",
      chainId: null,
      receiverAddress: readNetworkEnv(["USDT_RECEIVER_SOLANA"], RECEIVERS.solana, production),
      receiverEnv: "USDT_RECEIVER_SOLANA",
      usdtContractOrMint: readNetworkEnv(
        ["USDT_MINT_SOLANA", "USDT_CONTRACT_SOLANA"],
        DEFAULT_USDT.solana,
        production,
      ),
      tokenEnv: "USDT_MINT_SOLANA",
      decimals: readNumberEnv(["USDT_DECIMALS_SOLANA"], 6),
      rpcUrl: readConfiguredUrlEnv(["SOLANA_RPC_URL", "SOLANA_RPC_FALLBACK_URLS", "SOLANA_RPC_URL_FALLBACKS"]),
      rpcEnv: "SOLANA_RPC_URL",
      enabled: readBooleanEnv("PAYMENTS_SOLANA_ENABLED", !production),
      finality: {
        mode: "solana_finalized",
        confirmations: readNumberEnv(["SOLANA_MIN_CONFIRMATIONS", "SOLANA_CONFIRMATIONS"], 32),
        description:
          "Require a finalized Solana transaction response and confirm the SPL token balance delta.",
      },
      explorerTxUrl: (txHash) => `https://solscan.io/tx/${txHash}`,
      sourceStatus: "primary_verified",
      sourceNote: "Tether supported-protocols page lists Solana USDt at this mint.",
    },
  ];
}

export function assertNetworkReadyForCheckout(config: NetworkTokenConfig) {
  if (!config.enabled) {
    throw new Error(`${config.label} checkout is disabled.`);
  }

  if (!config.receiverAddress || !config.usdtContractOrMint) {
    throw new Error(`${config.label} receiver and USDT token config are required.`);
  }

  if (isProduction() && !config.rpcUrl) {
    throw new Error(`${config.label} RPC URL is required in production.`);
  }

  if (isProduction() && config.sourceStatus === "requires_manual_approval") {
    throw new Error(`${config.label} USDT contract source requires manual approval before production checkout.`);
  }
}

export function isNetworkAvailableForCheckout(config: NetworkTokenConfig) {
  return (
    config.enabled &&
    Boolean(config.receiverAddress) &&
    Boolean(config.usdtContractOrMint) &&
    (!isProduction() || Boolean(config.rpcUrl))
  );
}
