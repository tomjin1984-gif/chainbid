import { assertSafeMetadataUrl } from "@/lib/security/ssrf";

const MAX_HTML_BYTES = 128 * 1024;
const PAGE_FETCH_TIMEOUT_MS = 3_500;
const ICON_FETCH_TIMEOUT_MS = 2_500;
const STORED_ICON_FETCH_TIMEOUT_MS = 900;
const MAX_STORED_ICON_BYTES = 12 * 1024;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const IMAGE_EXTENSION_PATTERN = /\.(?:ico|png|jpe?g|gif|webp|svg)(?:$|[?#])/i;
const STORED_DATA_ICON_PATTERN =
  /^data:image\/(?:png|jpe?g|gif|webp|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=]+$/i;

const STORED_ICON_CONTENT_TYPES = new Map([
  ["image/png", "image/png"],
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/gif", "image/gif"],
  ["image/webp", "image/webp"],
  ["image/x-icon", "image/x-icon"],
  ["image/vnd.microsoft.icon", "image/x-icon"],
]);

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'");
}

function parseAttributes(tag: string) {
  const attributes = new Map<string, string>();
  const attributePattern =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of tag.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase();
    if (!name) {
      continue;
    }

    attributes.set(
      name,
      decodeHtmlAttribute((match[2] ?? match[3] ?? match[4] ?? "").trim()),
    );
  }

  return attributes;
}

function iconPriority(rel: string) {
  const tokens = new Set(rel.toLowerCase().split(/\s+/).filter(Boolean));

  if (tokens.has("apple-touch-icon") || tokens.has("apple-touch-icon-precomposed")) {
    return 0;
  }

  if (tokens.has("icon")) {
    return 1;
  }

  if (tokens.has("mask-icon")) {
    return 2;
  }

  return null;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function sanitizeStoredProjectIconDataUrl(input: string) {
  const trimmed = input.trim();
  if (!STORED_DATA_ICON_PATTERN.test(trimmed)) {
    return null;
  }

  const [, payload = ""] = trimmed.split(",", 2);
  const estimatedBytes = Math.floor((payload.replace(/=+$/, "").length * 3) / 4);
  return estimatedBytes <= MAX_STORED_ICON_BYTES ? trimmed : null;
}

export function sanitizeProjectIconUrl(input: string, baseUrl?: string | URL) {
  const trimmed = input.trim();
  if (!trimmed || /^(?:data|javascript|mailto):/i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed, baseUrl);
    return assertSafeMetadataUrl(url.toString()).toString();
  } catch {
    return null;
  }
}

export function extractIconCandidateUrls(html: string, pageUrl: string | URL) {
  const links: { href: string; priority: number; index: number }[] = [];
  let index = 0;

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const rel = attributes.get("rel") ?? "";
    const priority = iconPriority(rel);
    const href = attributes.get("href");

    if (priority === null || !href) {
      continue;
    }

    const sanitized = sanitizeProjectIconUrl(href, pageUrl);
    if (sanitized) {
      links.push({ href: sanitized, priority, index });
      index += 1;
    }
  }

  return unique(
    links
      .sort((first, second) => first.priority - second.priority || first.index - second.index)
      .map((link) => link.href),
  );
}

function timeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout),
  };
}

async function fetchWithTimeout(
  fetcher: FetchLike,
  input: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const timeout = timeoutController(timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: timeout.signal });
  } finally {
    timeout.cancel();
  }
}

async function fetchWithSafeRedirects(
  fetcher: FetchLike,
  input: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const initialUrl = sanitizeProjectIconUrl(input);
  if (!initialUrl) {
    throw new Error("Icon fetch URL is not allowed.");
  }
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchWithTimeout(
      fetcher,
      currentUrl,
      { ...init, redirect: "manual" },
      timeoutMs,
    );

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    const redirectedUrl = location ? sanitizeProjectIconUrl(location, currentUrl) : null;
    if (!redirectedUrl) {
      throw new Error("Icon fetch redirect URL is not allowed.");
    }

    currentUrl = redirectedUrl;
  }

  throw new Error("Icon fetch redirected too many times.");
}

