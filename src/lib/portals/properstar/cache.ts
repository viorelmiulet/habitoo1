/**
 * Memoria scurtă a feedului Properstar, separată de constructorul de feed ca
 * orice cale de scriere să poată goli cache-ul fără să încarce codul server-only.
 * Un feed gol NU se memorează niciodată: o ofertă corectată trebuie să apară la
 * următoarea citire, nu după expirare.
 */
export type CachedFeed<T> = { expiresAt: number; build: T };

const cache = new Map<string, CachedFeed<unknown>>();

export function readProperstarCache<T>(organizationId: string, now: number): T | null {
  const hit = cache.get(organizationId);
  if (!hit || hit.expiresAt <= now) return null;
  return hit.build as T;
}

export function writeProperstarCache(
  organizationId: string,
  expiresAt: number,
  build: unknown,
): void {
  cache.set(organizationId, { expiresAt, build });
}

export function clearProperstarCache(organizationId?: string): void {
  if (organizationId) cache.delete(organizationId);
  else cache.clear();
}
