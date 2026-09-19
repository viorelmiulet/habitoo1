/**
 * Acoperirea națională: tabela de căutări (logică pură).
 *
 * O „țintă” este o căutare OLX: categoria de căutare (care dă tipul nostru de
 * proprietate), județul (`regionNormalizedName`), opțional orașul și
 * identificatorul de cartier. Adresele se construiesc ca la OLX:
 * `/imobiliare/apartamente-garsoniere-de-vanzare/4-camere/bucuresti/?search[district_id]=5`
 * iar paginarea folosește parametrul `page`.
 *
 * OLX limitează o căutare la 25 de pagini × 50 de anunțuri. Când o țintă
 * raportează mai multe rezultate decât plafonul, este marcată „de îngustat”,
 * ca să fie spartă pe oraș sau pe cartier — nu pierdem anunțuri în silence.
 */
import type { CollectorPropertyType } from "./mapping";

export const OLX_PAGE_CAP = 25;
export const OLX_ADS_PER_PAGE = 50;
export const OLX_SEARCH_CAP = OLX_PAGE_CAP * OLX_ADS_PER_PAGE;

export type OlxTarget = {
  /** Tipul nostru, determinat de categoria de căutare. */
  type: CollectorPropertyType;
  /** Calea categoriei de căutare, fără origin și fără județ. */
  path: string;
  /** Județul, ca `regionNormalizedName` (ex. „cluj”). */
  county: string;
  /** Orașul, când ținta a fost îngustată. */
  city?: string | null;
  /** Cartierul OLX, când ținta a fost îngustată. */
  districtId?: number | null;
  /** Identificatorul categoriei OLX, când îl cunoaștem. */
  categoryId?: number | null;
};

export type OlxConfig = {
  targets: OlxTarget[];
  /** Câte pagini se citesc pentru o țintă într-o trecere. */
  pagesPerTarget: number;
  /** Harta categorie OLX → tipul nostru. */
  categoryTypes: Record<string, CollectorPropertyType>;
};

export const OLX_DEFAULT_CONFIG: OlxConfig = {
  targets: [],
  pagesPerTarget: OLX_PAGE_CAP,
  categoryTypes: {},
};

const PROPERTY_TYPES = new Set<string>([
  "garsonieră",
  "apartament 2 camere",
  "apartament 3 camere",
  "apartament 4+ camere",
  "casă/vilă",
  "teren",
  "spațiu comercial",
  "necunoscut",
]);

function asType(value: unknown): CollectorPropertyType {
  return typeof value === "string" && PROPERTY_TYPES.has(value)
    ? (value as CollectorPropertyType)
    : "necunoscut";
}

export function parseOlxConfig(value: unknown): OlxConfig {
  const record = (value ?? {}) as Record<string, unknown>;
  const targets: OlxTarget[] = Array.isArray(record["targets"])
    ? (record["targets"] as unknown[]).flatMap((entry) => {
        const target = (entry ?? {}) as Record<string, unknown>;
        const path = typeof target["path"] === "string" ? target["path"].trim() : "";
        const county = typeof target["county"] === "string" ? target["county"].trim() : "";
        if (!path || !county) return [];
        const districtId = Number(target["districtId"]);
        return [
          {
            type: asType(target["type"]),
            path: path.replace(/^\/+|\/+$/g, ""),
            county,
            city: typeof target["city"] === "string" && target["city"].trim() !== ""
              ? target["city"].trim()
              : null,
            districtId: Number.isFinite(districtId) && districtId > 0 ? districtId : null,
            categoryId: Number.isFinite(Number(target["categoryId"]))
              ? Number(target["categoryId"])
              : null,
          },
        ];
      })
    : [];

  const categoryTypes: Record<string, CollectorPropertyType> = {};
  const declared = (record["categoryTypes"] ?? {}) as Record<string, unknown>;
  for (const [id, type] of Object.entries(declared)) categoryTypes[id] = asType(type);
  // Categoriile declarate pe ținte completează harta: categoria de căutare
  // este sursa tipului, nu titlul anunțului.
  for (const target of targets) {
    if (target.categoryId) categoryTypes[String(target.categoryId)] ??= target.type;
  }

  const pages = Number(record["pagesPerTarget"]);
  return {
    targets,
    pagesPerTarget:
      Number.isFinite(pages) && pages >= 1 ? Math.min(Math.floor(pages), OLX_PAGE_CAP) : OLX_PAGE_CAP,
    categoryTypes,
  };
}

/** Adresa unei ținte, pentru pagina dată (1-based). */
export function olxTargetUrl(baseUrl: string, target: OlxTarget, page: number): string {
  const place = target.city?.trim() || target.county.trim();
  const url = new URL(`/${target.path}/${place}/`, baseUrl);
  if (page > 1) url.searchParams.set("page", String(page));
  if (target.districtId) url.searchParams.set("search[district_id]", String(target.districtId));
  return url.toString();
}

/**
 * Pagina globală N → (țintă, pagina din țintă), în ordine round-robin: prima
 * pagină a fiecărei ținte înainte de a doua pagină a primei, deci niciun județ
 * nu rămâne nevizitat.
 */
export function olxRoundRobin(
  config: OlxConfig,
  page: number,
): { target: OlxTarget; targetPage: number } | null {
  const count = config.targets.length;
  if (count === 0 || page < 1) return null;
  const targetPage = Math.floor((page - 1) / count) + 1;
  if (targetPage > config.pagesPerTarget) return null;
  return { target: config.targets[(page - 1) % count]!, targetPage };
}

export function olxPageUrl(baseUrl: string, config: OlxConfig, page: number): string | null {
  const slot = olxRoundRobin(config, page);
  return slot ? olxTargetUrl(baseUrl, slot.target, slot.targetPage) : null;
}

/** Ținta căreia îi aparține o adresă citită (pentru tipul de căutare). */
export function olxTargetForUrl(config: OlxConfig, url: string): OlxTarget | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const matches = config.targets.filter((target) => path.startsWith(`/${target.path}/`));
  // Cea mai specifică potrivire câștigă (ex. „…/2-camere” peste „…/apartamente”).
  return matches.sort((a, b) => b.path.length - a.path.length)[0] ?? null;
}

/** Peste plafonul OLX: ținta trebuie spartă pe oraș sau pe cartier. */
export function olxNeedsNarrowing(totalCount: number | null | undefined): boolean {
  return typeof totalCount === "number" && Number.isFinite(totalCount) && totalCount > OLX_SEARCH_CAP;
}

export function olxNarrowingReason(target: OlxTarget, totalCount: number): string {
  const place = target.city?.trim() || target.county.trim();
  return `${target.path}/${place}: ${totalCount} rezultate peste plafonul OLX de ${OLX_SEARCH_CAP} — de îngustat pe oraș sau cartier`;
}

/** O trecere națională completă: câte pagini și cât durează la pauza configurată. */
export function olxPassEstimate(
  config: OlxConfig,
  crawlDelayMs: number,
): { targets: number; pages: number; hours: number } {
  const pages = config.targets.length * config.pagesPerTarget;
  return {
    targets: config.targets.length,
    pages,
    hours: Math.round(((pages * crawlDelayMs) / 3_600_000) * 10) / 10,
  };
}
