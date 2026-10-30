import { isListPageSize } from "@/lib/list-page-size";
import { z } from "zod";

export type PropertyListFilters = {
  q: string;
  status: string;
  transaction: string;
  type: string;
  locuri: string;
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
  /** Filtrul „Promovare”: valori separate prin virgulă (any, none, imobiliare_ro:<serviciu>, <portal>:promoted). */
  promotion: string;
  /** Tab-ul de categorie (all, apartments, houses, land, office, commercial, industrial). */
  tab: string;
  street: string;
  /** Valabilitate: statusuri separate prin virgulă; gol = toate fără Arhivat. */
  statuses: string;
  updatedAfter: string;
  updatedBefore: string;
  destination: string;
};

export const emptyPropertyListFilters: PropertyListFilters = {
  q: "",
  status: "all",
  transaction: "all",
  type: "all",
  locuri: "",
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
  promotion: "",
  tab: "all",
  street: "",
  statuses: "",
  updatedAfter: "",
  updatedBefore: "",
  destination: "all",
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
  republicare: z.string().uuid().optional().catch(undefined),
  q: optionalSearchString,
  status: optionalSearchString,
  transaction: optionalSearchString,
  type: optionalSearchString,
  locuri: optionalSearchString,
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
  promotion: optionalSearchString,
  tab: optionalSearchString,
  street: optionalSearchString,
  statuses: optionalSearchString,
  updatedAfter: optionalSearchString,
  updatedBefore: optionalSearchString,
  destination: optionalSearchString,
  sort: optionalSearchString,
  page: optionalSearchPage,
  perPagina: z.preprocess(
    (value) => (isListPageSize(Number(value)) ? Number(value) : undefined),
    z.number().int().optional(),
  ),
  view: optionalSearchString,
});

export type PropertyListSearch = z.infer<typeof propertyListSearchSchema>;
export type PropertyListSort =
  | "created_desc" | "updated_desc" | "price_asc" | "price_desc" | "surface_asc" | "surface_desc";
export type PropertyListView = "list" | "grid" | "publish";

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
    filters: migrateLegacyStatusFilters(filters),
    sort: propertyListSorts.has(search.sort as PropertyListSort)
      ? search.sort as PropertyListSort
      : PROPERTY_LIST_DEFAULT_SORT,
    page: search.page ?? 1,
    view: search.view === "grid" || search.view === "publish" ? search.view : PROPERTY_LIST_DEFAULT_VIEW,
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
  { value: "all", label: "Toate", types: ["apartment", "studio", "house", "land", "office", "commercial", "industrial"] },
  { value: "apartments", label: "Apartamente", types: ["apartment", "studio"] },
  { value: "houses", label: "Case / Vile", types: ["house"] },
  { value: "land", label: "Terenuri", types: ["land"] },
  { value: "office", label: "Spații birouri", types: ["office"] },
  { value: "commercial", label: "Spații comerciale", types: ["commercial"] },
  { value: "industrial", label: "Spații industriale", types: ["industrial"] },
] as const;

/** Tab-ul afișat: cel ales sau, pentru linkurile vechi cu `type`, tab-ul tipului. */
export function activePropertyTab(filters: Pick<PropertyListFilters, "tab" | "type">): string {
  if (filters.tab !== "all" && PROPERTY_TYPE_TABS.some((t) => t.value === filters.tab)) return filters.tab;
  if (filters.type === "all") return "all";
  return PROPERTY_TYPE_TABS.find((t) => t.value !== "all" && (t.types as readonly string[]).includes(filters.type))?.value ?? "all";
}

export function propertyTabTypes(tab: string): string[] {
  return [...(PROPERTY_TYPE_TABS.find((t) => t.value === tab)?.types ?? PROPERTY_TYPE_TABS[0].types)];
}

/** Tipurile cerute în interogare: tipul ales sau toate tipurile tab-ului. */
export function propertyTypeClause(filters: Pick<PropertyListFilters, "tab" | "type">): { kind: "none" } | { kind: "eq"; value: string } | { kind: "in"; values: string[] } {
  if (filters.type !== "all") return { kind: "eq", value: filters.type };
  const tab = activePropertyTab(filters);
  return tab === "all" ? { kind: "none" } : { kind: "in", values: propertyTabTypes(tab) };
}

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
  return migrateLegacyStatusFilters({
    ...emptyPropertyListFilters,
    ...(config as Partial<PropertyListFilters>),
    floorMin:
      typeof config.floorMin === "string" ? config.floorMin : legacyFloor,
    floorMax:
      typeof config.floorMax === "string" ? config.floorMax : legacyFloor,
  });
}

