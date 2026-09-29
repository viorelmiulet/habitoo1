/**
 * Validarea linkurilor publice primite de la portaluri: doar HTTPS, doar pe
 * domeniul portalului (și subdomeniile lui). Orice altceva se ignoră.
 */
import type { PortalOffer } from "./imobiliare/offer-links";

export function safePortalUrl(value: unknown, domain: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value.trim());
    const host = u.hostname.toLowerCase();
    const ok = host === domain || host.endsWith(`.${domain}`);
    return u.protocol === "https:" && ok ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Imospot: câte un anunț per tranzacție (vânzare / închiriere). */
export function buildImospotOffers(
  echoes: Array<{ externalId: string; transaction: string; id: string | null; url: string | null }>,
): { publicUrl: string | null; offers: PortalOffer[] } {
  const offers: PortalOffer[] = [];
  for (const e of echoes) {
    const url = safePortalUrl(e.url, "imospot.ro");
    if (!url) continue;
    offers.push({ transaction: e.transaction, reference: e.externalId, id: e.id ?? e.externalId, url });
  }
  return { publicUrl: offers[0]?.url ?? null, offers };
}
