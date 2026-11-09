/**
 * Minimal in-process token bucket (spec §15 rate limits). Good enough for a single instance in
 * development; production needs a shared store (e.g. Redis) and bot protection in front.
 */
const buckets = new Map<string, { tokens: number; updated: number }>();

export function rateLimit(key: string, { capacity, perMinute }: { capacity: number; perMinute: number }): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: capacity, updated: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.updated) / 60_000) * perMinute);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 50_000) buckets.clear();
  return true;
}
