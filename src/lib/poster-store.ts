// Ultimul poster generat în browser, per proprietate (doar în memorie, nu se salvează).
const posters = new Map<string, Blob>();
const listeners = new Set<() => void>();

export function setLatestPoster(propertyId: string, blob: Blob) {
  posters.set(propertyId, blob);
  listeners.forEach((l) => l());
}
export function getLatestPoster(propertyId: string): Blob | null {
  return posters.get(propertyId) ?? null;
}
export function subscribePosters(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
