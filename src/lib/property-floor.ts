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
