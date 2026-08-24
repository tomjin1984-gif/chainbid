export type AppEnv = "development" | "staging" | "production";

export function getAppEnv(): AppEnv {
  const value = process.env.APP_ENV;
  if (value === "production" || value === "staging" || value === "development") {
    return value;
  }

  return "development";
}

export function isProduction() {
  return getAppEnv() === "production";
}

export function isHostedRuntime() {
  const hostname = process.env.CHAIN_BID_RUNTIME_HOST?.trim().toLowerCase();
  if (!hostname) {
    return false;
  }

  return !["localhost", "127.0.0.1", "::1"].includes(hostname);
}

export function readEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value && value.trim()) {
    return value.trim();
  }

  if (fallback !== undefined && !isProduction()) {
    return fallback;
  }

  return "";
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

export function readBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function getPublicAppUrl(request?: Request) {
  const configured = readEnv("NEXT_PUBLIC_APP_URL");
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (request) {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  }

  return "http://localhost:3000";
}
