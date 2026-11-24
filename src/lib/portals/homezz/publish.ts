/**
 * Reguli pure de publicare HomeZZ (insert/update/delete/activate/move-ad),
 * per tranzacție, cu clientul injectat. Fără importuri server, fără secrete:
 * `key`/`token` sunt adăugate de client, nu apar aici.
 */
import type { PortalOffer } from "../imobiliare/offer-links";
import type { HomezzResult, HomezzValue } from "./client";
import type { HomezzParams as MapParams, HomezzTransaction } from "./mapper";

export const HOMEZZ_MAX_IMAGES = 18;
export const HOMEZZ_AGENT_NOT_LINKED = "Agentul responsabil nu este activat pe HomeZZ.";
export const HOMEZZ_LJM_DELAY_MS = 10 * 60 * 1000;
export const HOMEZZ_LJM_THROTTLE_MS = 60 * 1000;

export type HomezzOffer = PortalOffer & {
  internal_id: string;
  homezz_id: string | null;
  ljm_url: string | null;
  agent_email: string | null;
  deleted: boolean;
  published_at?: string | null;
  ljm_checked_at?: string | null;
};

/**
 * `agency` adaugă `key`; `agent` adaugă token-ul agentului cu `email`
 * (implicit agentul responsabil curent). `delete`/`activate` pe o ofertă
 * existentă folosesc agentul salvat pe ofertă (`agent_email`).
 */
export type HomezzPublishClient = {
  agency: (action: string, params: Record<string, HomezzValue>) => Promise<HomezzResult>;
  agent: (action: string, params: Record<string, HomezzValue>, email?: string) => Promise<HomezzResult>;
};

export class HomezzPublishError extends Error {
  constructor(public result: Extract<HomezzResult, { ok: false }>, public action: string) {
    super(result.message);
  }
}

/** Cifrele referinței + „1” (vânzare) / „2” (închiriere): HB-1376 → 13761 / 13762. */
export function homezzInternalId(reference: string | null | undefined, transaction: HomezzTransaction): string | null {
  const digits = (reference ?? "").replace(/\D/g, "");
  return digits ? `${digits}${transaction === "sale" ? "1" : "2"}` : null;
}

export function homezzPhotosHash(imageIds: string[]): string {
  return imageIds.slice(0, HOMEZZ_MAX_IMAGES).join(",");
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const https = (v: unknown) => { const s = str(v); return s && s.startsWith("https://") ? s : null; };

export function parseHomezzOffers(value: unknown): HomezzOffer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((o) => {
    if (!o || typeof o !== "object") return [];
    const r = o as Record<string, unknown>;
    const internal = str(r["internal_id"]) ?? str(r["reference"]);
    if (!internal) return [];
    return [{
      ...(r as PortalOffer),
      transaction: (r["transaction"] as string | null) ?? null,
      reference: internal, internal_id: internal,
      id: str(r["homezz_id"]) ?? str(r["id"]) ?? internal,
      url: typeof r["url"] === "string" ? (r["url"] as string) : "",
      homezz_id: str(r["homezz_id"]),
      ljm_url: https(r["ljm_url"]),
      agent_email: str(r["agent_email"]),
      deleted: r["deleted"] === true,
    }];
  });
}

type AdInfo = { exists: boolean; deleted: boolean; url: string | null; ljmUrl: string | null };

export function parseHomezzAdInfo(r: HomezzResult): AdInfo {
  if (!r.ok) return { exists: false, deleted: false, url: null, ljmUrl: null };
  const ad = (r.data as { ad?: unknown } | null)?.ad;
  if (!ad || typeof ad !== "object") return { exists: false, deleted: false, url: null, ljmUrl: null };
  const a = ad as Record<string, unknown>;
  const del = a["deleted"];
  return { exists: true, deleted: del === true || del === 1 || del === "1", url: https(a["homezz_url"]), ljmUrl: https(a["ljm_url"]) };
}

/** `ad-info`: anunț inexistent = eroare la acțiune (400); celelalte eșecuri se propagă. */
async function adInfo(client: HomezzPublishClient, internalId: string): Promise<AdInfo> {
  const r = await client.agency("ad-info", { internal_id: internalId });
  if (!r.ok && r.kind !== "action_error") throw new HomezzPublishError(r, "ad-info");
  return parseHomezzAdInfo(r);
}

async function must(p: Promise<HomezzResult>, action: string) {
  const r = await p;
  if (!r.ok) throw new HomezzPublishError(r, action);
  return r;
}

function fromWrite(r: Extract<HomezzResult, { ok: true }>) {
  const d = (r.data ?? {}) as Record<string, unknown>;
  return { url: https(d["url"]), id: str(d["id"]) };
}

export type HomezzPublishInput = {
  ads: { transaction: HomezzTransaction; params: MapParams }[];
  stored: HomezzOffer[];
  reference: string | null;
  agentEmail: string;
  images: { ids: string[]; urls: string[] };
  client: HomezzPublishClient;
  now?: Date;
};

export type HomezzPublishOutput = { offers: HomezzOffer[]; actions: string[] };

const imagesParam = (urls: string[]): HomezzValue => (urls.length ? urls.slice(0, HOMEZZ_MAX_IMAGES) : "");

