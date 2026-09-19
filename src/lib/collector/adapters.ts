/**
 * Registrul adaptoarelor de surse.
 *
 * În această etapă este GOL intenționat: engine-ul există, sursele nu. Nimic
 * nu se conectează la un portal până când un adaptor este adăugat explicit.
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
};

export type CollectorAdapter = {
  key: string;
  /** Adresa paginii de listă cu indexul dat (1-based) sau null când nu mai sunt pagini. */
  pageUrl: (input: { baseUrl: string; page: number }) => string | null;
  /** Extrage itemii din HTML-ul unei pagini de listă. Doar text. */
  parsePage: (input: { url: string; body: string }) => CollectorParsedItem[];
};

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
