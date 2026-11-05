/**
 * Publicare/actualizare Housera, per tranzacție, fără acces la baza de date:
 * PUT listings/ref/{ref} (corp determinist, If-Match), 412 → recitire etag +
 * o singură retrimitere, apoi poze doar când lista s-a schimbat.
 */
import type { PortalOffer } from "../imobiliare/offer-links";
import { HouseraError, type HouseraRequest, type HouseraResponse } from "./client.server";
import type { HouseraListingDraft } from "./mapper";
import { reactivateHousera } from "./withdraw";

export type HouseraClientLike = {
  requestMeta<T = unknown>(path: string, req?: HouseraRequest): Promise<HouseraResponse<T>>;
};

export const HOUSERA_MAX_PHOTOS = 100;
export const HOUSERA_REF_REUSE_MESSAGE = "Housera nu permite refolosirea referinței; contactează suportul.";

/** Chei sortate recursiv: același anunț → exact același corp JSON. */
export function sortKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeysDeep) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    return out as T;
  }
  return value;
}

export async function houseraPhotosHash(urls: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(urls));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const WARNING_LABEL: Record<string, string> = {
  agent_not_member: "agentul nu este membru al contului Housera",
  agent_not_allowed: "agentul nu are drept de publicare în Housera",
  unknown_field: "câmp ignorat",
  unknown_feature: "dotare necunoscută ignorată",
  not_for_type: "câmp ignorat pentru acest tip",
  not_for_transaction: "câmp ignorat pentru această tranzacție",
  area_from_pin: "zona a fost dedusă din pin",
};

export function houseraWarningsText(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((w) => {
    if (!w || typeof w !== "object") return [];
    const code = typeof (w as Record<string, unknown>).code === "string" ? ((w as Record<string, unknown>).code as string) : null;
    if (!code) return [];
    const pointer = typeof (w as Record<string, unknown>).pointer === "string" ? ((w as Record<string, unknown>).pointer as string).replace(/^\/+/, "") : "";
    return [`${WARNING_LABEL[code] ?? code}${pointer ? ` (${pointer})` : ""}`];
  });
}

type WriteData = { code?: unknown; etag?: unknown; status?: unknown; url?: unknown };
type WriteBody = { data?: WriteData; warnings?: unknown } | null;

export type HouseraPublishInput = {
  drafts: HouseraListingDraft[];
  stored: PortalOffer[];
  photoUrls: string[];
  client: HouseraClientLike;
};

export type HouseraPublishResult = {
  offers: PortalOffer[];
  warnings: string[];
  unchanged: string[];
  photosSent: string[];
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

async function upsertOne(client: HouseraClientLike, draft: HouseraListingDraft, prev: PortalOffer | undefined) {
  const path = `listings/ref/${encodeURIComponent(draft.externalRef)}`;
  const body = sortKeysDeep(draft.payload);
  const put = (etag: string | null) =>
    client.requestMeta<WriteBody>(path, { method: "PUT", body, headers: etag ? { "If-Match": etag } : undefined });
  try {
    return await put(prev?.etag ?? null);
  } catch (e) {
    if (e instanceof HouseraError && e.status === 409 && e.code === "duplicate_listing" && e.existing?.external_ref === draft.externalRef) {
      // Referința a fost ștearsă anterior (DELETE); nu reîncercăm.
      throw new HouseraError("refused", HOUSERA_REF_REUSE_MESSAGE, 409, e.code, [], [], e.existing);
    }
    if (!(e instanceof HouseraError) || e.status !== 412 || e.code !== "listing_changed_meanwhile") throw e;
    // Habitoo câștigă: recitim versiunea curentă și retrimitem o singură dată.
    if (!prev?.id) throw new HouseraError("refused", "Anunțul s-a schimbat pe Housera și nu are cod salvat în Habitoo.", 412, e.code);
    const fresh = await client.requestMeta<{ data?: WriteData } | null>(`account/listings/${encodeURIComponent(prev.id)}`);
    const etag = str(fresh.data?.data?.etag) ?? str(fresh.headers.get("ETag"));
    if (!etag) throw new HouseraError("refused", "Housera nu a întors versiunea curentă a anunțului.", 412, e.code);
    return await put(etag);
  }
}

export async function publishHousera(input: HouseraPublishInput): Promise<HouseraPublishResult> {
  const offers: PortalOffer[] = [];
  const warnings: string[] = [];
  const unchanged: string[] = [];
  const photosSent: string[] = [];
  const urls = input.photoUrls.slice(0, HOUSERA_MAX_PHOTOS);
  const photosHash = urls.length ? await houseraPhotosHash(urls) : null;
  if (input.photoUrls.length > HOUSERA_MAX_PHOTOS) warnings.push(`Housera acceptă maximum ${HOUSERA_MAX_PHOTOS} poze; restul nu au fost trimise.`);
  if (!urls.length) warnings.push("Nicio poză publicabilă: lista de poze Housera nu a fost modificată.");

  for (const draft of input.drafts) {
    const prev = input.stored.find((o) => o.reference === draft.externalRef);
    const res = await upsertOne(input.client, draft, prev);
    const data = res.data?.data ?? {};
    const code = str(data.code) ?? prev?.id ?? null;
    if (!code) throw new HouseraError("refused", "Housera nu a întors codul anunțului.", res.status, "missing_code");
    if (res.headers.get("X-Housera-Unchanged") === "true") unchanged.push(draft.externalRef);
    const label = draft.transaction === "sale" ? "Vânzare" : "Închiriere";
    for (const w of houseraWarningsText(res.data?.warnings)) warnings.push(input.drafts.length > 1 ? `${label}: ${w}` : w);
    let offer: PortalOffer = {
      transaction: draft.transaction,
      reference: draft.externalRef,
      id: code,
      url: str(data.url) ?? prev?.url ?? "",
      ...((str(data.etag) ?? str(res.headers.get("ETag")) ?? prev?.etag) ? { etag: (str(data.etag) ?? str(res.headers.get("ETag")) ?? prev?.etag)! } : {}),
      ...((str(data.status) ?? prev?.status) ? { status: (str(data.status) ?? prev?.status)! } : {}),
      ...(prev?.photos_hash ? { photos_hash: prev.photos_hash } : {}),
    };
    offer = await reactivateHousera(input.client, offer);
    if (photosHash && photosHash !== prev?.photos_hash) {
      await input.client.requestMeta(`listings/${encodeURIComponent(code)}/photos`, {
        method: "PUT",
        body: { photos: urls.map((url) => ({ url })) },
      });
      offer.photos_hash = photosHash;
      photosSent.push(draft.externalRef);
    }
    offers.push(offer);
  }
  return { offers, warnings, unchanged, photosSent };
}

/** `pending`/`draft` → „În moderare”; altfel starea se deduce din acțiune. */
export function houseraPortalStatus(offers: PortalOffer[]): string | null {
  return offers.some((o) => o.status === "pending" || o.status === "draft") ? "pending" : null;
}
