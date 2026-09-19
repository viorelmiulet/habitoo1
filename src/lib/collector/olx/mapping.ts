/**
 * Maparea OLX → categoriile noastre și tipul de vânzător (logică pură).
 *
 * Nimic nu se ghicește: ce nu se potrivește curat rămâne „necunoscut”, iar
 * tipul de vânzător este „unknown” dacă pagina nu îl scrie explicit.
 */

export const COLLECTOR_PROPERTY_TYPES = [
  "garsonieră",
  "apartament 2 camere",
  "apartament 3 camere",
  "apartament 4+ camere",
  "casă/vilă",
  "teren",
  "spațiu comercial",
  "necunoscut",
] as const;

export type CollectorPropertyType = (typeof COLLECTOR_PROPERTY_TYPES)[number];

function fold(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Categoria sursei + numărul de camere → categoria noastră. */
export function mapOlxPropertyType(
  categoryText: string | null | undefined,
  rooms: number | null | undefined,
  titleText?: string | null,
): CollectorPropertyType {
  const haystack = `${fold(categoryText)} ${fold(titleText)}`.trim();

  if (/garsonier/.test(haystack)) return "garsonieră";
  if (/teren|lot de casa|parcela/.test(haystack)) return "teren";
  if (/birou|spatiu comercial|comercial|hala|depozit/.test(haystack)) return "spațiu comercial";
  if (/casa|vila|duplex/.test(haystack)) return "casă/vilă";

  if (/apartament/.test(haystack)) {
    if (rooms === 1) return "garsonieră";
    if (rooms === 2) return "apartament 2 camere";
    if (rooms === 3) return "apartament 3 camere";
    if (rooms !== null && rooms !== undefined && rooms >= 4) return "apartament 4+ camere";
    return "necunoscut";
  }
  return "necunoscut";
}

/* ----------------------------- tip de vânzător ---------------------------- */

export type OlxSellerClassification = {
  inferredType: "owner" | "agency" | "unknown";
  signals: {
    source: "olx";
    /** Textul public exact pe care ne-am bazat, sau null dacă pagina nu spune. */
    badgeText: string | null;
    matched: "business" | "private" | null;
  };
};

const BUSINESS_MARKS = ["firma", "business", "companie", "agentie", "persoana juridica"];
const PRIVATE_MARKS = ["persoana fizica", "privat", "particular"];

/** Doar ce scrie pagina: „Firmă” → agenție, „Persoană fizică” → proprietar. */
export function classifyOlxSeller(badgeText: string | null | undefined): OlxSellerClassification {
  const folded = fold(badgeText);
  const raw = badgeText?.trim() ?? null;
  if (folded && BUSINESS_MARKS.some((mark) => folded.includes(mark))) {
    return { inferredType: "agency", signals: { source: "olx", badgeText: raw, matched: "business" } };
  }
  if (folded && PRIVATE_MARKS.some((mark) => folded.includes(mark))) {
    return { inferredType: "owner", signals: { source: "olx", badgeText: raw, matched: "private" } };
  }
  return { inferredType: "unknown", signals: { source: "olx", badgeText: raw, matched: null } };
}

/* --------------------------------- zona ---------------------------------- */

export type LocalityIndexEntry = { locality: string; county: string; localityId?: string | null };

/** Index de nomenclator: cheie normalizată → localitate. */
export function localityKey(name: string | null | undefined): string {
  return fold(name);
}

/** Potrivire EXACTĂ pe nume normalizat; altfel nimic (zona nu se inventează). */
export function resolveZone(
  cityText: string | null | undefined,
  index: Map<string, LocalityIndexEntry>,
): { county: string | null; locality: string | null; localityId: string | null } {
  const key = localityKey(cityText);
  if (!key) return { county: null, locality: null, localityId: null };
  const hit = index.get(key);
  if (!hit) return { county: null, locality: null, localityId: null };
  return { county: hit.county, locality: hit.locality, localityId: hit.localityId ?? null };
}

/* ------------------------------- paginare -------------------------------- */

export type OlxCity = { slug: string; label: string };

export type OlxConfig = {
  cities: OlxCity[];
  categoryPath: string;
  pagesPerCity: number;
};

export const OLX_DEFAULT_CONFIG: OlxConfig = {
  cities: [],
  categoryPath: "imobiliare",
  pagesPerCity: 1,
};

export function parseOlxConfig(value: unknown): OlxConfig {
  const record = (value ?? {}) as Record<string, unknown>;
  const cities: OlxCity[] = Array.isArray(record["cities"])
    ? (record["cities"] as unknown[]).flatMap((entry) => {
        const city = (entry ?? {}) as Record<string, unknown>;
        const slug = typeof city["slug"] === "string" ? city["slug"].trim() : "";
        if (!slug) return [];
        const label = typeof city["label"] === "string" && city["label"].trim() !== ""
          ? city["label"].trim()
          : slug;
        return [{ slug, label }];
      })
    : [];
  const pages = Number(record["pagesPerCity"]);
  return {
    cities,
    categoryPath:
      typeof record["categoryPath"] === "string" && record["categoryPath"].trim() !== ""
        ? record["categoryPath"].trim()
        : OLX_DEFAULT_CONFIG.categoryPath,
    pagesPerCity: Number.isFinite(pages) && pages >= 1 ? Math.floor(pages) : 1,
  };
}

/** Pagina globală N → (oraș, pagina din oraș). Null când s-au terminat. */
export function olxPageTarget(
  config: OlxConfig,
  page: number,
): { city: OlxCity; cityPage: number } | null {
  if (config.cities.length === 0 || page < 1) return null;
  const perCity = Math.max(1, config.pagesPerCity);
  const index = Math.floor((page - 1) / perCity);
  if (index >= config.cities.length) return null;
  return { city: config.cities[index]!, cityPage: ((page - 1) % perCity) + 1 };
}

export function olxPageUrl(baseUrl: string, config: OlxConfig, page: number): string | null {
  const target = olxPageTarget(config, page);
  if (!target) return null;
  const path = `/${config.categoryPath}/${target.city.slug}/`;
  const url = new URL(path, baseUrl);
  if (target.cityPage > 1) url.searchParams.set("page", String(target.cityPage));
  return url.toString();
}
