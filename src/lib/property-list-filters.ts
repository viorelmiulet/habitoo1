import { z } from "zod";

export type PropertyListFilters = {
  q: string;
  status: string;
  transaction: string;
  type: string;
  city: string;
  district: string;
  agent: string;
  source: string;
  mine: boolean;
  favoritesOnly: boolean;
  showArchived: boolean;
  priceMin: string;
  priceMax: string;
  surfaceMin: string;
  surfaceMax: string;
  rooms: string;
  bathrooms: string;
  floorMin: string;
  floorMax: string;
  addedAfter: string;
  addedBefore: string;
  portal: string;
};

export const emptyPropertyListFilters: PropertyListFilters = {
  q: "",
  status: "all",
  transaction: "all",
  type: "all",
  city: "all",
  district: "all",
  agent: "all",
  source: "all",
  mine: false,
  favoritesOnly: false,
  showArchived: false,
  priceMin: "",
  priceMax: "",
  surfaceMin: "",
  surfaceMax: "",
  rooms: "",
  bathrooms: "",
  floorMin: "",
  floorMax: "",
  addedAfter: "",
  addedBefore: "",
  portal: "all",
};

export const PROPERTY_LIST_DEFAULT_SORT = "created_desc" as const;
export const PROPERTY_LIST_DEFAULT_VIEW = "list" as const;

const optionalSearchString = z.preprocess(
  (value) => typeof value === "string" && value.length > 0 ? value : undefined,
  z.string().optional(),
);
const optionalSearchBoolean = z.preprocess(
  (value) => value === true || value === "true" ? true : undefined,
  z.boolean().optional(),
);
const optionalSearchPage = z.preprocess(
  (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 1 ? number : undefined;
  },
  z.number().int().optional(),
);

export const propertyListSearchSchema = z.object({
  q: optionalSearchString,
  status: optionalSearchString,
  transaction: optionalSearchString,
  type: optionalSearchString,
  city: optionalSearchString,
  district: optionalSearchString,
  agent: optionalSearchString,
  source: optionalSearchString,
  mine: optionalSearchBoolean,
  favoritesOnly: optionalSearchBoolean,
  showArchived: optionalSearchBoolean,
  priceMin: optionalSearchString,
  priceMax: optionalSearchString,
  surfaceMin: optionalSearchString,
  surfaceMax: optionalSearchString,
  rooms: optionalSearchString,
  bathrooms: optionalSearchString,
  floorMin: optionalSearchString,
  floorMax: optionalSearchString,
  addedAfter: optionalSearchString,
  addedBefore: optionalSearchString,
  portal: optionalSearchString,
  sort: optionalSearchString,
  page: optionalSearchPage,
  view: optionalSearchString,
});

export type PropertyListSearch = z.infer<typeof propertyListSearchSchema>;
export type PropertyListSort =
  | "created_desc" | "updated_desc" | "price_asc" | "price_desc" | "surface_asc" | "surface_desc";
export type PropertyListView = "list" | "grid";

const propertyListSorts = new Set<PropertyListSort>([
  "created_desc", "updated_desc", "price_asc", "price_desc", "surface_asc", "surface_desc",
]);

export function propertyListStateFromSearch(search: PropertyListSearch): {
  filters: PropertyListFilters;
  sort: PropertyListSort;
  page: number;
  view: PropertyListView;
} {
  const filters = { ...emptyPropertyListFilters };
  for (const key of Object.keys(filters) as (keyof PropertyListFilters)[]) {
    const value = search[key];
    if (typeof value === typeof filters[key]) (filters as Record<string, unknown>)[key] = value;
  }
  return {
    filters,
    sort: propertyListSorts.has(search.sort as PropertyListSort)
      ? search.sort as PropertyListSort
      : PROPERTY_LIST_DEFAULT_SORT,
    page: search.page ?? 1,
    view: search.view === "grid" ? "grid" : PROPERTY_LIST_DEFAULT_VIEW,
  };
}

export function propertyListSearchFromState(
  filters: PropertyListFilters,
  sort: PropertyListSort,
  page: number,
  view: PropertyListView,
): PropertyListSearch {
  const search: PropertyListSearch = {};
  for (const key of Object.keys(emptyPropertyListFilters) as (keyof PropertyListFilters)[]) {
    if (filters[key] !== emptyPropertyListFilters[key]) {
      (search as Record<string, unknown>)[key] = filters[key];
    }
  }
  if (sort !== PROPERTY_LIST_DEFAULT_SORT) search.sort = sort;
  if (page > 1) search.page = page;
  if (view !== PROPERTY_LIST_DEFAULT_VIEW) search.view = view;
  return search;
}

