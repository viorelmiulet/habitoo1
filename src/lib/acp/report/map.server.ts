/**
 * Tile-uri OpenStreetMap pentru hărțile raportului ACP. Fără serviciu plătit:
 * PNG-uri standard, User-Agent Habitoo, cache în memorie, un număr mic de
 * tile-uri pe raport și o limită comună de timp. Orice eșec → null.
 */
import { tileKey } from "./map";

export type MapTileLoader = (tile: { z: number; x: number; y: number }) => Promise<Uint8Array | null>;

export const REPORT_MAP_TIMEOUT_MS = 8_000;
export const REPORT_MAP_MAX_TILES = 64;
export const MAP_ATTRIBUTION = "© OpenStreetMap contributors";

const CACHE_LIMIT = 300;
const cache = new Map<string, Uint8Array>();

export const fetchOsmTile: MapTileLoader = async (t) => {
  const key = tileKey(t);
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const res = await fetch(`https://tile.openstreetmap.org/${key}.png`, {
      headers: { "User-Agent": "HabitooCRM/1.0 (+https://habitoo.ro; rapoarte ACP)" },
    });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 2_000_000) return null;
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, bytes);
    return bytes;
  } catch {
    return null;
  }
};

/**
 * Descarcă tile-urile unice (max `REPORT_MAP_MAX_TILES`, 4 în paralel) până la
 * termenul comun; ce nu a sosit la timp rămâne null.
 */
export async function loadMapTiles(
  tiles: { z: number; x: number; y: number }[],
  loader: MapTileLoader = fetchOsmTile,
  timeoutMs = REPORT_MAP_TIMEOUT_MS,
): Promise<Map<string, Uint8Array | null>> {
  const out = new Map<string, Uint8Array | null>();
  const unique = new Map<string, { z: number; x: number; y: number }>();
  for (const t of tiles) if (unique.size < REPORT_MAP_MAX_TILES || unique.has(tileKey(t))) unique.set(tileKey(t), t);
  const queue = [...unique.entries()];
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve();
    }, timeoutMs);
  });
  const worker = async () => {
    for (let next = queue.shift(); next && !expired; next = queue.shift()) {
      const [key, t] = next;
      const bytes = await loader(t).catch(() => null);
      if (!expired) out.set(key, bytes);
    }
  };
  await Promise.race([Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker)), deadline]);
  if (timer) clearTimeout(timer);
  expired = true;
  return out;
}
