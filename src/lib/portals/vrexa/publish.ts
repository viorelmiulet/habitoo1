/**
 * Vrexa: reguli pure de publicare (fără rețea, fără DB).
 * Un anunț per tranzacție, `externalId` = referința + `-V`/`-I`, salvat la prima publicare.
 */
import type { VrexaEnv } from "./config";
import type { VrexaResult } from "./client";
import type { VrexaBody, VrexaTransaction } from "./mapper";

export const VREXA_MAX_IMAGES = 20;
/** Varianta redimensionată din rutele media existente (sub 5 MB), `fit=contain`. */
export const VREXA_IMAGE_QUERY = "w=1920&h=1440&fit=contain";

export type VrexaStatus = "processing" | "pending" | "active" | "rejected" | "inactive" | "deleted";
export type VrexaOffer = {
  transaction: VrexaTransaction;
  /** = external_id (cheia de îmbinare a ofertelor). */
  reference: string;
  /** vrexa_id sau, până îl primim, external_id. */
  id: string;
  url: string;
  external_id: string;
  vrexa_id: string | null;
  status: VrexaStatus | string;
  rejection_reason: string | null;
  /** Respingerea pentru care s-a trimis deja notificarea. */
  rejection_notified?: string | null;
  body_hash: string | null;
  photos_hash: string | null;
  env: VrexaEnv;
  checked_at?: string | null;
  image_warning?: string | null;
};

export type VrexaRemote = {
  externalId?: string; id?: string | number; status?: string; rejectionReason?: string | null; url?: string | null;
  imageImport?: { status?: string; failed?: Array<{ url?: string; reason?: string }> } | null;
};

export interface VrexaPublishClient {
  put(externalId: string, body: VrexaBody): Promise<VrexaResult<VrexaRemote>>;
  get(externalId: string): Promise<VrexaResult<VrexaRemote>>;
  del(externalId: string): Promise<VrexaResult<unknown>>;
}

const SUFFIX: Record<VrexaTransaction, string> = { sale: "V", rent: "I" };

/** `externalId` Vrexa: litere, cifre, `.`, `_`, `-`; cel mult 100 de caractere. */
export function vrexaExternalId(reference: string | null | undefined, propertyId: string, tx: VrexaTransaction): string {
  const base = (reference ?? "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || propertyId;
  return `${base.slice(0, 97)}-${SUFFIX[tx]}`;
}

export function parseVrexaOffers(value: unknown): VrexaOffer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((o): o is VrexaOffer => !!o && typeof o === "object" && typeof (o as VrexaOffer).external_id === "string" && ((o as VrexaOffer).transaction === "sale" || (o as VrexaOffer).transaction === "rent"));
}
export const vrexaOfferEnv = (o: { env?: unknown }): VrexaEnv => (o.env === "production" ? "production" : "test");

