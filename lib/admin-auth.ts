import { readEnv, isProduction } from "@/lib/config/env";

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}

export function isAdminHeaders(headers: Headers) {
  const configured = readEnv("ADMIN_TOKEN");
  if (!configured) {
    return !isProduction();
  }

  const supplied =
    headers.get("x-admin-token") ??
    headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("admin_token="))
      ?.slice("admin_token=".length) ??
    "";

  return constantTimeEqual(configured, decodeURIComponent(supplied));
}
