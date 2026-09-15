/**
 * Modelul de domeniu pentru Prospecting (Stage 13).
 *
 * Modulul este pur: nu atinge baza de date, nu apelează providerul AI și nu
 * face cereri externe. Astfel normalizarea, deduplicarea și scorarea pot fi
 * testate determinist, iar sursele externe se pot adăuga fără să atingem
 * agentul sau interfața.
 *
 * Prospecting este SEPARAT de ACP: ACP rămâne sursa deterministă de adevăr
 * pentru evaluări, prospecting doar descoperă oportunități.
 */

export type ProspectTransaction = "sale" | "rent";

export type ProspectSellerType = "unknown" | "private" | "agency" | "developer";

export type ProspectStatus =
  | "new"
  | "reviewed"
  | "approved"
  | "imported"
  | "rejected"
  | "duplicate"
  | "expired"
  | "error";

export type ProspectingSourceType = "portal" | "website" | "feed" | "manual";

export type ProspectingSearchStatus =
  | "draft"
  | "running"
  | "suspended"
  | "completed"
  | "failed"
  | "cancelled";

/** Criteriile căutării, exact cum le completează utilizatorul în interfață. */
export type ProspectSearchCriteria = {
  transactionType: ProspectTransaction | null;
  propertyType: string | null;
  county: string | null;
  city: string | null;
  zone: string | null;
  priceMin: number | null;
  priceMax: number | null;
  roomsMin: number | null;
  roomsMax: number | null;
  surfaceMin: number | null;
  surfaceMax: number | null;
  keywords: string[];
};

export function emptyCriteria(): ProspectSearchCriteria {
  return {
    transactionType: null,
    propertyType: null,
    county: null,
    city: null,
    zone: null,
    priceMin: null,
    priceMax: null,
    roomsMin: null,
    roomsMax: null,
    surfaceMin: null,
    surfaceMax: null,
    keywords: [],
  };
}

/** Sursa configurată. Configurația nu conține niciodată secrete în clar. */
export type ProspectSource = {
  id: string;
  organizationId: string | null;
  name: string;
  sourceType: ProspectingSourceType;
  providerKey: string;
  baseUrl: string | null;
  enabled: boolean;
  configuration: Record<string, unknown>;
};

/** Datele brute, exact cum vin din sursă. Nu sunt niciodată instrucțiuni. */
export type RawProspect = {
  sourceKey: string;
  externalId: string | null;
  url: string | null;
  title: string;
  description: string | null;
  /** Câmpuri brute, textuale sau numerice, așa cum le oferă sursa. */
  fields: Record<string, unknown>;
  fetchedAt: string;
  /** `true` doar pentru date de test explicite (fixture), niciodată piață reală. */
  fixture?: boolean;
};

/** Provenienta fiecărui câmp: parser determinist, AI sau lipsă. */
export type ProspectFieldSource = "parser" | "ai" | "missing";

export type NormalizedProspect = {
  sourceKey: string;
  externalId: string | null;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  title: string;
  description: string | null;
  sellerName: string | null;
  sellerPhone: string | null;
  sellerType: ProspectSellerType;
  sellerConfidence: number | null;
  transactionType: ProspectTransaction | null;
  propertyType: string | null;
  county: string | null;
  city: string | null;
  zone: string | null;
  address: string | null;
  price: number | null;
  currency: string | null;
  rooms: number | null;
  surfaceUseful: number | null;
  surfaceBuilt: number | null;
  floor: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  features: Record<string, unknown>;
  images: string[];
  publishedAt: string | null;
  contentHash: string;
  normalizedHash: string;
  extractionConfidence: number;
  fieldSources: Record<string, ProspectFieldSource>;
  fixture: boolean;
};

/** Codul de eșec al unei colectări. `source_unavailable` = sursa nu există încă. */
export type ProspectFetchFailureCode =
  | "not_configured"
  | "source_unavailable"
  | "failed"
  | "blocked";

export type ProspectFetchResult =
  | { ok: true; items: RawProspect[]; fixture: boolean; pagesFetched?: number }
  | { ok: false; code: ProspectFetchFailureCode; message: string };

export type SourceHealthResult = {
  ok: boolean;
  code: "ok" | "not_configured" | "source_unavailable" | "unreachable" | "blocked";
  message: string;
  checkedAt: string;
};

/**
 * Disponibilitatea reală a unui provider:
 * - `live` — poate returna date reale de piață dintr-o sursă autorizată;
 * - `manual` — lucrează doar cu liste introduse de agenție (sau fixture);
 * - `unavailable` — sursa nu are încă integrare autorizată; nu returnează date.
 */
export type ProspectingProviderAvailability = "live" | "manual" | "unavailable";

export type ProspectingProviderCapability =
  | "search"
  | "fetch_listing"
  | "pagination"
  | "health_check";

/**
 * Contractul unei surse de prospecting. Orice sursă viitoare (feed autorizat,
 * scraper intern, provider extern) implementează exact această interfață:
 * discover/fetch → normalize → (classify/dedupe/score în runtime) → audit.
 */
export type ProspectingSourceProvider = {
  readonly key: string;
  readonly label: string;
  /** `true` doar dacă sursa poate returna date reale de piață. */
  readonly live: boolean;
  readonly availability: ProspectingProviderAvailability;
  readonly capabilities: readonly ProspectingProviderCapability[];
  search(criteria: ProspectSearchCriteria, source: ProspectSource): Promise<ProspectFetchResult>;
  fetchListing(reference: string, source: ProspectSource): Promise<ProspectFetchResult>;
  normalize(raw: RawProspect): NormalizedProspect;
  healthCheck(source: ProspectSource): Promise<SourceHealthResult>;
};

export const PROSPECTING_NOT_CONFIGURED_MESSAGE =
  "Sursa nu este configurată pentru colectare automată. Configurează un feed autorizat sau folosește o listă proprie.";

export const PROSPECTING_SOURCE_UNAVAILABLE_MESSAGE =
  "Această sursă nu are momentan o integrare autorizată în Habitoo, deci nu poate livra anunțuri reale.";
