import {
  PROPERTY_STATUSES,
  isAtLeastFilter,
  numericFilterValue,
  propertyTypeClause,
  romaniaDateBoundary,
  selectedStatuses,
  type PropertyListFilters,
} from "@/lib/property-list-filters";
import { parsePlaceChoices, placeToken, serializePlaces, type PlaceChoice, type SearchPlaceOption } from "@/lib/search-places";

/** Ordinea câmpurilor pe cele patru coloane ale panoului de filtre. */
export const PROPERTY_FILTER_COLUMNS = [
  ["Județ", "Localități", "Zonă", "Stradă"],
  ["Tip proprietate", "Tip tranzacție", "Camere", "Suprafață utilă", "Preț"],
  ["Valabilitate", "Adăugat între", "Modificat între"],
  ["Cuvinte cheie", "Destinație", "Promovare", "Alte filtre"],
] as const;

/** Subsetul de metode PostgREST folosite de filtre (ușor de verificat în teste). */
export interface FilterableQuery<Q> {
  eq(column: string, value: unknown): Q;
  in(column: string, values: unknown[]): Q;
  gte(column: string, value: unknown): Q;
  lte(column: string, value: unknown): Q;
  is(column: string, value: null): Q;
  or(filter: string): Q;
}

const clean = (value: string) => value.replace(/[%,()"\\]/g, " ").trim();

/**
 * Aplică filtrele panoului (fără geografie, favorite, portaluri și promovare,
 * care se rezolvă separat). Returnează interogarea extinsă.
 */
export function applyPropertyFilterClauses<Q extends FilterableQuery<Q>>(
  query: Q,
  filters: PropertyListFilters,
  ctx: { agentClause: { kind: "none" } | { kind: "unassigned" } | { kind: "agent"; id: string }; userId?: string | null },
): Q {
  let q = query;
  const statuses = selectedStatuses(filters);
  if (statuses.length < PROPERTY_STATUSES.length) q = q.in("status", statuses);
  if (filters.transaction !== "all") q = q.eq("transaction_kind", filters.transaction);
  const type = propertyTypeClause(filters);
  if (type.kind === "eq") q = q.eq("property_type", type.value);
  else if (type.kind === "in") q = q.in("property_type", type.values);
  if (filters.source !== "all") q = q.eq("source", filters.source);
  if (filters.destination !== "all") q = q.eq("destination", filters.destination);
  if (ctx.agentClause.kind === "unassigned") q = q.is("assigned_to", null);
  else if (ctx.agentClause.kind === "agent") q = q.eq("assigned_to", ctx.agentClause.id);
  if (filters.mine && ctx.userId) q = q.eq("assigned_to", ctx.userId);
  if (filters.priceMin) q = q.gte("price", Number(filters.priceMin));
  if (filters.priceMax) q = q.lte("price", Number(filters.priceMax));
  if (filters.surfaceMin) q = q.gte("surface", Number(filters.surfaceMin));
  if (filters.surfaceMax) q = q.lte("surface", Number(filters.surfaceMax));
  if (filters.rooms)
    q = isAtLeastFilter(filters.rooms) ? q.gte("rooms", numericFilterValue(filters.rooms)) : q.eq("rooms", numericFilterValue(filters.rooms));
  if (filters.bathrooms)
    q = isAtLeastFilter(filters.bathrooms) ? q.gte("bathrooms", numericFilterValue(filters.bathrooms)) : q.eq("bathrooms", numericFilterValue(filters.bathrooms));
  if (filters.floorMin) q = q.gte("floor", Number(filters.floorMin));
  if (filters.floorMax) q = q.lte("floor", Number(filters.floorMax));
  if (filters.addedAfter) q = q.gte("created_at", romaniaDateBoundary(filters.addedAfter, "start"));
  if (filters.addedBefore) q = q.lte("created_at", romaniaDateBoundary(filters.addedBefore, "end"));
  if (filters.updatedAfter) q = q.gte("updated_at", romaniaDateBoundary(filters.updatedAfter, "start"));
  if (filters.updatedBefore) q = q.lte("updated_at", romaniaDateBoundary(filters.updatedBefore, "end"));
  const text = clean(filters.q);
  const street = clean(filters.street);
  const textExpr = text ? `title.ilike.%${text}%,reference.ilike.%${text}%,address.ilike.%${text}%,city.ilike.%${text}%,district.ilike.%${text}%` : "";
  const streetExpr = street ? `street.ilike.%${street}%,address.ilike.%${street}%` : "";
  if (textExpr && streetExpr) q = q.or(`and(or(${textExpr}),or(${streetExpr}))`);
  else if (textExpr || streetExpr) q = q.or(textExpr || streetExpr);
  return q;
}

/** Geografia panoului: județ (cheie), localități și zone (token-uri de loc). */
export type GeographySelection = { county: string; cities: string[]; zones: string[] };

export function geographyFromPlaces(locuri: string): GeographySelection {
  const choices = parsePlaceChoices(locuri);
  const counties = [...new Set(choices.map((c) => c.county).filter(Boolean))];
  const cities = new Set<string>();
  const zones: string[] = [];
  for (const c of choices) {
    if (c.kind === "city") cities.add(placeToken(c));
    if (c.kind === "zone") {
      zones.push(placeToken(c));
      cities.add(placeToken({ kind: "city", county: c.county, city: c.city, zone: "" }));
    }
  }
  return { county: counties.length === 1 ? counties[0] : "", cities: [...cities], zones };
}

export function placesFromGeography(selection: GeographySelection): string {
  const decode = (tokens: string[]) => tokens.flatMap((t) => parsePlaceChoices(`[${t}]`));
  if (selection.zones.length) return serializePlaces(decode(selection.zones));
  if (selection.cities.length) return serializePlaces(decode(selection.cities));
  if (selection.county) return serializePlaces([{ kind: "county", county: selection.county, city: "", zone: "" } satisfies PlaceChoice]);
  return "";
}

export function countyOptions(options: SearchPlaceOption[]) {
  return options.filter((o) => o.choice.kind === "county").map((o) => ({ value: o.choice.county, label: o.label.replace(/\s*\(tot județul\)$/u, "") }));
}

export function cityOptions(options: SearchPlaceOption[], county: string) {
  return options.filter((o) => o.choice.kind === "city" && (!county || o.choice.county === county));
}

export function zoneOptions(options: SearchPlaceOption[], county: string, cities: string[]) {
  const picked = cities.flatMap((t) => parsePlaceChoices(`[${t}]`));
  return options.filter((o) => o.choice.kind === "zone" && (!county || o.choice.county === county) &&
    (picked.length === 0 || picked.some((c) => c.county === o.choice.county && c.city === o.choice.city)));
}

/** Numărul opțiunilor active din „Alte filtre”. */
export function otherFiltersCount(f: PropertyListFilters, showAgent: boolean): number {
  return [
    showAgent && f.agent !== "all",
    f.portal !== "all",
    Boolean(f.bathrooms),
    Boolean(f.floorMin || f.floorMax),
    f.source !== "all",
    f.mine,
    f.favoritesOnly,
  ].filter(Boolean).length;
}
