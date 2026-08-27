import { assertSafeMetadataUrl } from "@/lib/security/ssrf";

const MAX_HTML_BYTES = 128 * 1024;
const PAGE_FETCH_TIMEOUT_MS = 3_500;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProjectMetadata {
  name: string;
  description: string;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function cleanText(value: string) {
  return decodeHtml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

    attributes.set(name, cleanText(match[2] ?? match[3] ?? match[4] ?? ""));
  }

  return attributes;
}

function readMetaContent(html: string, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const key =
      attributes.get("property")?.toLowerCase() ??
      attributes.get("name")?.toLowerCase() ??
      attributes.get("itemprop")?.toLowerCase();

    if (key && wanted.has(key)) {
      const content = attributes.get("content");
      if (content) {
        return content;
      }
    }
  }

  return "";
}

function readTitle(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(match[1] ?? "") : "";
}

function hostnameName(url: URL) {
  const host = url.hostname.replace(/^www\./i, "");
  const firstLabel = host.split(".")[0] ?? host;
  return firstLabel
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .slice(0, 96);
}

function compactName(value: string) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function titleToCandidate(title: string) {
  const candidate = title
    .split(/\s(?:[|–—-]|::)\s/)
    .map((part) => part.trim())
    .find((part) => part.length >= 2);

  return (candidate ?? "").slice(0, 96);
}

function wordCount(value: string) {
  return cleanText(value).split(/\s+/).filter(Boolean).length;
}

function isUsableProjectNameCandidate(candidate: string, fallback: string) {
  const cleaned = cleanText(candidate);
  const compactCandidate = compactName(cleaned);
  const compactFallback = compactName(fallback);
  const genericNames = new Set([
    "app",
    "home",
    "homepage",
    "login",
    "signin",
    "signup",
    "welcome",
    "website",
    "officialwebsite",
  ]);

  if (cleaned.length < 2 || genericNames.has(compactCandidate)) {
    return false;
  }

  if (
    compactFallback.length >= 3 &&
    wordCount(cleaned) >= 3 &&
    !compactCandidate.includes(compactFallback)
  ) {
    return false;
  }

  return true;
}

function chooseProjectName(candidates: string[], fallback: string) {
  for (const title of candidates) {
    const candidate = titleToCandidate(title);
    if (isUsableProjectNameCandidate(candidate, fallback)) {
      return candidate;
    }
  }

  return fallback;
}

export function projectDisplayName(storedName: string, projectUrl: string) {
  try {
    const fallback = hostnameName(new URL(projectUrl));
    return chooseProjectName([storedName], fallback);
  } catch {
    return cleanText(storedName).slice(0, 96) || "Project";
  }
}

function truncateDescription(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return "";
  }

  if (cleaned.length <= 280) {
    return cleaned;
  }

  const shortened = cleaned.slice(0, 277);
  const sentenceEnd = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf("! "),
    shortened.lastIndexOf("? "),
  );

  return `${(sentenceEnd > 80 ? shortened.slice(0, sentenceEnd + 1) : shortened).trim()}...`;
}

function fallbackDescription(name: string, url: URL) {
  const host = url.hostname.replace(/^www\./i, "");
  return `${name} is a project listed from ${host}.`;
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
  const initialUrl = assertSafeMetadataUrl(input).toString();
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
    if (!location) {
      return response;
    }

    currentUrl = assertSafeMetadataUrl(new URL(location, currentUrl).toString()).toString();
  }

  throw new Error("Metadata fetch redirected too many times.");
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

export function extractProjectMetadata(html: string, projectUrl: string) {
  const url = new URL(projectUrl);
  const fallbackName = hostnameName(url);
  const name = chooseProjectName(
    [
      readMetaContent(html, ["og:title", "twitter:title"]),
      readTitle(html),
      readMetaContent(html, ["og:site_name"]),
      readMetaContent(html, ["application-name"]),
    ],
    fallbackName,
  );
  const description =
    truncateDescription(readMetaContent(html, ["description", "og:description", "twitter:description"])) ||
    truncateDescription(readTitle(html)) ||
    fallbackDescription(name, url);

  return { name, description };
}

export function inferProjectMetadataFromUrl(projectUrl: string): ProjectMetadata {
  const pageUrl = assertSafeMetadataUrl(projectUrl);
  const name = hostnameName(pageUrl);
  return {
    name,
    description: fallbackDescription(name, pageUrl),
  };
}

export async function resolveProjectMetadata(
  projectUrl: string,
  fetcher: FetchLike = fetch,
): Promise<ProjectMetadata> {
  const pageUrl = assertSafeMetadataUrl(projectUrl);

  try {
    const response = await fetchWithSafeRedirects(
      fetcher,
      pageUrl.toString(),
      { method: "GET", headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" } },
      PAGE_FETCH_TIMEOUT_MS,
    );

    if (response.ok && responseLooksLikeHtml(response)) {
      return extractProjectMetadata(await readLimitedText(response), pageUrl.toString());
    }
  } catch {
    // Metadata is best-effort; checkout should still be possible with a URL.
  }

  return inferProjectMetadataFromUrl(pageUrl.toString());
}
