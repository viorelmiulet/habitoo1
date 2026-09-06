/**
 * URL-urile canonice folosite în feedul public de portaluri.
 *
 * În producție linkurile TREBUIE să fie stabile și independente de hostul pe
 * care a venit cererea:
 *  - imagine: https://crm.habitoo.ro/api/public/sites/v1/media/{imageId}
 *  - ofertă:  https://habitoo.ro/oferta-{propertyId}
 *
 * Pe preview/local rămânem same-origin ca să putem testa fără DNS de producție.
 * Nu folosim niciodată `url.origin` ca `publicSiteUrl` pe hosturile de
 * producție (altfel s-ar genera https://crm.habitoo.ro/oferta-...).
 */
import { CRM_URL, isCrmHostname, isPublicHostname } from "@/lib/host";

/** Originul canonic al site-ului public (fără www, așa cum e cerut de brand). */
export const PUBLIC_OFFER_ORIGIN = "https://habitoo.ro";

export type FeedUrls = {
  /** Origin pe care se servesc URL-urile de media din feed. */
  baseUrl: string;
  /** Origin al site-ului public pentru linkul ofertei. */
  publicSiteUrl: string;
};

export function feedUrlsForRequest(requestUrl: URL | string): FeedUrls {
  const url = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  const host = url.hostname;
  if (isCrmHostname(host) || isPublicHostname(host)) {
    return { baseUrl: CRM_URL, publicSiteUrl: PUBLIC_OFFER_ORIGIN };
  }
  // Preview / local: totul rămâne testabil pe originul curent.
  return { baseUrl: url.origin, publicSiteUrl: url.origin };
}

/** Originul pe care se servesc imaginile publice, pornind de la hostul curent. */
export function mediaOriginForHost(host?: string | null): string {
  if (host && (isCrmHostname(host) || isPublicHostname(host))) return CRM_URL;
  if (typeof window !== "undefined") return window.location.origin;
  return CRM_URL;
}
