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
