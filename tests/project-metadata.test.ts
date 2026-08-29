import assert from "node:assert/strict";
import test from "node:test";
import {
  extractProjectMetadata,
  projectDisplayName,
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

test("ignores generic app titles and keeps the project brand", () => {
  const metadata = extractProjectMetadata(
    `
      <title>App</title>
      <meta property="og:site_name" content="Uniswap">
      <meta name="description" content="Decentralized exchange protocol for token swaps and liquidity markets.">
    `,
    "https://app.uniswap.org",
  );

  assert.equal(metadata.name, "Uniswap");
  assert.equal(projectDisplayName("App", "https://app.uniswap.org"), "Uniswap");
});

test("falls back to the domain when metadata title is only a slogan", () => {
  const metadata = extractProjectMetadata(
    `
      <title>Do Only Good Everyday</title>
      <meta property="og:title" content="Do Only Good Everyday">
      <meta name="description" content="Open-source peer-to-peer digital currency with a large community.">
    `,
    "https://dogecoin.com",
  );

  assert.equal(metadata.name, "Dogecoin");
  assert.equal(projectDisplayName("Do Only Good Everyday", "https://dogecoin.com"), "Dogecoin");
});

test("ignores blocked-page titles and keeps the submitted brand", () => {
  const metadata = extractProjectMetadata(
    `
      <title>Access Denied</title>
      <meta property="og:title" content="Just a moment...">
      <meta name="description" content="Checking your browser before accessing the site.">
    `,
    "https://example-token.fi",
  );

  assert.equal(metadata.name, "Example Token");
  assert.equal(projectDisplayName("Cloudflare security check", "https://example-token.fi"), "Example Token");
});

test("uses profile paths when a generic platform host is submitted", () => {
  assert.equal(projectDisplayName("X", "https://x.com/HyperJanus"), "HyperJanus");
  assert.equal(projectDisplayName("GitHub", "https://github.com/uniswap/interface"), "Uniswap");
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
