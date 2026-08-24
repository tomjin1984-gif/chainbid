import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);
const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the crypto leaderboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Chain\.bid/);
  assert.match(html, /\/brand\/chain-bid-logo\.svg/);
  assert.match(html, /Switch to light mode/);
  assert.doesNotMatch(html, /Submit Project/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, /Increase claim amount/);
  assert.match(html, /Decrease claim amount/);
  assert.match(html, /New spots start at 5 USDT\./);
  assert.match(html, /Credited payments only/);
  assert.match(html, /Latest activity/);
  assert.match(html, /This leaderboard has processed/);
  assert.match(html, /since its launch/);
  assert.match(html, /Claim #1/);
  assert.match(html, /1(?:<!-- -->)? - (?:<!-- -->)?20(?:<!-- -->)? of (?:<!-- -->)?20/);
  assert.match(html, /Refresh/);
  assert.match(html, /www\.google\.com\/s2\/favicons/);
  assert.match(html, /href="https:\/\/uniswap\.org"/);
  assert.match(html, /href="\/submit\?boost=uniswap&amp;target=/);
  assert.doesNotMatch(html, /class="domain"/);
  assert.doesNotMatch(html, /href="\/project\//);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("does not expose project detail pages", async () => {
  const response = await render("/project/uniswap");
  assert.equal(response.status, 404);
});

test("server-renders the categories page", async () => {
  const response = await render("/categories");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Categories/);
  assert.match(html, /Every category has its own ranking/);
  assert.match(html, /AI x Crypto/);
  assert.match(html, /Prediction Markets/);
  assert.match(html, /Live stats/);
});

test("server-renders submit page without removed optional fields", async () => {
  const response = await render("/submit");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Project URL/);
  assert.match(html, /Initial Bid/);
  assert.doesNotMatch(html, /X Account/);
  assert.doesNotMatch(html, /Optional Paying Wallet/);
});

test("server-renders the about page", async () => {
  const response = await render("/about");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /About/);
  assert.match(html, /powered by artificial intelligence/);
  assert.match(html, /creativity should not be limited/);
  assert.match(html, /humanitarian aid and meaningful causes/);
  assert.match(html, /peaceful world/);
  assert.doesNotMatch(html, /Public payment addresses/);
  assert.doesNotMatch(html, /TXCeQc8ekY2M1xE6DkH9QaHwq4VLK7Vf79/);
});

test("server-renders rules with security warnings", async () => {
  const response = await render("/rules");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /How ranking works/);
  assert.match(html, /Security risk warning/);
  assert.match(html, /Do not approve unlimited USDT spending/);
  assert.match(html, /Disclaimer/);
  assert.match(html, /not legal, financial, tax, or investment advice/);
});

test("removes the disposable starter preview files", async () => {
  await assert.rejects(
    access(new URL("SkeletonPreview.tsx", previewRoot)),
  );
  await assert.rejects(
    access(new URL("preview.css", previewRoot)),
  );
  await assert.rejects(
    access(new URL("public/_sites-preview", templateRoot)),
  );
});
