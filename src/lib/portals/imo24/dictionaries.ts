/**
 * Dicționarele imo24.ro (`GET /enumerari`, `GET /dotari?categorie=`), păstrate
 * în memorie 24 h. Sunt aceleași pentru toate agențiile, deci cheia de cache
 * este doar categoria. Eșecurile nu se păstrează în cache.
 */
import { imo24Request, type Imo24Call, type Imo24Deps } from "./client";
import type { Imo24Category, Imo24Enumerations, Imo24FeatureGroup } from "./mapper";

export const IMO24_DICTIONARY_TTL_MS = 24 * 60 * 60_000;

type Entry<T> = { at: number; value: T };
const cache = new Map<string, Entry<unknown>>();

export function resetImo24DictionaryCache() {
  cache.clear();
}

async function cached<T>(key: string, now: number, load: () => Promise<Imo24Call<T>>): Promise<Imo24Call<T>> {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && now - hit.at < IMO24_DICTIONARY_TTL_MS) {
    return { ok: true, status: 200, data: hit.value, requestId: null, rateLimitRemaining: null } as Imo24Call<T>;
  }
  const result = await load();
  if (result.ok) cache.set(key, { at: now, value: result.data });
  return result;
}

export function getImo24Enumerations(apiKey: string, deps: Imo24Deps = {}) {
  const now = (deps.now ?? Date.now)();
  return cached<Imo24Enumerations>("enumerari", now, () =>
    imo24Request<Imo24Enumerations>(apiKey, "GET", "/enumerari", undefined, deps),
  );
}

export function getImo24Features(apiKey: string, categorie: Imo24Category, deps: Imo24Deps = {}) {
  const now = (deps.now ?? Date.now)();
  return cached<Imo24FeatureGroup[]>(`dotari:${categorie}`, now, () =>
    imo24Request<Imo24FeatureGroup[]>(apiKey, "GET", `/dotari?categorie=${encodeURIComponent(categorie)}`, undefined, deps),
  );
}
