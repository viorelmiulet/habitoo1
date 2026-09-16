/**
 * Catalogul La Cheie (`/options`, `/counties`, `/cities?county_id=…`) — pur.
 *
 * Nu hardcodăm niciun id: tipul de proprietate, județul și localitatea se
 * rezolvă din catalogul descărcat de la portal. Dacă o valoare Habitoo nu are
 * corespondent în catalog, publicarea este blocată cu motivul exact — nu se
 * trimite un id ghicit.
 *
 * Id-urile sunt păstrate ca text pentru a nu pierde precizia la valori mari.
 */

export type LaCheieOption = { id: string; name: string };
export type LaCheieCity = LaCheieOption & { countyId: string | null };

export type LaCheieCatalog = {
  /** Grupurile din `/options`, ex. `property_type`, `apartment_type`, `heating`. */
  options: Record<string, LaCheieOption[]>;
  counties: LaCheieOption[];
  /** Localitățile, grupate pe id de județ. */
  cities: Record<string, LaCheieCity[]>;
  fetchedAt: string;
};

export const EMPTY_LACHEIE_CATALOG: LaCheieCatalog = {
  options: {},
  counties: [],
  cities: {},
  fetchedAt: "",
};

export type LaCheieCategory = "apartment" | "house" | "land" | "commercial";

/** Corespondența tip Habitoo → categorie La Cheie (nu id, doar categoria). */
const CATEGORY_BY_TYPE: Record<string, LaCheieCategory> = {
  apartment: "apartment",
  apartament: "apartment",
  garsoniera: "apartment",
  garsonieră: "apartment",
  studio: "apartment",
  penthouse: "apartment",
  duplex: "apartment",
  house: "house",
  casa: "house",
  casă: "house",
  vila: "house",
  vilă: "house",
  villa: "house",
  land: "land",
  teren: "land",
  commercial: "commercial",
  spatiu_comercial: "commercial",
  retail: "commercial",
  office: "commercial",
  birou: "commercial",
  birouri: "commercial",
  warehouse: "commercial",
  hala: "commercial",
  depozit: "commercial",
  industrial: "commercial",
};

/** Termenii după care căutăm categoria în lista `property_type` din catalog. */
const CATEGORY_PATTERNS: Record<LaCheieCategory, RegExp[]> = {
  apartment: [/apartament/i, /apartment/i, /garsonier/i],
  house: [/cas[aă]/i, /vil[aă]/i, /house/i],
  land: [/teren/i, /land/i],
  commercial: [/comercial/i, /birou/i, /office/i, /spa[țt]iu/i, /hal[aă]/i, /industrial/i],
};

export function laCheieCategory(propertyType: string | null): LaCheieCategory | null {
  if (!propertyType) return null;
  return CATEGORY_BY_TYPE[propertyType.trim().toLowerCase()] ?? null;
}

export function normalizeCatalogName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function readId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readName(record: Record<string, unknown>): string | null {
  for (const key of ["name", "label", "title", "value"]) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

function toOptions(raw: unknown): LaCheieOption[] {
  if (!Array.isArray(raw)) return [];
  const out: LaCheieOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = readId(record["id"] ?? record["value"] ?? record["key"]);
    const name = readName(record);
    if (id && name) out.push({ id, name });
  }
  return out;
}

/** `/options` poate întoarce grupurile la rădăcină sau sub `data`/`options`. */
export function parseLaCheieOptions(body: unknown): Record<string, LaCheieOption[]> {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const root = (record["options"] ?? record["data"] ?? record) as Record<string, unknown>;
  const groups: Record<string, LaCheieOption[]> = {};
  for (const [key, value] of Object.entries(root)) {
    const options = toOptions(value);
    if (options.length) groups[key] = options;
  }
  return groups;
}

export function parseLaCheieCounties(body: unknown): LaCheieOption[] {
  if (Array.isArray(body)) return toOptions(body);
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  return toOptions(record["counties"] ?? record["data"] ?? record["items"]);
}

export function parseLaCheieCities(body: unknown, countyId: string): LaCheieCity[] {
  const base = Array.isArray(body)
    ? toOptions(body)
    : toOptions(
        (body as Record<string, unknown> | null)?.["cities"] ??
          (body as Record<string, unknown> | null)?.["data"] ??
          (body as Record<string, unknown> | null)?.["items"],
      );
  return base.map((option) => ({ ...option, countyId }));
}

/** Găsește o opțiune după nume: potrivire exactă, apoi conținere. */
export function findCatalogOption(
  options: LaCheieOption[],
  name: string | null,
): LaCheieOption | null {
  if (!name || !name.trim()) return null;
  const needle = normalizeCatalogName(name);
  if (!needle) return null;
  const exact = options.find((option) => normalizeCatalogName(option.name) === needle);
  if (exact) return exact;
  const partial = options.find((option) => {
    const value = normalizeCatalogName(option.name);
    return value.includes(needle) || needle.includes(value);
  });
  return partial ?? null;
}

/** Lista de tipuri de proprietate din catalog, cu denumiri tolerante. */
export function propertyTypeOptions(catalog: LaCheieCatalog): LaCheieOption[] {
  for (const key of ["property_type", "property_types", "propertyTypes", "types"]) {
    const group = catalog.options[key];
    if (group?.length) return group;
  }
  return [];
}