/** Ordinea statusurilor în „Valabilitate”. */
export const PROPERTY_STATUSES = ["draft", "active", "reserved", "negotiation", "sold", "rented", "expired", "archived"] as const;
export const DEFAULT_PROPERTY_STATUSES: string[] = PROPERTY_STATUSES.filter((s) => s !== "archived");

/**
 * Filtrele vechi `status` și `showArchived` devin „Valabilitate”:
 * `status=x` → doar x (plus Arhivat cu `showArchived`); `showArchived` singur → toate.
 */
export function migrateLegacyStatusFilters(filters: PropertyListFilters): PropertyListFilters {
  if (filters.status === "all" && !filters.showArchived) return filters;
  const base = filters.statuses ? filters.statuses.split(",") : filters.status !== "all" ? [filters.status] : [...DEFAULT_PROPERTY_STATUSES];
  if (filters.showArchived) base.push("archived");
  return { ...filters, status: "all", showArchived: false, statuses: serializeStatuses(base) };
}

/** Statusurile selectate; implicit toate fără Arhivat. */
export function selectedStatuses(filters: Pick<PropertyListFilters, "statuses">): string[] {
  if (!filters.statuses) return [...DEFAULT_PROPERTY_STATUSES];
  const chosen = new Set(filters.statuses.split(",").map((s) => s.trim()));
  return PROPERTY_STATUSES.filter((s) => chosen.has(s));
}

/** Gol când alegerea e cea implicită, ca URL-ul să rămână curat. */
export function serializeStatuses(values: string[]): string {
  const chosen = new Set(values);
  const ordered = PROPERTY_STATUSES.filter((s) => chosen.has(s));
  if (ordered.length === DEFAULT_PROPERTY_STATUSES.length && !chosen.has("archived")) return "";
  return ordered.join(",");
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

/** Valoarea filtrului „Agent” pentru anunțurile fără agent responsabil. */
export const UNASSIGNED_AGENT_FILTER = "unassigned";

export function agentFilterClause(value: string): { kind: "none" } | { kind: "unassigned" } | { kind: "agent"; id: string } {
  if (!value || value === "all") return { kind: "none" };
  if (value === UNASSIGNED_AGENT_FILTER) return { kind: "unassigned" };
  return { kind: "agent", id: value };
}

/** Filtrul principal „Agent” apare doar pentru cine vede toate anunțurile agenției. */
export function showMainAgentFilter(user: { isAdmin: boolean; isSuperadmin: boolean } | null | undefined): boolean {
  return Boolean(user && (user.isAdmin || user.isSuperadmin));
}

export type AgentFilterOption = { value: string; label: string; count: number };

/** Opțiunile filtrului: membrii (inactivii doar dacă au anunțuri) + „Nealocate”; numărul exclude arhivatele și șterse. */
export function buildAgentFilterOptions(
  members: { id: string; full_name: string | null; is_active: boolean | null }[],
  listings: { assigned_to: string | null; status: string; deleted_at: string | null }[],
): AgentFilterOption[] {
  const counts = new Map<string, number>();
  let unassigned = 0;
  for (const l of listings) {
    if (l.deleted_at || l.status === "archived") continue;
    if (!l.assigned_to) unassigned += 1;
    else counts.set(l.assigned_to, (counts.get(l.assigned_to) ?? 0) + 1);
  }
  const options = members
    .filter((m) => m.is_active !== false || (counts.get(m.id) ?? 0) > 0)
    .map((m) => ({
      value: m.id,
      label: `${m.full_name ?? "Fără nume"}${m.is_active === false ? " (inactiv)" : ""}`,
      count: counts.get(m.id) ?? 0,
    }));
  return [...options, { value: UNASSIGNED_AGENT_FILTER, label: "Nealocate", count: unassigned }];
}
