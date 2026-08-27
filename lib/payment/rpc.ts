export interface JsonRpcResponse<T> {
  jsonrpc?: string;
  id?: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

function isAbortLikeError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted|abort/i.test(error.message))
  );
}

function readableRpcError(method: string, error: unknown, timeoutMs: number) {
  if (isAbortLikeError(error)) {
    return new Error(`RPC ${method} timed out after ${timeoutMs}ms.`);
  }

  return error instanceof Error ? error : new Error("RPC request failed");
}

export async function requestJsonRpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  options?: { timeoutMs?: number; retries?: number; fallbackUrls?: string[] },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const retries = options?.retries ?? 1;
  const urls = [...new Set([rpcUrl, ...(options?.fallbackUrls ?? [])].filter(Boolean))];
  let lastError: unknown;

  for (const url of urls) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: attempt + 1,
            method,
            params,
          }),
          signal: controller.signal,
        });

        const text = await response.text();
        if (!response.ok) {
          throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
        }

        if (!text.trim()) {
          throw new Error(`RPC ${method} returned an empty response.`);
        }

        let payload: JsonRpcResponse<T>;
        try {
          payload = JSON.parse(text) as JsonRpcResponse<T>;
        } catch {
          throw new Error(`RPC ${method} returned unreadable JSON.`);
        }

        if (payload.error) {
          throw new Error(`RPC ${method} failed: ${payload.error.message}`);
        }

        return payload.result as T;
      } catch (error) {
        lastError = readableRpcError(method, error, timeoutMs);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("RPC request failed");
}

export async function requestJson<T>(
  url: string,
  payload: unknown,
  options?: { timeoutMs?: number; retries?: number },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const retries = options?.retries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      const text = await response.text();
      if (!text.trim()) {
        throw new Error(`HTTP ${url} returned an empty response.`);
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`HTTP ${url} returned unreadable JSON.`);
      }
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("HTTP request failed");
}
