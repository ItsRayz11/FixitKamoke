/**
 * Fixed-window in-memory rate limiter. Good enough for a single server process.
 * On serverless hosting each instance has its own memory, so this only slows abuse; for hard guarantees
 * back it with a shared store (see docs/DECISION_LOG.md, "Rate limiting").
 */
const hits = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return true;
  }
  h.count += 1;
  return h.count <= limit;
}
