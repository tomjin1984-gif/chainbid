const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254",
  "0.0.0.0",
]);

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) {
      return Number.NaN;
    }

    return Number(part);
  });

  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null;
}

export function isPrivateIpv4(hostname: string): boolean {
  const octets = parseIpv4(hostname);
  if (!octets) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 10 ||
    (a === 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    BLOCKED_HOSTS.has(normalized) ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "::1" ||
    normalized.startsWith("[::1]") ||
    isPrivateIpv4(normalized)
  );
}

export function assertSafeMetadataUrl(input: string): URL {
  const url = new URL(input.includes("://") ? input : `https://${input}`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Metadata fetches only allow http and https.");
  }

  if (url.username || url.password) {
    throw new Error("Metadata URL credentials are not allowed.");
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error("Metadata URL points to a blocked host.");
  }

  return url;
}