async function readLimitedText(response: Response) {
  if (!response.body) {
    return (await response.text()).slice(0, MAX_HTML_BYTES);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytesRead = 0;

  try {
    while (bytesRead < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const remainingBytes = MAX_HTML_BYTES - bytesRead;
      const chunk =
        value.byteLength > remainingBytes
          ? value.slice(0, remainingBytes)
          : value;

      text += decoder.decode(chunk, { stream: value.byteLength <= remainingBytes });
      bytesRead += chunk.byteLength;

      if (value.byteLength > remainingBytes || bytesRead >= MAX_HTML_BYTES) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    text += decoder.decode();
  }

  return text;
}

function responseLooksLikeHtml(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return !contentType || contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
}

async function iconUrlLooksUsable(iconUrl: string, fetcher: FetchLike) {
  try {
    const safeIconUrl = sanitizeProjectIconUrl(iconUrl);
    if (!safeIconUrl) {
      return false;
    }

    const response = await fetchWithSafeRedirects(
      fetcher,
      safeIconUrl,
      { method: "GET", headers: { accept: "image/*,*/*;q=0.2" } },
      ICON_FETCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    return (
      contentType.startsWith("image/") ||
      (!contentType.includes("text/html") && IMAGE_EXTENSION_PATTERN.test(safeIconUrl))
    );
  } catch {
    return false;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}

function iconMimeFromResponse(response: Response, url: string) {
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType) {
    const supportedType = STORED_ICON_CONTENT_TYPES.get(contentType);
    if (supportedType) {
      return supportedType;
    }
  }

  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".png")) {
    return "image/png";
  }
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (pathname.endsWith(".gif")) {
    return "image/gif";
  }
  if (pathname.endsWith(".webp")) {
    return "image/webp";
  }
  if (pathname.endsWith(".ico")) {
    return "image/x-icon";
  }

  return null;
}

async function iconUrlToStoredDataUrl(iconUrl: string, fetcher: FetchLike) {
  try {
    const safeIconUrl = sanitizeProjectIconUrl(iconUrl);
    if (!safeIconUrl) {
      return null;
    }

    const result = await fetchWithSafeRedirects(
      fetcher,
      safeIconUrl,
      { method: "GET", headers: { accept: "image/png,image/webp,image/jpeg,image/gif,image/x-icon,*/*;q=0.2" } },
      STORED_ICON_FETCH_TIMEOUT_MS,
    );

    if (!result.ok) {
      return null;
    }

    const mime = iconMimeFromResponse(result, safeIconUrl);
    if (!mime) {
      return null;
    }

    const contentLength = Number(result.headers.get("content-length") ?? 0);
    if (contentLength > MAX_STORED_ICON_BYTES) {
      return null;
    }

    const body = await result.arrayBuffer();
    if (body.byteLength > MAX_STORED_ICON_BYTES) {
      return null;
    }

    return `data:${mime};base64,${arrayBufferToBase64(body)}`;
  } catch {
    return null;
  }
}

export async function discoverProjectIconUrl(
  projectUrl: string,
  fetcher: FetchLike = fetch,
) {
  let pageUrl: URL;
  try {
    pageUrl = assertSafeMetadataUrl(projectUrl);
  } catch {
    return null;
  }

  const candidates: string[] = [];

  try {
    const response = await fetchWithSafeRedirects(
      fetcher,
      pageUrl.toString(),
      { method: "GET", headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" } },
      PAGE_FETCH_TIMEOUT_MS,
    );

    if (response.ok && responseLooksLikeHtml(response)) {
      const html = await readLimitedText(response);
      candidates.push(...extractIconCandidateUrls(html, pageUrl));
    }
  } catch {
    // Icon discovery is best-effort and must never block project submission.
  }

  const fallback = sanitizeProjectIconUrl("/favicon.ico", pageUrl);
  if (fallback) {
    candidates.push(fallback);
  }

  for (const candidate of unique(candidates)) {
    if (await iconUrlLooksUsable(candidate, fetcher)) {
      return candidate;
    }
  }

  return null;
}

export async function resolveProjectLogoUrl(
  projectUrl: string,
  suppliedLogoUrl?: string | null,
  fetcher: FetchLike = fetch,
) {
  const supplied = suppliedLogoUrl?.trim();
  if (supplied) {
    const sanitized = sanitizeProjectIconUrl(supplied);
    if (sanitized) {
      return sanitized;
    }
  }

  const discovered = await discoverProjectIconUrl(projectUrl, fetcher);
  if (discovered) {
    return discovered;
  }

  return projectFaviconFallbackUrl(projectUrl);
}

export async function resolveProjectStoredLogoUrl(
  projectUrl: string,
  suppliedLogoUrl?: string | null,
  fetcher: FetchLike = fetch,
) {
  const supplied = suppliedLogoUrl?.trim();
  if (supplied) {
    const suppliedDataUrl = sanitizeStoredProjectIconDataUrl(supplied);
    if (suppliedDataUrl) {
      return suppliedDataUrl;
    }

    const suppliedUrl = sanitizeProjectIconUrl(supplied, projectUrl);
    const storedSuppliedIcon = suppliedUrl
      ? await iconUrlToStoredDataUrl(suppliedUrl, fetcher)
      : null;
    if (storedSuppliedIcon) {
      return storedSuppliedIcon;
    }
  }

  const directFavicon = sanitizeProjectIconUrl("/favicon.ico", projectUrl);
  if (directFavicon) {
    const storedDirectFavicon = await iconUrlToStoredDataUrl(directFavicon, fetcher);
    if (storedDirectFavicon) {
      return storedDirectFavicon;
    }
  }

  const serviceFavicon = projectFaviconFallbackUrl(projectUrl);
  return serviceFavicon ? iconUrlToStoredDataUrl(serviceFavicon, fetcher) : null;
}

export function projectFaviconFallbackUrl(projectUrl: string) {
  try {
    const { hostname } = new URL(projectUrl);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return null;
  }
}

export function projectIconProxyUrl(projectUrl: string, iconUrl?: string | null) {
  const url = projectUrl.trim();
  if (!url) {
    return null;
  }

  const params = new URLSearchParams({ url });
  const icon = iconUrl?.trim();
  if (icon) {
    params.set("src", icon);
  }

  return `/api/project-icon?${params.toString()}`;
}
