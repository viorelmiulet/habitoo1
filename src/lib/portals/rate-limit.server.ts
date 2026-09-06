/**
 * Rate limiting LOCAL, best-effort, pentru operațiile către portaluri.
 * Contorul trăiește în memoria instanței de server (mai multe instanțe =
 * mai multe bucket-uri). Nu pretindem că limitele vin de la portal: sunt
 * limitele noastre de protecție.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export const PORTAL_RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  test: { max: 10, windowMs: 60_000 },
  publish: { max: 60, windowMs: 60_000 },
  update: { max: 60, windowMs: 60_000 },
  withdraw: { max: 60, windowMs: 60_000 },
  sync: { max: 5, windowMs: 60_000 },
  key: { max: 10, windowMs: 60_000 },
};

/** `true` dacă operația trebuie respinsă cu RATE_LIMIT. */
export function portalRateLimited(operation: string, scopeKey: string): boolean {
  const limit = PORTAL_RATE_LIMITS[operation] ?? { max: 30, windowMs: 60_000 };
  const key = `${operation}|${scopeKey}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit.max;
}