/** Hash stabil (FNV-1a 64 pe două jumătăți) — suficient pentru detectarea schimbărilor. */
export function vrexaHash(value: unknown): string {
  const text = stable(value);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

/** Primele 20 de poze, URL-uri publice https stabile (identitatea fișierului în URL). */
export function vrexaImages(urls: string[]): string[] {
  return urls.filter((u) => u.startsWith("https://")).slice(0, VREXA_MAX_IMAGES)
    .map((u) => `${u}${u.includes("?") ? "&" : "?"}${VREXA_IMAGE_QUERY}`);
}

/** Etichete românești pentru câmpurile din erorile `validation_failed`. */
export const VREXA_FIELD_LABELS: Record<string, string> = {
  title: "Titlu", description: "Descriere", price: "Preț", currency: "Monedă", "location.address": "Adresă", location: "Localizare",
  "location.latitude": "Latitudine", "location.longitude": "Longitudine", "contact.name": "Nume agent", "contact.email": "Email agent", "contact.phone": "Telefon agent",
  totalRooms: "Număr camere", totalBathrooms: "Număr băi", buildYear: "An construcție", usableArea: "Suprafață utilă", builtArea: "Suprafață construită",
  floor: "Etaj", totalFloors: "Număr niveluri", partitioning: "Compartimentare", comfort: "Confort", buildingType: "Tip clădire", furnishing: "Mobilare",
  heatingType: "Încălzire", airConditioning: "Climatizare", refurbishStatus: "Stare finisaje", utilities: "Utilități", plotArea: "Suprafață teren",
  houseType: "Tip casă", plotType: "Tip teren", plotClassification: "Clasificare teren", streetFrontage: "Front stradal", accessType: "Acces", images: "Fotografii",
};

export function vrexaValidationMessage(errors: Record<string, unknown> | null, detail: string | null): string {
  if (!errors) return `Vrexa a respins anunțul${detail ? `: ${detail}` : "."}`;
  const parts = Object.entries(errors).map(([field, msgs]) => {
    const text = (Array.isArray(msgs) ? msgs : [msgs]).map(String).join(", ");
    const label = VREXA_FIELD_LABELS[field] ?? VREXA_FIELD_LABELS[field.replace(/\[\d+\]/g, "")];
    return label ? `${label} (${field}): ${text}` : `${field}: ${text}`;
  });
  return `Vrexa a respins anunțul: ${parts.join("; ")}`;
}

/** Aplică răspunsul Vrexa pe ofertă. */
export function applyVrexaRemote(o: VrexaOffer, r: VrexaRemote, nowIso: string): VrexaOffer {
  const status = typeof r.status === "string" ? r.status : o.status;
  const vrexaId = r.id !== undefined && r.id !== null ? String(r.id) : o.vrexa_id;
  const failed = (r.imageImport?.failed ?? []).filter((f) => f && (f.url || f.reason));
  return {
    ...o, status, vrexa_id: vrexaId, id: vrexaId ?? o.external_id,
    url: status === "active" && typeof r.url === "string" && r.url.startsWith("https://") ? r.url : status === "active" ? o.url : "",
    rejection_reason: status === "rejected" ? (r.rejectionReason ?? o.rejection_reason ?? null) : null,
    checked_at: nowIso,
    image_warning: failed.length ? `Vrexa a refuzat ${failed.length} ${failed.length === 1 ? "poză" : "poze"}: ${failed.map((f) => `${f.url ?? "?"} (${f.reason ?? "fără motiv"})`).join("; ")}` : r.imageImport ? null : (o.image_warning ?? null),
  };
}

/** Starea agregată în Habitoo. */
export function vrexaListingState(offers: VrexaOffer[]): { status: "pending" | "published" | "withdrawn" | "error"; message: string | null; publicUrl: string | null } {
  const live = offers.filter((o) => o.status !== "deleted");
  const rejected = live.filter((o) => o.status === "rejected");
  const url = live.find((o) => o.status === "active" && o.url)?.url ?? null;
  if (rejected.length) return { status: "error", message: `Vrexa a respins anunțul: ${rejected.map((o) => o.rejection_reason || "fără motiv").join(" · ")}`, publicUrl: url };
  if (live.some((o) => o.status === "processing" || o.status === "pending")) return { status: "pending", message: null, publicUrl: url };
  if (live.some((o) => o.status === "active")) return { status: "published", message: null, publicUrl: url };
  return { status: "withdrawn", message: null, publicUrl: null };
}

/** Ofertele respinse pentru care nu s-a trimis încă notificarea. */
export function vrexaNewRejections(offers: VrexaOffer[]): VrexaOffer[] {
  return offers.filter((o) => o.status === "rejected" && o.rejection_notified !== `${o.vrexa_id ?? o.external_id}|${o.rejection_reason ?? ""}`);
}
export const vrexaRejectionKey = (o: VrexaOffer) => `${o.vrexa_id ?? o.external_id}|${o.rejection_reason ?? ""}`;

export class VrexaPublishError extends Error {
  constructor(message: string, readonly result: Extract<VrexaResult, { ok: false }>) { super(message); }
}
const failMessage = (r: Extract<VrexaResult, { ok: false }>) =>
  r.problem.code === "validation_failed" ? vrexaValidationMessage(r.problem.errors as Record<string, unknown> | null, r.problem.detail) : r.message;

export type VrexaPublishInput = {
  listings: { transaction: VrexaTransaction; body: VrexaBody }[];
  stored: VrexaOffer[];
  reference: string | null;
  propertyId: string;
  images: string[];
  env: VrexaEnv;
  client: VrexaPublishClient;
  nowIso: string;
};

/** Publicare/actualizare: PUT doar pe ce s-a schimbat; DELETE pe tranzacțiile renunțate. Ofertele din alt mediu rămân neatinse. */
export async function publishVrexa(input: VrexaPublishInput): Promise<{ offers: VrexaOffer[]; actions: string[] }> {
  const actions: string[] = [];
  const mine = input.stored.filter((o) => vrexaOfferEnv(o) === input.env && o.status !== "deleted");
  const photosHash = vrexaHash(input.images);
  const out: VrexaOffer[] = [];
  for (const l of input.listings) {
    const prev = mine.find((o) => o.transaction === l.transaction);
    const old = input.stored.find((o) => vrexaOfferEnv(o) === input.env && o.transaction === l.transaction);
    const externalId = prev?.external_id ?? old?.external_id ?? vrexaExternalId(input.reference, input.propertyId, l.transaction);
    const bodyHash = vrexaHash(l.body);
    const unchanged = prev && prev.body_hash === bodyHash && prev.photos_hash === photosHash && prev.status !== "rejected" && prev.status !== "inactive";
    if (unchanged) { out.push(prev); actions.push(`skip:${externalId}`); continue; }
    const body: VrexaBody = { ...l.body };
    if (!prev || prev.photos_hash !== photosHash) body.images = input.images;
    let r = await input.client.put(externalId, body);
    if (!r.ok && r.problem.code === "type_mismatch") {
      actions.push(`delete:${externalId}`);
      const d = await input.client.del(externalId);
      if (!d.ok && d.status !== 404) throw new VrexaPublishError(failMessage(d), d);
      r = await input.client.put(externalId, { ...l.body, images: input.images });
    }
    if (!r.ok) throw new VrexaPublishError(failMessage(r), r);
    actions.push(`put:${externalId}`);
    const base: VrexaOffer = prev ?? {
      transaction: l.transaction, reference: externalId, id: externalId, url: "", external_id: externalId, vrexa_id: null,
      status: "processing", rejection_reason: null, body_hash: null, photos_hash: null, env: input.env,
    };
    out.push({ ...applyVrexaRemote(base, r.data ?? {}, input.nowIso), body_hash: bodyHash, photos_hash: photosHash, env: input.env });
  }
  for (const o of mine) {
    if (input.listings.some((l) => l.transaction === o.transaction)) continue;
    const d = await input.client.del(o.external_id);
    if (!d.ok && d.status !== 404) throw new VrexaPublishError(failMessage(d), d);
    actions.push(`delete:${o.external_id}`);
    out.push({ ...o, status: "deleted", url: "", checked_at: input.nowIso });
  }
  return { offers: out, actions };
}

/** Retragere: DELETE pe fiecare ofertă din mediul curent; 404 = succes. */
export async function withdrawVrexa(stored: VrexaOffer[], env: VrexaEnv, client: VrexaPublishClient, nowIso: string): Promise<{ offers: VrexaOffer[]; actions: string[] }> {
  const actions: string[] = [];
  const out: VrexaOffer[] = [];
  for (const o of stored.filter((x) => vrexaOfferEnv(x) === env && x.status !== "deleted")) {
    const d = await client.del(o.external_id);
    if (!d.ok && d.status !== 404) throw new VrexaPublishError(failMessage(d), d);
    actions.push(`delete:${o.external_id}${!d.ok ? ":404" : ""}`);
    out.push({ ...o, status: "deleted", url: "", checked_at: nowIso });
  }
  return { offers: out, actions };
}
