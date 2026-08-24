import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverProjectIconUrl,
  extractIconCandidateUrls,
  resolveProjectLogoUrl,
  sanitizeProjectIconUrl,
} from "../lib/project-icons";

test("extracts and prioritizes declared project icon links", () => {
  const html = `
    <link rel="shortcut icon" href="/favicon.ico">
    <link rel="apple-touch-icon" href="https://cdn.example.com/apple.png">
  `;

  assert.deepEqual(
    extractIconCandidateUrls(html, "https://example.com/product"),
    [
      "https://cdn.example.com/apple.png",
      "https://example.com/favicon.ico",
    ],
  );
});

test("discovers a verified project icon from submitted URL metadata", async () => {
  const fetcher = async (input: string) => {
    if (input === "https://example.com/product") {
      return new Response('<link rel="icon" href="/icon.png">', {
        headers: { "content-type": "text/html" },
      });
    }

    if (input === "https://example.com/icon.png") {
      return new Response("icon", {
        headers: { "content-type": "image/png" },
      });
    }

    throw new Error(`Unexpected fetch: ${input}`);
  };

  assert.equal(
    await discoverProjectIconUrl("https://example.com/product", fetcher),
    "https://example.com/icon.png",
  );
});

test("falls back to favicon.ico when the page has no icon declaration", async () => {
  const fetcher = async (input: string) => {
    if (input === "https://example.com") {
      return new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      });
    }

    if (input === "https://example.com/favicon.ico") {
      return new Response("icon", {
        headers: { "content-type": "image/x-icon" },
      });
    }

    throw new Error(`Unexpected fetch: ${input}`);
  };

  assert.equal(
    await discoverProjectIconUrl("https://example.com", fetcher),
    "https://example.com/favicon.ico",
  );
});

test("treats unsafe or unreachable project icons as missing", async () => {
  assert.equal(sanitizeProjectIconUrl("http://localhost/favicon.ico"), null);

  const fetcher = async () => {
    throw new Error("network unavailable");
  };

  assert.equal(await discoverProjectIconUrl("https://example.com", fetcher), null);
});

test("uses a favicon service fallback when direct discovery fails", async () => {
  const fetcher = async () => {
    throw new Error("network unavailable");
  };

  assert.equal(
    await resolveProjectLogoUrl("https://www.binance.com", null, fetcher),
    "https://www.google.com/s2/favicons?domain=www.binance.com&sz=64",
  );
});
