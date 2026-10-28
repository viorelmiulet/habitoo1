/**
 * Hărțile raportului ACP — calcul pur (fără rețea): încadrarea punctelor,
 * zoom-ul, tile-urile necesare și poziția pinilor. Coordonatele vin doar din
 * snapshot-ul versiunii; nicio adresă nu este geocodată.
 */

export type GeoPoint = { lat: number; lng: number };
export type MapPinInput = GeoPoint & { id: string; label: string; kind: "subject" | "comparable" };
export type MapTile = { z: number; x: number; y: number; left: number; top: number; size: number };
export type MapPin = { id: string; label: string; kind: "subject" | "comparable"; x: number; y: number; offset: boolean };
export type MapLayout = { zoom: number; tiles: MapTile[]; pins: MapPin[] };

export const MAP_STREET_ZOOM = 17;
export const MAP_NEIGHBORHOOD_ZOOM = 15;
export const MAP_MIN_ZOOM = 10;
/** Distanța (pt) sub care doi pini se suprapun și sunt decalați. */
export const MAP_PIN_OVERLAP = 14;
const OFFSET_RADIUS = 11;

/** Coordonată validă din snapshot, altfel null (inclusiv 0,0). */
export function snapshotGeo(subject: { latitude?: unknown; longitude?: unknown } | null | undefined): GeoPoint | null {
  const lat = Number(subject?.latitude);
  const lng = Number(subject?.longitude);
  if (subject?.latitude == null || subject?.longitude == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -85 || lat > 85 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** Proiecție Web Mercator în pixeli „lume” la zoom z (tile = 256 px). */
export function project(p: GeoPoint, z: number): { x: number; y: number } {
  const scale = 256 * 2 ** z;
  const s = Math.sin((p.lat * Math.PI) / 180);
  return {
    x: ((p.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

/**
 * Cel mai mare zoom la care toate punctele încap în cadru, cu margine.
 * Un singur punct sau puncte identice → zoom de stradă.
 */
export function fitZoom(
  points: GeoPoint[],
  width: number,
  height: number,
  opts: { padding: number; tileSize: number; maxZoom?: number; minZoom?: number },
): number {
  const maxZoom = opts.maxZoom ?? MAP_STREET_ZOOM;
  const minZoom = opts.minZoom ?? MAP_MIN_ZOOM;
  const k = opts.tileSize / 256;
  for (let z = maxZoom; z > minZoom; z--) {
    const ps = points.map((p) => project(p, z));
    const w = (Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x))) * k;
    const h = (Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y))) * k;
    if (w <= width - opts.padding * 2 && h <= height - opts.padding * 2) return z;
  }
  return minZoom;
}

/** Decalează în cerc pinii care cad practic în același loc, ca numerele să se vadă. */
export function spreadOverlapping(pins: MapPin[], threshold = MAP_PIN_OVERLAP, radius = OFFSET_RADIUS): MapPin[] {
  const groups: number[][] = [];
  const seen = new Set<number>();
  pins.forEach((p, i) => {
    if (seen.has(i)) return;
    const g = [i];
    seen.add(i);
    pins.forEach((q, j) => {
      if (seen.has(j)) return;
      if (Math.hypot(p.x - q.x, p.y - q.y) < threshold) {
        g.push(j);
        seen.add(j);
      }
    });
    groups.push(g);
  });
  const out = pins.map((p) => ({ ...p }));
  for (const g of groups) {
    if (g.length < 2) continue;
    const cx = g.reduce((s, i) => s + pins[i]!.x, 0) / g.length;
    const cy = g.reduce((s, i) => s + pins[i]!.y, 0) / g.length;
    const r = Math.max(radius, (g.length * MAP_PIN_OVERLAP) / (2 * Math.PI));
    g.forEach((i, n) => {
      const a = -Math.PI / 2 + (2 * Math.PI * n) / g.length;
      out[i] = { ...out[i]!, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, offset: true };
    });
  }
  return out;
}

/** Calculează harta: zoom (fix sau încadrat), tile-uri și pini în coordonate de cadru. */
export function layoutMap(
  points: MapPinInput[],
  width: number,
  height: number,
  opts: { padding?: number; tileSize?: number; zoom?: number; maxZoom?: number } = {},
): MapLayout | null {
  if (points.length === 0) return null;
  const tileSize = opts.tileSize ?? 256;
  const padding = opts.padding ?? 40;
  const zoom = opts.zoom ?? fitZoom(points, width, height, { padding, tileSize, maxZoom: opts.maxZoom });
  const k = tileSize / 256;
  const ps = points.map((p) => project(p, zoom));
  const cx = (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x))) / 2;
  const cy = (Math.min(...ps.map((p) => p.y)) + Math.max(...ps.map((p) => p.y))) / 2;
  // Colțul stânga-sus al cadrului, în pixeli lume.
  const ox = cx - width / 2 / k;
  const oy = cy - height / 2 / k;
  const n = 2 ** zoom;
  const tiles: MapTile[] = [];
  for (let ty = Math.floor(oy / 256); ty * 256 < oy + height / k; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(ox / 256); tx * 256 < ox + width / k; tx++) {
      tiles.push({
        z: zoom,
        x: ((tx % n) + n) % n,
        y: ty,
        left: (tx * 256 - ox) * k,
        top: (ty * 256 - oy) * k,
        size: tileSize,
      });
    }
  }
  const pins = spreadOverlapping(
    points.map((p, i) => ({
      id: p.id,
      label: p.label,
      kind: p.kind,
      x: (ps[i]!.x - ox) * k,
      y: (ps[i]!.y - oy) * k,
      offset: false,
    })),
  );
  return { zoom, tiles, pins };
}

export const tileKey = (t: { z: number; x: number; y: number }) => `${t.z}/${t.x}/${t.y}`;
