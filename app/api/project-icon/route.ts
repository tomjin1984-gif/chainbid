import { projectFaviconFallbackUrl, sanitizeProjectIconUrl } from "@/lib/project-icons";

const FETCH_TIMEOUT_MS = 900;
const MAX_ICON_BYTES = 512 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const IMAGE_EXTENSION_PATTERN = /\.(?:ico|png|jpe?g|gif|webp|svg)(?:$|[?#])/i;

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cacheHeaders(contentType: string) {
  return {
    "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
    "content-type": contentType,
    "x-content-type-options": "nosniff",
  };
}

function timeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout),
  };
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const timeout = timeoutController(FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: timeout.signal });
  } finally {
    timeout.cancel();
  }
}

async function fetchWithSafeRedirects(input: string) {
  let currentUrl = sanitizeProjectIconUrl(input);
  if (!currentUrl) {
    return null;
  }

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetchWithTimeout(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "image/*,*/*;q=0.2" },
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, url: currentUrl };
    }

    const location = response.headers.get("location");
    currentUrl = location ? sanitizeProjectIconUrl(location, currentUrl) : null;
    if (!currentUrl) {
      return null;
    }
  }

  return null;
}

function responseLooksLikeImage(response: Response, url: string) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    contentType.startsWith("image/") ||
    (!contentType.includes("text/html") && IMAGE_EXTENSION_PATTERN.test(url))
  );
}

async function proxyIcon(candidateUrl: string) {
  try {
    const result = await fetchWithSafeRedirects(candidateUrl);
    if (!result || !result.response.ok || !responseLooksLikeImage(result.response, result.url)) {
      return null;
    }

    const contentLength = Number(result.response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_ICON_BYTES) {
      return null;
    }

    const body = await result.response.arrayBuffer();
    if (body.byteLength > MAX_ICON_BYTES) {
      return null;
    }

    const contentType = result.response.headers.get("content-type") ?? "image/png";
    return new Response(body, {
      headers: cacheHeaders(contentType),
    });
  } catch {
    return null;
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function iconCandidates(url: string | null, src: string | null) {
  const safeProjectUrl = url ? sanitizeProjectIconUrl(url) : null;
  const candidates: string[] = [];

  if (src) {
    const safeSource = sanitizeProjectIconUrl(src, safeProjectUrl ?? undefined);
    if (safeSource) {
      candidates.push(safeSource);
    }
  }

  if (safeProjectUrl) {
    const directFavicon = sanitizeProjectIconUrl("/favicon.ico", safeProjectUrl);
    if (directFavicon) {
      candidates.push(directFavicon);
    }

  }

  return unique(candidates);
}

function fallbackLabel(projectUrl: string | null) {
  try {
    const hostname = new URL(projectUrl ?? "").hostname.replace(/^www\./i, "");
    const label = hostname
      .split(".")
      .filter(Boolean)[0]
      ?.replace(/[^a-z0-9]/gi, "")
      .slice(0, 2)
      .toUpperCase();

    return label || "CB";
  } catch {
    return "CB";
  }
}

function fallbackSvg(projectUrl: string | null) {
  const label = fallbackLabel(projectUrl);
  const svg = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="16" fill="#10241F"/><rect x="1" y="1" width="62" height="62" rx="15" stroke="#00E0A4" stroke-opacity=".35" stroke-width="2"/><circle cx="32" cy="20" r="6" fill="#00E0A4"/><path d="M18 42c2.8-7 7.5-10.5 14-10.5S43.2 35 46 42" stroke="#93FF4F" stroke-width="5" stroke-linecap="round"/><text x="32" y="55" text-anchor="middle" fill="#EAF2F0" font-family="Arial, sans-serif" font-size="13" font-weight="700">${label}</text></svg>`;

  return new Response(svg, {
    headers: cacheHeaders("image/svg+xml; charset=utf-8"),
  });
}

function fallbackFaviconRedirect(projectUrl: string | null) {
  const safeProjectUrl = projectUrl ? sanitizeProjectIconUrl(projectUrl) : null;
  const fallbackUrl = safeProjectUrl ? projectFaviconFallbackUrl(safeProjectUrl) : null;

  return fallbackUrl
    ? new Response(null, {
        status: 302,
        headers: {
          "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
          location: fallbackUrl,
        },
      })
    : null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const url = params.get("url");
  const src = params.get("src");

  for (const candidate of iconCandidates(url, src)) {
    const icon = await proxyIcon(candidate);
    if (icon) {
      return icon;
    }
  }

  const fallback = fallbackFaviconRedirect(url);
  if (fallback) {
    return fallback;
  }

  return fallbackSvg(url);
}