/** Delete idempotent: un anunț deja dezactivat sau inexistent contează ca succes. */
async function deleteAd(client: HomezzPublishClient, internalId: string, actions: string[], email?: string) {
  const r = await client.agent("delete", { internal_id: internalId }, email);
  actions.push(`delete:${internalId}`);
  if (r.ok) return;
  if (r.kind !== "action_error") throw new HomezzPublishError(r, "delete");
  const info = await adInfo(client, internalId);
  if (info.exists && !info.deleted) throw new HomezzPublishError(r, "delete");
}

async function moveIfNeeded(client: HomezzPublishClient, offer: HomezzOffer, agentEmail: string, actions: string[]) {
  if (!offer.agent_email || offer.agent_email === agentEmail) return;
  await must(client.agency("move-ad", { email: agentEmail, internal_id: offer.internal_id }), "move-ad");
  actions.push(`move-ad:${offer.internal_id}`);
}

export async function publishHomezz(input: HomezzPublishInput): Promise<HomezzPublishOutput> {
  const { client, agentEmail } = input;
  const nowIso = (input.now ?? new Date()).toISOString();
  const hash = homezzPhotosHash(input.images.ids);
  const actions: string[] = [];
  const offers: HomezzOffer[] = [];
  const wanted = new Set(input.ads.map((a) => a.transaction));

  for (const ad of input.ads) {
    const prev = input.stored.find((o) => o.transaction === ad.transaction);
    const internalId = prev?.internal_id ?? homezzInternalId(input.reference, ad.transaction);
    if (!internalId) throw new Error("Proprietatea nu are o referință numerică pentru HomeZZ.");
    const params: Record<string, HomezzValue> = { internal_id: internalId, ...ad.params };
    let url = prev?.url ?? "";
    let homezzId = prev?.homezz_id ?? null;
    let ljm = prev?.ljm_url ?? null;
    let publishedAt = prev?.published_at ?? null;
    let sendImages: boolean;

    if (prev) {
      // Reactivarea se face cu agentul salvat pe ofertă, apoi mutarea la agentul curent.
      if (prev.deleted) { await must(client.agent("activate", { internal_id: internalId }, prev.agent_email ?? agentEmail), "activate"); actions.push(`activate:${internalId}`); }
      await moveIfNeeded(client, prev, agentEmail, actions);
      sendImages = prev.photos_hash !== hash;
      const r = await must(client.agent("update", sendImages ? { ...params, images: imagesParam(input.images.urls) } : params), "update");
      actions.push(`update:${internalId}`);
      const w = fromWrite(r); url = w.url ?? url; homezzId = w.id ?? homezzId;
    } else {
      const info = await adInfo(client, internalId);
      actions.push(`ad-info:${internalId}`);
      sendImages = true;
      const withImages = { ...params, images: imagesParam(input.images.urls) };
      if (info.exists) {
        if (info.deleted) { await must(client.agent("activate", { internal_id: internalId }), "activate"); actions.push(`activate:${internalId}`); }
        const r = await must(client.agent("update", withImages), "update");
        actions.push(`update:${internalId}`);
        const w = fromWrite(r); url = w.url ?? info.url ?? ""; homezzId = w.id; ljm = info.ljmUrl;
      } else {
        const r = await must(client.agent("insert", withImages), "insert");
        actions.push(`insert:${internalId}`);
        const w = fromWrite(r); url = w.url ?? ""; homezzId = w.id;
      }
      publishedAt = nowIso;
    }
    offers.push({
      transaction: ad.transaction, reference: internalId, internal_id: internalId,
      id: homezzId ?? internalId, homezz_id: homezzId, url, ljm_url: ljm, agent_email: agentEmail,
      photos_hash: sendImages ? hash : (prev?.photos_hash ?? hash), deleted: false, status: "active",
      published_at: publishedAt, ljm_checked_at: prev?.ljm_checked_at ?? null,
    });
  }

  for (const old of input.stored) {
    if (old.transaction && wanted.has(old.transaction as HomezzTransaction)) continue;
    if (!old.deleted) await deleteAd(client, old.internal_id, actions, old.agent_email ?? agentEmail);
    offers.push({ ...old, agent_email: old.agent_email ?? agentEmail, deleted: true, status: "deleted" });
  }
  return { offers, actions };
}

/** Retragerea folosește agentul salvat pe ofertă; agentul curent doar dacă oferta nu are unul. Fără move-ad. */
export async function withdrawHomezz(input: { stored: HomezzOffer[]; agentEmail: string | null; client: HomezzPublishClient }): Promise<HomezzPublishOutput> {
  const actions: string[] = [];
  const offers: HomezzOffer[] = [];
  for (const o of input.stored) {
    const email = o.agent_email ?? input.agentEmail;
    if (!o.deleted) {
      if (!email) throw new Error(HOMEZZ_AGENT_NOT_LINKED);
      await deleteAd(input.client, o.internal_id, actions, email);
    }
    offers.push({ ...o, agent_email: email, deleted: true, status: "deleted" });
  }
  return { offers, actions };
}

/** Lajumate: link lipsă, cel puțin 10 minute de la publicare, verificat cel mult o dată pe minut. */
export function homezzLajumateDue(o: HomezzOffer, now: Date): boolean {
  if (o.deleted || o.ljm_url || !o.published_at) return false;
  const t = now.getTime();
  if (t - Date.parse(o.published_at) < HOMEZZ_LJM_DELAY_MS) return false;
  return !o.ljm_checked_at || t - Date.parse(o.ljm_checked_at) >= HOMEZZ_LJM_THROTTLE_MS;
}

export const homezzPublicUrl = (offers: HomezzOffer[]) => offers.find((o) => !o.deleted && o.url.startsWith("https://"))?.url ?? null;
