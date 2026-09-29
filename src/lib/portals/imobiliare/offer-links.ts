/**
 * ID-ul real al anunțului la Imobiliare.ro (`data.id` din răspuns) și linkul
 * public `https://www.imobiliare.ro/oferta/{id}`. Referința HB-xxxx rămâne
 * cheia pentru actualizare/retragere; ID-ul servește doar la afișare.
 */
export type PortalOffer = {
  transaction: string | null;
  reference: string;
  id: string;
  url: string;
  /** Eticheta site-ului, când un portal are mai multe site-uri (ex. Romimo/Publi24). */
  label?: string;
};

export function imobiliareOfferUrl(id: string): string {
  return `https://www.imobiliare.ro/oferta/${encodeURIComponent(id)}`;
}

/** Extrage `data.id` (acceptă și forma jurnalizată `{ body: { data } }`). */
export function extractImobiliareOfferId(response: unknown): string | null {
  const pick = (value: unknown): unknown =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  let root = pick(response) as Record<string, unknown> | null;
  if (root && !("data" in root) && "body" in root) root = pick(root.body) as Record<string, unknown> | null;
  const data = root ? (pick(root.data) as Record<string, unknown> | null) : null;
  const id = data?.id;
  if (typeof id === "number" && Number.isFinite(id) && id > 0) return String(Math.trunc(id));
  if (typeof id === "string" && /^[0-9]{1,20}$/.test(id.trim())) return id.trim();
  return null;
}

export function buildImobiliareOffer(
  reference: string,
  transaction: string | null,
  ...responses: unknown[]
): PortalOffer | null {
  for (const response of responses) {
    const id = extractImobiliareOfferId(response);
    if (id) return { transaction, reference, id, url: imobiliareOfferUrl(id) };
  }
  return null;
}

/** Păstrează ID-urile vechi pentru referințele la care răspunsul nou nu are ID. */
export function mergePortalOffers(previous: unknown, next: PortalOffer[]): PortalOffer[] {
  const prev = Array.isArray(previous) ? (previous as PortalOffer[]) : [];
  const byRef = new Map<string, PortalOffer>();
  for (const o of prev) if (o && typeof o.reference === "string" && o.id) byRef.set(o.reference, o);
  for (const o of next) byRef.set(o.reference, o);
  return [...byRef.values()];
}

export function parsePortalOffers(value: unknown): PortalOffer[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (o): o is PortalOffer =>
      !!o && typeof o === "object" && typeof o.id === "string" && typeof o.url === "string" && typeof o.reference === "string",
  );
}