export type CatalogResolution =
  | {
      ok: true;
      propertyTypeId: string;
      countyId: string;
      cityId: string;
      category: LaCheieCategory;
    }
  | { ok: false; reasons: string[] };

/** Rezolvă cele trei id-uri obligatorii din catalog, fără nicio presupunere. */
export function resolveLaCheieIds(input: {
  catalog: LaCheieCatalog;
  propertyType: string | null;
  county: string | null;
  city: string | null;
}): CatalogResolution {
  const reasons: string[] = [];
  const category = laCheieCategory(input.propertyType);
  if (!category) {
    reasons.push(
      `Tipul de proprietate „${input.propertyType ?? "necunoscut"}” nu are corespondent La Cheie.`,
    );
  }

  const types = propertyTypeOptions(input.catalog);
  if (types.length === 0) {
    reasons.push("Catalogul La Cheie nu este sincronizat: lipsesc tipurile de proprietate.");
  }

  let propertyTypeId: string | null = null;
  if (category && types.length) {
    for (const pattern of CATEGORY_PATTERNS[category]) {
      const match = types.find((option) => pattern.test(option.name));
      if (match) {
        propertyTypeId = match.id;
        break;
      }
    }
    if (!propertyTypeId) {
      reasons.push(`Catalogul La Cheie nu conține un tip de proprietate pentru „${category}”.`);
    }
  }

  const county = findCatalogOption(input.catalog.counties, input.county);
  if (!county) {
    reasons.push(
      input.county
        ? `Județul „${input.county}” nu a fost găsit în catalogul La Cheie.`
        : "Lipsește județul proprietății.",
    );
  }

  const cities = county ? (input.catalog.cities[county.id] ?? []) : [];
  const city = county ? findCatalogOption(cities, input.city) : null;
  if (county && !city) {
    reasons.push(
      input.city
        ? `Localitatea „${input.city}” nu a fost găsită în catalogul La Cheie pentru județul ${county.name}.`
        : "Lipsește localitatea proprietății.",
    );
  }

  if (reasons.length || !propertyTypeId || !county || !city) return { ok: false, reasons };
  return {
    ok: true,
    propertyTypeId,
    countyId: county.id,
    cityId: city.id,
    category: category as LaCheieCategory,
  };
}

/**
 * Rezolvă o valoare Habitoo într-o opțiune de catalog (`/options`).
 * Acceptă fie id-ul exact al opțiunii, fie denumirea; altfel `null`
 * (câmpul se omite, nu se trimite text liber pe care portalul îl refuză).
 */
export function resolveOptionId(
  catalog: LaCheieCatalog,
  group: string,
  value: string | null,
): string | null {
  const options = catalog.options[group] ?? [];
  if (!options.length || !value || !value.trim()) return null;
  const raw = value.trim();
  const direct = options.find((option) => option.id === raw);
  if (direct) return direct.id;
  return findCatalogOption(options, raw)?.id ?? null;
}

/** Id-uri numerice (pk) pentru grupurile care cer pk: heating, utilities etc. */
export function resolveOptionPk(
  catalog: LaCheieCatalog,
  group: string,
  value: string | null,
): number | null {
  const id = resolveOptionId(catalog, group, value);
  if (!id || !/^[0-9]+$/.test(id)) return null;
  const pk = Number(id);
  return Number.isSafeInteger(pk) && pk > 0 ? pk : null;
}

export function resolveOptionPks(
  catalog: LaCheieCatalog,
  group: string,
  values: (string | null)[],
): number[] {
  const out: number[] = [];
  for (const value of values) {
    const pk = resolveOptionPk(catalog, group, value);
    if (pk !== null && !out.includes(pk)) out.push(pk);
  }
  return out;
}

/** `construction_stage` este un interval de ani, derivat din anul construcției. */
export function constructionStageFor(
  catalog: LaCheieCatalog,
  yearBuilt: number | null | undefined,
): string | null {
  if (typeof yearBuilt !== "number" || !Number.isFinite(yearBuilt) || yearBuilt <= 0) return null;
  const year = Math.round(yearBuilt);
  const slug =
    year < 1941
      ? "pre_1941"
      : year <= 1977
        ? "1941_1977"
        : year <= 1990
          ? "1978_1990"
          : year <= 2000
            ? "1991_2000"
            : year <= 2010
              ? "2001_2010"
              : year <= 2019
                ? "2011_2019"
                : "new_after_2020";
  const options = catalog.options["construction_stage"] ?? [];
  return options.some((option) => option.id === slug) ? slug : null;
}

/** `pet_friendly` este o alegere de catalog, nu un boolean. */
export function petFriendlyFor(
  catalog: LaCheieCatalog,
  petFriendly: boolean | null | undefined,
): string | null {
  if (typeof petFriendly !== "boolean") return null;
  const slug = petFriendly ? "allowed" : "not_allowed";
  const options = catalog.options["pet_friendly"] ?? [];
  return options.some((option) => option.id === slug) ? slug : null;
}
