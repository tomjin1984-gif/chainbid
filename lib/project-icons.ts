import { assertSafeMetadataUrl } from "@/lib/security/ssrf";

const MAX_HTML_BYTES = 128 * 1024;
const PAGE_FETCH_TIMEOUT_MS = 3_500;
const ICON_FETCH_TIMEOUT_MS = 2_500;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const IMAGE_EXTENSION_PATTERN = /\.(?:ico|png|jpe?g|gif|webp|svg)(?:$|[?#])/i;

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
