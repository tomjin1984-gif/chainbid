import { sites } from "@openai/sites-vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  vars: {
    APP_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://chainbid.tomjin1984.workers.dev",
    SUPABASE_URL: "https://hbdofcqwutrvsszrwrfh.supabase.co",
    PAYMENTS_TRON_ENABLED: "true",
    PAYMENTS_ETHEREUM_ENABLED: "true",
    PAYMENTS_BSC_ENABLED: "true",
    PAYMENTS_SOLANA_ENABLED: "true",
    TRON_RPC_URL: "https://api.trongrid.io",
    ETHEREUM_RPC_URL: "https://ethereum-rpc.publicnode.com",
    SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
    USDT_RECEIVER_TRON: "TXCeQc8ekY2M1xE6DkH9QaHwq4VLK7Vf79",
    USDT_RECEIVER_ETHEREUM: "0x64182691a520444f9caaf9dcf5bf50e002b42413",
    USDT_RECEIVER_SOLANA: "DF3GhEBESpTcLbXuKWyFxYPL9PD66CzQNGK4smFg7ew3",
    USDT_CONTRACT_TRON: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    USDT_CONTRACT_ETHEREUM: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    USDT_MINT_SOLANA: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    USDT_DECIMALS_TRON: "6",
    USDT_DECIMALS_ETHEREUM: "6",
    USDT_DECIMALS_SOLANA: "6",
    TRON_CONFIRMATIONS: "27",
    ETHEREUM_CONFIRMATIONS: "64",
    SOLANA_MIN_CONFIRMATIONS: "32",
    BSC_RPC_URL: "https://bsc-dataseed.bnbchain.org",
    BSC_USDT_SOURCE_APPROVED: "true",
    USDT_RECEIVER_BSC: "0x64182691a520444f9caaf9dcf5bf50e002b42413",
    USDT_CONTRACT_BSC: "0x55d398326f99059fF775485246999027B3197955",
    USDT_DECIMALS_BSC: "18",
    BSC_CONFIRMATIONS: "45",
    PAYMENT_ORDER_EXPIRY_MINUTES: "30",
    PAYMENT_WORKER_BATCH_SIZE: "50",
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
