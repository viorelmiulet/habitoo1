/**
 * Cache doar pentru sesiune: criterii identice în câteva minute reutilizează
 * același rezultat, ca un agent care ajustează datele să nu solicite repetat
 * portalul partener. Trăiește exclusiv în memoria procesului; nimic persistat.
 */

export const MARKET_QUERY_CACHE_TTL_MS = 3 * 60 * 1000;

type Entry<T> = { value: T; expiresAt: number };

const cache = new Map<string, Entry<unknown>>();

export function marketQueryCacheGet<T>(key: string, now = Date.now()): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function marketQueryCacheSet<T>(key: string, value: T, now = Date.now()): void {
  cache.set(key, { value, expiresAt: now + MARKET_QUERY_CACHE_TTL_MS });
}

export function marketQueryCacheClear(): void {
  cache.clear();
}
