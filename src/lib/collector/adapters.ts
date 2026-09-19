/**
 * Registrul adaptoarelor de surse.
 *
 * Un adaptor citește DOAR pagini publice. Configurația (orașe, pagini) vine
 * din baza de date, nu din cod. Un card din care lipsesc câmpuri obligatorii
 * este raportat ca eșec de citire, nu salvat pe jumătate.
 */

export type CollectorParsedItem = {
  /** Identificatorul itemului la sursă, dacă există. */
  sourceItemId?: string | null;
  url: string;
  normalized: Record<string, unknown>;
  raw?: Record<string, unknown>;
  /** Doar în memorie: devine amprentă HMAC, nu se salvează niciodată în clar. */
  phone?: string | null;
  imageUrls?: string[];
  signals?: Record<string, unknown>;
  declaredAgency?: boolean | null;
  declaredOwner?: boolean | null;
  /** Tipul de vânzător stabilit de adaptor, când pagina îl spune explicit. */
  inferredType?: "owner" | "agency" | "unknown" | null;
};

export type CollectorParseFailure = { url?: string | null; reason: string };

export type CollectorParseResult =
  | CollectorParsedItem[]
  | { items: CollectorParsedItem[]; failures?: CollectorParseFailure[] };

export type CollectorAdapterContext = {
  baseUrl: string;
  config: unknown;
  /** Ce a pregătit adaptorul la începutul rulării (ex. index de localități). */
  prepared?: unknown;
};

export type CollectorAdapter = {
  key: string;
  /** Pregătire o singură dată pe rulare (citiri din nomenclator etc.). */
  prepare?: (input: { admin: unknown; config: unknown }) => Promise<unknown>;
  /** Adresa paginii de listă cu indexul dat (1-based) sau null când nu mai sunt pagini. */
  pageUrl: (input: CollectorAdapterContext & { page: number }) => string | null;
  /** Extrage itemii din HTML-ul unei pagini de listă. Doar text. */
  parsePage: (input: CollectorAdapterContext & { url: string; body: string }) => CollectorParseResult;
};

export function normalizeParseResult(result: CollectorParseResult): {
  items: CollectorParsedItem[];
  failures: CollectorParseFailure[];
} {
  if (Array.isArray(result)) return { items: result, failures: [] };
  return { items: result.items ?? [], failures: result.failures ?? [] };
}

const registry = new Map<string, CollectorAdapter>();

export function registerCollectorAdapter(adapter: CollectorAdapter): void {
  registry.set(adapter.key, adapter);
}

export function collectorAdapter(key: string): CollectorAdapter | null {
  return registry.get(key) ?? null;
}

export function collectorAdapterKeys(): string[] {
  return [...registry.keys()].sort();
}
