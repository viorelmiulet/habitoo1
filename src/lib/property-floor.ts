/**
 * Oglinda în TypeScript a triggerului `properties_sync_floor_surface`.
 * Orice schimbare aici trebuie făcută și în trigger (și invers).
 */
import { floorLabelOptions } from "@/lib/property-taxonomy";

type FloorLabel = (typeof floorLabelOptions)[number];

/** Număr fix pentru fiecare etichetă; `null` = fără număr fix (se păstrează `floor` trimis). */
export const FLOOR_LABEL_NUMBER: Record<FloorLabel, number | null> = {
  Demisol: -1,
  Parter: 0,
  "Parter înalt": 0,
  "Etaj 1": 1,
  "Etaj 2": 2,
  "Etaj 3": 3,
  "Etaj 4": 4,
  "Etaj 5": 5,
  "Etaj 6": 6,
  "Etaj 7": 7,
  "Etaj 8": 8,
  "Etaj 9": 9,
  "Etaj 10+": null,
  "Penultimul etaj": null,
  "Ultimul etaj": null,
  Mansardă: null,
};

export function syncFloor(
  label: string | null,
  floor: number | null,
): { floor: number | null; floor_label: string | null } {
  const l = label?.trim() || null;
  if (l) {
    const fixed = (FLOOR_LABEL_NUMBER as Record<string, number | null | undefined>)[l];
    return { floor_label: label, floor: fixed ?? floor };
  }
  if (floor === null) return { floor, floor_label: label };
  if (floor === -1) return { floor, floor_label: "Demisol" };
  if (floor === 0) return { floor, floor_label: "Parter" };
  if (floor >= 1 && floor <= 9) return { floor, floor_label: `Etaj ${floor}` };
  return { floor, floor_label: null };
}

export function syncSurface(p: {
  usable_surface: number | null;
  built_surface: number | null;
  land_surface: number | null;
  surface: number | null;
}): number | null {
  return p.usable_surface ?? p.built_surface ?? p.land_surface ?? p.surface;
}

/** „Număr etaj” apare (și e obligatoriu) doar pentru etichete fără număr fix. */
export function floorNumberRequired(label: string | null): boolean {
  const l = label?.trim();
  if (!l) return false;
  return (FLOOR_LABEL_NUMBER as Record<string, number | null | undefined>)[l] === null;
}

/**
 * Eticheta etajului pentru afișare (poster, video, fișă, texte social).
 * Acceptă eticheta salvată (deja formatată) sau numărul; nu dublează niciodată „Etaj ”.
 */
export function formatFloorLabel(label: string | null | undefined, floor?: number | string | null): string | null {
  const raw = (label ?? "").toString().trim();
  if (raw) {
    const prefixed = raw.match(/^etaj\s+(.+)$/i);
    if (!prefixed) {
      if (/^-?\d+$/.test(raw)) return formatFloorLabel(null, Number(raw));
      return raw;
    }
    const rest = prefixed[1]!.trim();
    if (/^-?\d+\+?$/.test(rest)) {
      return rest.endsWith("+") ? `Etaj ${rest}` : formatFloorLabel(null, Number(rest));
    }
    return formatFloorLabel(rest, null) ?? null;
  }
  if (floor === null || floor === undefined || floor === "") return null;
  const n = typeof floor === "number" ? floor : Number(String(floor).trim());
  if (!Number.isFinite(n)) return formatFloorLabel(String(floor), null);
  if (n === -1) return "Demisol";
  if (n === 0) return "Parter";
  if (n === 100) return "Mansardă";
  if (n < -1) return "Subsol";
  return `Etaj ${n}`;
}
