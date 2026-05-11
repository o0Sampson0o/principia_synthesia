interface Bucket {
  tokens: number;
  resetAt: number;
}

// Per-process in-memory store. Resets on cold start (acceptable for a baseline).
// Upgrade to @upstash/ratelimit when persistent rate limiting is needed.
const buckets = new Map<string, Bucket>();

/**
 * Token-bucket rate limiter. Returns `true` if the request is allowed,
 * `false` if the limit has been exceeded.
 *
 * @param key       Unique key, e.g. `"login:1.2.3.4"` or `"global:1.2.3.4"`
 * @param limit     Max requests per window
 * @param windowMs  Window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { tokens: limit - 1, resetAt: now + windowMs });
    return true;
  }
  if (b.tokens <= 0) return false;
  b.tokens -= 1;
  return true;
}
