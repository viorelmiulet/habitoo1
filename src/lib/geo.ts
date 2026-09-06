/**
 * Aproximarea coordonatelor pentru anunțurile fără „locație exactă”.
 *
 * Metoda folosită este cea standard la portalurile imobiliare: coordonatele
 * reale sunt deplasate („jitter”) cu un offset pseudo-aleator, dar DETERMINIST
 * (derivat din id-ul proprietății), uniform distribuit într-un disc de rază
 * fixă în jurul poziției reale. Determinismul garantează:
 *   - aceleași coordonate aproximative în CRM, pe site și în toate feed-urile;
 *   - imposibilitatea de a deduce punctul exact prin medierea mai multor cereri.
 */
export const APPROX_RADIUS_M = 300;

/** Hash stabil (FNV-1a) pentru a deriva un offset repetabil din id. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export type Coords = { lat: number; lng: number };

/** Deplasează coordonatele într-un punct aleator-determinist din discul de rază `radiusM`. */
export function approximateCoords(
  lat: number,
  lng: number,
  seed: string,
  radiusM: number = APPROX_RADIUS_M,
): Coords {
  const h = hashSeed(seed);
  const angle = ((h % 36000) / 36000) * 2 * Math.PI;
  // Rază uniformă în disc: r = R * sqrt(u)
  const u = ((hashSeed(`${seed}:r`) % 100000) + 1) / 100001;
  const r = radiusM * Math.sqrt(u);

  const dLat = (r * Math.cos(angle)) / 111_320;
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLng = (r * Math.sin(angle)) / (111_320 * cosLat);

  return {
    lat: Number((lat + dLat).toFixed(6)),
    lng: Number((lng + dLng).toFixed(6)),
  };
}

/**
 * Coordonatele care pot fi arătate/publicate pentru o proprietate:
 * exacte când `location_precise` e adevărat, altfel aproximate.
 */
export function publicCoords(p: {
  id: string;
  lat: number | null;
  lng: number | null;
  location_precise?: boolean | null;
}): (Coords & { precise: boolean; radiusM: number }) | null {
  if (typeof p.lat !== "number" || typeof p.lng !== "number") return null;
  if (p.location_precise) return { lat: p.lat, lng: p.lng, precise: true, radiusM: 0 };
  const approx = approximateCoords(p.lat, p.lng, p.id);
  return { ...approx, precise: false, radiusM: APPROX_RADIUS_M };
}
