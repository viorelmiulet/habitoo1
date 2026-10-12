/**
 * Promovările Storia (VAS). Singura cu efect în Habitoo este exportul automat
 * pe OLX.ro (`promotion_code = "olx"`): memorăm linkul OLX per tranzacție în
 * `portal_listings.portal_offers` (eticheta „OLX”). Habitoo nu cumpără și nu
 * aplică promovări — doar citește ce raportează Storia.
 */
import type { PortalOffer } from "../imobiliare/offer-links";
import { parsePortalOffers } from "../imobiliare/offer-links";

export const OLX_EXPORT_LABEL = "OLX";

export type StoriaVasEvent = {
  advertUuid: string | null;
  promotionCode: string | null;
  status: string | null;
  olxId: string | null;
  olxUrl: string | null;
  expiresAt: string | null;
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStoriaVasFlow(parsed: unknown): boolean {
  const flow = str(obj(parsed)["flow"]);
  return flow === "vas_lifecycle" || flow === "publish_vas";
}

/** O promovare (din notificare `data` sau din `GET /vas/v1/advert/{uuid}`). */
export function readVasRecord(raw: unknown, fallbackUuid?: string | null): StoriaVasEvent {
  const d = obj(raw);
  const cf = obj(d["custom_fields"]);
  const uuid = str(d["advert_uuid"]) ?? fallbackUuid ?? null;
  const url = str(cf["olx_url"]);
  return {
    advertUuid: uuid && UUID_RE.test(uuid) ? uuid.toLowerCase() : null,
    promotionCode: (str(d["promotion_code"]) ?? str(d["code"]))?.toLowerCase() ?? null,
    status: str(d["status"])?.toLowerCase() ?? null,
    olxId: str(cf["olx_id"]),
    olxUrl: url && /^https:\/\/(www\.)?olx\.ro\//i.test(url) ? url : null,
    expiresAt: str(d["expires_at"]),
  };
}

export function readVasEvent(parsed: unknown): StoriaVasEvent {
  return readVasRecord(obj(parsed)["data"]);
}

/** Exportul OLX activ: `applied` + link valid + neexpirat. */
export function isActiveOlxExport(e: StoriaVasEvent, now = Date.now()): boolean {
  if (e.promotionCode !== "olx" || e.status !== "applied" || !e.olxUrl) return false;
  const exp = e.expiresAt ? Date.parse(e.expiresAt) : NaN;
  return !Number.isFinite(exp) || exp > now;
}

type OlxOffer = PortalOffer & { expiresAt?: string | null };

/** Noua listă `portal_offers` după un eveniment OLX pentru tranzacția dată. */
export function applyOlxExport(
  previous: unknown,
  transaction: "sale" | "rent",
  e: StoriaVasEvent,
  now = Date.now(),
): OlxOffer[] {
  const reference = `OLX:${transaction}`;
  const rest = (Array.isArray(previous) ? (previous as OlxOffer[]) : []).filter(
    (o) => o && o.reference !== reference,
  );
  if (!isActiveOlxExport(e, now)) return rest;
  return [
    ...rest,
    {
      transaction,
      reference,
      id: e.olxId ?? e.olxUrl!.split("/").pop() ?? "",
      url: e.olxUrl!,
      label: OLX_EXPORT_LABEL,
      expiresAt: e.expiresAt,
    },
  ];
}

export function hasOlxLink(offers: unknown, transaction: "sale" | "rent"): boolean {
  return parsePortalOffers(offers).some((o) => o.reference === `OLX:${transaction}`);
}

/** Linkurile OLX afișate: doar cât timp anunțul Storia este publicat și neexpirat. */
export function visibleOlxLinks(
  offers: unknown,
  listingStatus: string | null,
  now = Date.now(),
): { transaction: string | null; url: string }[] {
  if (listingStatus !== "published" && listingStatus !== "updated") return [];
  return (parsePortalOffers(offers) as OlxOffer[])
    .filter((o) => o.label === OLX_EXPORT_LABEL)
    .filter((o) => {
      const exp = o.expiresAt ? Date.parse(o.expiresAt) : NaN;
      return !Number.isFinite(exp) || exp > now;
    })
    .map((o) => ({ transaction: o.transaction, url: o.url }));
}

/** Răspunsul `GET /vas/v1/advert/{uuid}` → promovările (formă tolerantă). */
export function readVasList(body: unknown, advertUuid: string): StoriaVasEvent[] {
  const root = obj(body);
  const data = root["data"];
  const items = Array.isArray(data)
    ? data
    : Array.isArray(obj(data)["promotions"])
      ? (obj(data)["promotions"] as unknown[])
      : data
        ? [data]
        : [];
  return items.map((i) => readVasRecord(i, advertUuid));
}
