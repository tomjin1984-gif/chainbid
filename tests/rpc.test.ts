import assert from "node:assert/strict";
import test from "node:test";
import { requestJsonRpc } from "../lib/payment/rpc";

test("json-rpc falls back after an empty provider response", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input.toString();
    calls.push(url);

    if (url === "https://primary.example") {
      return new Response("", { status: 200 });
    }

    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: "0x10",
    });
  }) as typeof fetch;

  try {
    const result = await requestJsonRpc<string>(
      "https://primary.example",
      "eth_blockNumber",
      [],
      {
        retries: 0,
        fallbackUrls: ["https://fallback.example"],
      },
    );

    assert.equal(result, "0x10");
    assert.deepEqual(calls, ["https://primary.example", "https://fallback.example"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
