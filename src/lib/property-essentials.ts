/**
 * Regula unică „fișă incompletă” (banda AI din Proprietăți + recomandarea de pe Acasă).
 * Pură: primește rândul din `properties` citit cu ESSENTIALS_COLUMNS.
 */
const FLOOR_TYPES = new Set(["apartment", "apartament", "studio", "office", "birou", "spatiu_comercial", "commercial"]);
/** Aceleași tipuri ca la „camere” în property-completeness.ts. */
const ROOM_TYPES = new Set(["apartment", "studio", "house"]);

/** Câmpurile secțiunii „Dotări” din propertyFeatureSections (paritate verificată în test). */
export const AMENITY_FIELDS = [
  "furnishing", "additional_spaces", "kitchen_features", "metering", "appliances",
  "building_amenities", "street_arrangement", "views", "misc_features",
] as const;

export const ESSENTIALS_COLUMNS = [
  "id", "floor", "surface", "usable_surface", "land_surface", "rooms", "property_type", "features", ...AMENITY_FIELDS,
].join(",");

export type EssentialsRow = {
  floor?: number | null; surface?: number | null; usable_surface?: number | null; land_surface?: number | null;
  rooms?: number | null; property_type?: string | null; features?: string[] | null;
} & { [K in (typeof AMENITY_FIELDS)[number]]?: string | string[] | null };

const filled = (v: unknown) => Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : v != null;
const positive = (v: number | null | undefined) => typeof v === "number" && v > 0;

export function missingEssentials(p: EssentialsRow): string[] {
  const missing: string[] = [];
  const type = p.property_type || "apartment";
  if (FLOOR_TYPES.has(type) && p.floor == null) missing.push("etajul");
  const surface = type === "land" ? p.land_surface : (p.usable_surface ?? p.surface);
  if (!positive(surface)) missing.push("suprafața");
  if (ROOM_TYPES.has(type) && !positive(p.rooms)) missing.push("camerele");
  if (!filled(p.features) && !AMENITY_FIELDS.some((f) => filled(p[f]))) missing.push("dotările");
  return missing;
}
