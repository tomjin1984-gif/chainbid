import assert from "node:assert/strict";
import test from "node:test";
import {
  extractProjectMetadata,
  resolveProjectMetadata,
} from "../lib/project-metadata";

test("extracts project name and summary from metadata tags", () => {
  const metadata = extractProjectMetadata(
    `
      <title>Example Exchange - Crypto Trading Platform</title>
      <meta property="og:site_name" content="Example Exchange">
      <meta name="description" content="Trade digital assets with spot markets, wallets, and Web3 tools.">
    `,
    "https://example.com",
  );

  assert.deepEqual(metadata, {
    name: "Example Exchange",
    description: "Trade digital assets with spot markets, wallets, and Web3 tools.",
  });
});

test("resolves project metadata from a submitted URL", async () => {
  const fetcher = async (input: string) => {
    assert.equal(input, "https://binance.example/");
    return new Response(
      `
        <title>Binance - Cryptocurrency Exchange</title>
        <meta property="og:description" content="A crypto exchange for trading, wallets, and Web3 products.">
      `,
      { headers: { "content-type": "text/html" } },
    );
  };

  assert.deepEqual(
    await resolveProjectMetadata("https://binance.example", fetcher),
    {
      name: "Binance",
      description: "A crypto exchange for trading, wallets, and Web3 products.",
    },
  );
});

test("falls back to hostname metadata when fetch fails", async () => {
  const fetcher = async () => {
    throw new Error("network unavailable");
  };

  assert.deepEqual(
    await resolveProjectMetadata("https://www.chain-bid.example", fetcher),
    {
      name: "Chain Bid",
      description: "Chain Bid is a project listed from chain-bid.example.",
    },
  );
});
