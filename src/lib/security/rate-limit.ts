type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export function createFixedWindowRateLimiter(options: {
  limit: number;
  maxEntries?: number;
  windowMs: number;
}) {
  const entries = new Map<string, RateLimitEntry>();
  const maxEntries = options.maxEntries ?? 5_000;

  return (key: string, now = Date.now()): RateLimitDecision => {
    const existing = entries.get(key);
    const entry = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + options.windowMs }
      : existing;

    entry.count += 1;
    entries.set(key, entry);

    if (entries.size > maxEntries) {
      for (const [storedKey, storedEntry] of entries) {
        if (storedEntry.resetAt <= now || entries.size > maxEntries) entries.delete(storedKey);
        if (entries.size <= maxEntries) break;
      }
    }

    return {
      allowed: entry.count <= options.limit,
      limit: options.limit,
      remaining: Math.max(0, options.limit - entry.count),
      resetAt: entry.resetAt,
    };
  };
}
