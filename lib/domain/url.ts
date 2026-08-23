const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "ref",
  "ref_src",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

export interface NormalizedProjectUrl {
  url: string;
  canonicalListingKey: string;
  hostname: string;
}

export function normalizeProjectUrl(input: string): NormalizedProjectUrl {
  const raw = input.trim();
  const url = new URL(raw.includes("://") ? raw : `https://${raw}`);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Project URL must use http or https.");
  }

  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  url.searchParams.sort();

  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  const canonicalListingKey = [
    url.hostname,
    url.pathname === "/" ? "" : url.pathname,
    url.search ? url.search : "",
  ].join("").toLowerCase();

  return {
    url: url.toString(),
    canonicalListingKey,
    hostname: url.hostname,
  };
}

export function slugifyProjectName(name: string, fallbackHost: string): string {
  const source = name.trim() || fallbackHost;
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug || "project";
}
