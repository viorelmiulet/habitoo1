/**
 * Portul `market_query`: interogarea live a surselor partenere pentru
 * comparabile, în momentul rulării analizei.
 *
 * Reguli fixe ale portului:
 *  - nimic nu se stochează în afara analizei salvate (fără pool de piață, fără
 *    rulări programate, fără imagini, fără date de contact ale vânzătorului);
 *  - cereri politicoase și identificate: User-Agent descriptiv cu contact,
 *    robots.txt respectat, o cerere pe rând per domeniu, fără autentificare,
 *    fără proxy și fără mascarea identității;
 *  - un adaptor întoarce date brute; normalizarea este comună (`normalize.ts`).
 */

/** Criteriile de căutare, derivate din subiectul analizei. */
export type MarketQueryCriteria = {
  transactionType: string | null;
  propertyType: string | null;
  city: string | null;
  county: string | null;
  zone: string | null;
  rooms: number | null;
  /** Raza de căutare, configurabilă per sursă. */
  radiusKm: number;
  /** Banda de preț, derivată din prețul de referință al proprietății. */
  priceMin: number | null;
  priceMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
};

/** Configurația unei surse, citită din `market_query_sources`. */
export type MarketQuerySourceConfig = {
  key: string;
  label: string;
  baseUrl: string;
  enabled: boolean;
  timeoutMs: number;
  radiusKm: number;
  priceBandPercent: number;
};

/** Ce întoarce un adaptor: câmpuri brute, fără nicio presupunere. */
export type MarketQueryRawComparable = {
  price?: unknown;
  currency?: unknown;
  area?: unknown;
  rooms?: unknown;
  locality?: unknown;
  zone?: unknown;
  listedAt?: unknown;
  url?: unknown;
};

/** Comparabilul normalizat — exact câmpurile pe care o analiză le păstrează. */
export type MarketQueryComparable = {
  price: number;
  currency: string | null;
  area: number;
  rooms: number | null;
  locality: string | null;
  zone: string | null;
  listedAt: string | null;
  url: string | null;
};

export type MarketQueryOutcome = "answered" | "empty" | "timeout" | "error";

export const MARKET_QUERY_OUTCOME_LABELS: Record<MarketQueryOutcome, string> = {
  answered: "A răspuns",
  empty: "A răspuns, fără rezultate",
  timeout: "Nu a răspuns în timp util",
  error: "Eroare la interogare",
};

export type MarketQuerySourceOutcome = {
  sourceKey: string;
  sourceLabel: string;
  outcome: MarketQueryOutcome;
  /** Câte comparabile utilizabile a dat sursa (după normalizare). */
  comparables: number;
  /** Motivul, în română simplă, când sursa nu a răspuns util. */
  detail: string | null;
};

/**
 * Cifrele agregate publicate de o sursă (mediane, timp pe piață, distribuții).
 * Sunt statistica sursei, cu data la care au fost citite, ținute separat de
 * comparabilele noastre: nu intră în niciun calcul al analizei.
 */
export type MarketQueryMarketContextData = {
  /** Titlul blocului, în română, așa cum îl arătăm utilizatorului. */
  title: string;
  /** Rânduri „etichetă: valoare", deja formatate pentru afișare. */
  lines: { label: string; value: string }[];
  /** Nota explicativă publicată de sursă, dacă există. */
  note: string | null;
  /** Adresa publică de la care au fost citite cifrele. */
  url: string | null;
  /** Data citirii (ISO). */
  capturedAt: string;
};

export type MarketQueryMarketContext = MarketQueryMarketContextData & {
  sourceKey: string;
  sourceLabel: string;
};

/**
 * Rezultatul unui adaptor: doar comparabile brute, sau comparabile plus blocul
 * de cifre publicate și adresele efectiv cerute.
 */
export type MarketQueryAdapterResult =
  | MarketQueryRawComparable[]
  | {
      items: MarketQueryRawComparable[];
      marketContext?: MarketQueryMarketContextData | null;
      requestedUrls?: string[];
    };

export type MarketQueryAdapter = {
  key: string;
  query: (input: {
    criteria: MarketQueryCriteria;
    source: MarketQuerySourceConfig;
    signal: AbortSignal;
  }) => Promise<MarketQueryAdapterResult>;
};

/** Forma unificată a rezultatului unui adaptor. */
export function marketQueryAdapterResult(result: MarketQueryAdapterResult): {
  items: MarketQueryRawComparable[];
  marketContext: MarketQueryMarketContextData | null;
  requestedUrls: string[];
} {
  if (Array.isArray(result)) {
    return { items: result, marketContext: null, requestedUrls: [] };
  }
  return {
    items: result.items ?? [],
    marketContext: result.marketContext ?? null,
    requestedUrls: result.requestedUrls ?? [],
  };
}

const registry = new Map<string, MarketQueryAdapter>();

export function registerMarketQueryAdapter(adapter: MarketQueryAdapter): void {
  registry.set(adapter.key, adapter);
}

export function marketQueryAdapter(key: string): MarketQueryAdapter | null {
  return registry.get(key) ?? null;
}

export function marketQueryAdapterKeys(): string[] {
  return [...registry.keys()].sort();
}

/** Doar pentru teste: registrul revine la starea livrată (fără adaptoare). */
export function resetMarketQueryAdapters(): void {
  registry.clear();
}
