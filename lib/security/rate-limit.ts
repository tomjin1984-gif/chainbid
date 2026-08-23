interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(args: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): { allowed: true; remaining: number } | { allowed: false; retryAfterMs: number } {
  const now = args.now ?? Date.now();
  const bucket = buckets.get(args.key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(args.key, { count: 1, resetAt: now + args.windowMs });
    return { allowed: true, remaining: args.limit - 1 };
  }

  if (bucket.count >= args.limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, remaining: args.limit - bucket.count };
}

export function rateLimitKey(request: Request, scope: string, discriminator = "global") {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  return `${scope}:${ip}:${discriminator}`;
}
