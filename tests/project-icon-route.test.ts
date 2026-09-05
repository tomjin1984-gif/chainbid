import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/project-icon/route";

test("redirects to the favicon service when direct project icon fetch fails", async (t) => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    return new Response("missing", {
      status: 404,
      headers: { "content-type": "text/plain" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await GET(
    new Request("https://chain.bid/api/project-icon?url=https%3A%2F%2Fexample.com"),
  );

  assert.deepEqual(requestedUrls, ["https://example.com/favicon.ico"]);
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://www.google.com/s2/favicons?domain=example.com&sz=64",
  );
});
