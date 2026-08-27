import assert from "node:assert/strict";
import test from "node:test";
import { requestJsonRpc } from "../lib/payment/rpc";

test("json-rpc timeout errors are readable", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => (
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        reject(error);
      });
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => requestJsonRpc("https://rpc.test", "getTransaction", [], {
        timeoutMs: 1,
        retries: 0,
        fallbackUrls: [],
      }),
      /RPC getTransaction timed out after 1ms\./,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
