import { z } from "zod";
import { geographyKey } from "./private-listing-geography";
import { titleCaseRo } from "./ro-normalize";

export const placeChoiceSchema = z.object({
  kind: z.enum(["county", "city", "zone"]),
  county: z.string().max(100), city: z.string().max(100), zone: z.string().max(100),
});
export type PlaceChoice = z.infer<typeof placeChoiceSchema>;
export type SearchPlaceOption = { value: string; label: string; count: number; choice: PlaceChoice };
export type SearchPlaceRow = { county?: string | null; city?: string | null; zone?: string | null; neighborhood?: string | null; district?: string | null };
export const placeCityKey = (v?: string | null) => /^sector(ul)? [1-6]$/.test(geographyKey(v)) ? "bucuresti" : geographyKey((v ?? "").replace(/\s+Sector(ul)?\s+[1-6]\s*$/iu, ""));
export const placeToken = (c: PlaceChoice) => JSON.stringify(c);
export function parsePlaceChoices(value?: string): PlaceChoice[] {
  if (!value) return [];
  try {
    const parsed = z.array(placeChoiceSchema).parse(JSON.parse(value));
    return [...new Map(parsed.map(c => {
      const next = { kind: c.kind, county: geographyKey(c.county), city: placeCityKey(c.city), zone: geographyKey(c.zone) };
      return [placeToken(next), next];
    })).values()];
  } catch { return []; }
}
export const serializePlaces = (choices: PlaceChoice[]) => choices.length ? JSON.stringify(choices) : "";
export function legacyPlaceChoices(county?: string, city?: string, zones?: string | string[]): PlaceChoice[] {
  const ck = geographyKey(county === "all" ? "" : county);
  const cityKey = placeCityKey(city === "all" ? "" : city);
  const z = (Array.isArray(zones) ? zones : zones && zones !== "all" ? [zones] : []).map(geographyKey).filter(Boolean);
  if (z.length) return z.map(zone => ({ kind: "zone", county: ck, city: cityKey, zone }));
  return cityKey ? [{ kind: "city", county: ck, city: cityKey, zone: "" }] : ck ? [{ kind: "county", county: ck, city: "", zone: "" }] : [];
}
export function buildSearchPlaces(rows: SearchPlaceRow[]): SearchPlaceOption[] {
  const options = new Map<string, SearchPlaceOption>();
  for (const row of rows) {
    const city = placeCityKey(row.city);
    const county = geographyKey(row.county) || (city === "bucuresti" ? "bucuresti" : "");
    const countyLabel = titleCaseRo(row.county || (county === "bucuresti" ? "București" : ""));
    const cityLabel = city === "bucuresti" ? "București" : titleCaseRo((row.city ?? "").replace(/\s+Sector(ul)?\s+[1-6]\s*$/iu, ""));
    const add = (choice: PlaceChoice, label: string) => {
      const value = placeToken(choice); const old = options.get(value);
      options.set(value, { value, choice, label: old?.label ?? label, count: (old?.count ?? 0) + 1 });
    };
    if (county) add({ kind: "county", county, city: "", zone: "" }, `${countyLabel} (tot județul)`);
    if (!city) continue;
    add({ kind: "city", county, city, zone: "" }, `${cityLabel}${countyLabel ? ` — ${countyLabel}` : ""}`);
    const unique = new Map([row.zone, row.neighborhood, row.district].filter((v): v is string => Boolean(v)).map(v => [geographyKey(v), v]));
    for (const [zone, raw] of unique) add({ kind: "zone", county, city, zone }, `${titleCaseRo(raw)} — ${cityLabel}`);
  }
  return [...options.values()].sort((a,b) => a.label.localeCompare(b.label, "ro"));
}
export function placeMatches(row: SearchPlaceRow, choices: PlaceChoice[]): boolean {
  if (!choices.length) return true;
  const city = placeCityKey(row.city), county = geographyKey(row.county) || (city === "bucuresti" ? "bucuresti" : "");
  return choices.some(c => (!c.county || c.county === county) && (c.kind === "county" || !c.city || c.city === city) && (c.kind !== "zone" || [row.zone,row.neighborhood,row.district].some(v => geographyKey(v) === c.zone)));
}