export const PROPERTY_TYPE_TABS = [
  { value: "all", label: "Toate" },
  { value: "apartment", label: "Apartamente" },
  { value: "studio", label: "Garsoniere" },
  { value: "house", label: "Case / vile" },
  { value: "land", label: "Terenuri" },
  { value: "commercial", label: "Spații comerciale" },
  { value: "office", label: "Birouri" },
  { value: "industrial", label: "Industrial" },
] as const;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatThousands(value: string): string {
  const digits = digitsOnly(value);
  return digits ? new Intl.NumberFormat("ro-RO").format(Number(digits)) : "";
}

/** Acceptă și filtrele salvate înainte ca etajul să devină interval. */
export function normalizeSavedPropertyFilters(
  config: Record<string, unknown>,
): PropertyListFilters {
  const legacyFloor = typeof config.floor === "string" ? config.floor : "";
  return {
    ...emptyPropertyListFilters,
    ...(config as Partial<PropertyListFilters>),
    floorMin:
      typeof config.floorMin === "string" ? config.floorMin : legacyFloor,
    floorMax:
      typeof config.floorMax === "string" ? config.floorMax : legacyFloor,
  };
}

export function isAtLeastFilter(value: string): boolean {
  return value.endsWith("+");
}

export function numericFilterValue(value: string): number {
  return Number(value.replace("+", ""));
}

export function shouldShowAdvancedFilters(expanded: boolean): boolean {
  return expanded;
}

export type PropertyFilterMetadataRow = {
  city: string | null;
  district: string | null;
  source: string | null;
};

export type CountedFilterOption = {
  value: string;
  label: string;
  count: number;
};

export type CityFilterOption = CountedFilterOption & {
  rawValues: string[];
};

/** Unifică variantele istorice fără să modifice valorile stocate. */
export function normalizeCityFilterValue(value: string): string {
  return value
    .replace(/[Şş]/g, (character) => character === "Ş" ? "Ș" : "ș")
    .replace(/[Ţţ]/g, (character) => character === "Ţ" ? "Ț" : "ț")
    .replace(/\s+Sectorul\s+\d+\s*$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCityFilterOptions(rows: PropertyFilterMetadataRow[]): CityFilterOption[] {
  const groups = new Map<string, CityFilterOption>();
  for (const row of rows) {
    const raw = row.city?.trim();
    if (!raw) continue;
    const label = normalizeCityFilterValue(raw);
    const key = label.toLocaleLowerCase("ro-RO");
    const current = groups.get(key);
    if (current) {
      current.count += 1;
      if (!current.rawValues.includes(raw)) current.rawValues.push(raw);
    } else {
      groups.set(key, { value: label, label, count: 1, rawValues: [raw] });
    }
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "ro-RO"));
}

export function cityRawValues(options: CityFilterOption[], selectedCity: string): string[] {
  if (selectedCity === "all") return [];
  const selectedKey = normalizeCityFilterValue(selectedCity).toLocaleLowerCase("ro-RO");
  return options.find((option) => option.value.toLocaleLowerCase("ro-RO") === selectedKey)?.rawValues ?? [];
}

export function buildDistrictFilterOptions(
  rows: PropertyFilterMetadataRow[],
  selectedCity: string,
  cityOptions: CityFilterOption[],
): CountedFilterOption[] {
  const allowedCities = new Set(cityRawValues(cityOptions, selectedCity));
  const counts = new Map<string, number>();
  for (const row of rows) {
    const district = row.district?.trim();
    if (!district || (selectedCity !== "all" && (!row.city || !allowedCities.has(row.city.trim())))) continue;
    counts.set(district, (counts.get(district) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, "ro-RO"));
}

export function formatPropertySourceLabel(source: string): string {
  const normalized = source.trim().toLocaleLowerCase("ro-RO");
  if (normalized === "immoflux") return "Import IMMOFLUX";
  if (normalized === "manual") return "Adăugată manual";
  return normalized ? normalized.charAt(0).toLocaleUpperCase("ro-RO") + normalized.slice(1) : source;
}

function bucharestOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
  return Math.round((representedAsUtc - instant.getTime()) / 1_000) * 1_000;
}

/** Transformă o dată din formular în limita exactă a zilei din România. */
export function romaniaDateBoundary(date: string, boundary: "start" | "end"): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const [, year, month, day] = match;
  const localAsUtc = Date.UTC(
    Number(year), Number(month) - 1, Number(day),
    boundary === "end" ? 23 : 0,
    boundary === "end" ? 59 : 0,
    boundary === "end" ? 59 : 0,
    boundary === "end" ? 999 : 0,
  );
  const offsetProbe = new Date(Date.UTC(
    Number(year), Number(month) - 1, Number(day),
    boundary === "end" ? 23 : 0,
    boundary === "end" ? 59 : 0,
    boundary === "end" ? 59 : 0,
  ));
  const instant = new Date(localAsUtc - bucharestOffsetMs(offsetProbe));
  return instant.toISOString();
}
