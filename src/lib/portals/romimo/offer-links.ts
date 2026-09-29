/**
 * Linkurile publice raportate de Romimo la `POST /api/Article`
 * (`romimoUrl`, `publi24Url`). Se acceptă doar HTTPS pe domeniile portalului.
 */
import type { PortalOffer } from "../imobiliare/offer-links";

function safeUrl(value: unknown, host: RegExp): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" && host.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Acceptă și forma jurnalizată `{ body: {...} }`. */
export function extractRomimoLinks(
  response: unknown,
  externalId: string,
): { publicUrl: string | null; offers: PortalOffer[] } {
  let root = response && typeof response === "object" ? (response as Record<string, unknown>) : null;
  if (root && !("romimoUrl" in root) && root.body && typeof root.body === "object") {
    root = root.body as Record<string, unknown>;
  }
  const romimo = safeUrl(root?.romimoUrl, /^(www\.)?romimo\.ro$/i);
  const publi24 = safeUrl(root?.publi24Url, /^(www\.)?publi24\.ro$/i);
  const offers: PortalOffer[] = [];
  if (romimo) offers.push({ transaction: null, reference: `${externalId}#romimo`, id: externalId, url: romimo, label: "Romimo" });
  if (publi24) offers.push({ transaction: null, reference: `${externalId}#publi24`, id: externalId, url: publi24, label: "Publi24" });
  return { publicUrl: romimo, offers };
}
