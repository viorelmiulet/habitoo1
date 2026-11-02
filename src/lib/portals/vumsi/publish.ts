/**
 * Vumsi: pașii de publicare cu un apel injectat (testabil fără rețea).
 *  - agent (`/users/`) și agenție (`/companies/`): GET după ID-ul nostru, POST doar dacă lipsesc;
 *  - anunț: GET `/listings/by-external-id/{ext}/` → PATCH (fără status) sau POST (fără dubluri);
 *  - poze: multipart câte una (`image`), la actualizare se șterg doar cele scoase, toate, în ordine (`order`), formatul original;
 *  - publish / unpublish; DELETE doar la ștergerea definitivă.
 */
import type { VumsiCallFail, VumsiMethod } from "./client.server";
import { prepareVumsiImage } from "./jpeg";
import type { VumsiCompanyPayload, VumsiListingBody, VumsiTransaction, VumsiUserPayload } from "./mapper";

export const VUMSI_STATUS_TTL_MS = 60_000;
export const VUMSI_IMAGES_PENDING_MESSAGE = "Pozele nu au ajuns la Vumsi – se reîncearcă la următoarea salvare";

export type VumsiCall = <T>(method: VumsiMethod, path: string, opts?: { json?: unknown; form?: FormData; query?: Record<string, string | number> }) =>
  Promise<{ ok: true; status: number; data: T } | VumsiCallFail>;

export type VumsiImageRef = { source: string; id: number };
export type VumsiStored = {
  external_id: string;
  transaction: VumsiTransaction;
  vumsi_uuid: string | null;
  status: number | null;
  public_url: string | null;
  expires_at: string | null;
  images: VumsiImageRef[];
  status_checked_at: string | null;
  deleted_at: string | null;
};

export { vumsiStatusInfo, type VumsiStatusInfo } from "./status";

const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const uuidOf = (v: unknown) => (typeof rec(v)["uuid"] === "string" ? (rec(v)["uuid"] as string) : null);

/** Codurile numite din documentația Vumsi (`reference.listing_statuses`). */
export const VUMSI_STATUS_NAMES: Record<string, number> = {
  unpublished: 0, pending_review: 1, published: 2, draft: 3, rejected: 4, expired: 5, disabled_by_company: 6,
};

/** Status Vumsi în orice formă: 2, "2", "published", {value|id|code, code|name|label}. */
export function parseVumsiStatus(v: unknown, names: Record<string, number> = VUMSI_STATUS_NAMES): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (/^\d+$/.test(t)) return Number(t);
    const n = names[t.toLowerCase()];
    return n === undefined ? null : n;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const k of ["value", "id", "code", "name"]) {
      const n = parseVumsiStatus(o[k], names);
      if (n !== null) return n;
    }
  }
  return null;
}

/** Forma răspunsului (doar chei și tipuri), pentru log fără date personale. */
export function vumsiStatusShape(v: unknown): string {
  const s = rec(v)["status"];
  if (s && typeof s === "object" && !Array.isArray(s)) return `status:{${Object.entries(s).map(([k, x]) => `${k}:${typeof x}`).join(",")}}`;
  return `status:${s === null ? "null" : typeof s}; keys:${Object.keys(rec(v)).slice(0, 20).join(",")}`;
}

export function readListing(v: unknown, names?: Record<string, number>) {
  const r = rec(v);
  return {
    uuid: uuidOf(v),
    status: parseVumsiStatus(r["status"], names),
    url: typeof r["url"] === "string" && /^https:\/\//.test(r["url"] as string) ? (r["url"] as string) : null,
    expires_at: typeof r["expires_at"] === "string" ? (r["expires_at"] as string) : null,
    reason: (["rejection_reason", "moderation_reason", "reject_reason", "reason"] as const)
      .map((k) => r[k]).find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim() ?? null,
  };
}

/** GET după ID-ul nostru; POST doar la 404. Întoarce uuid-ul Vumsi. */
export async function ensureVumsiAccount(
  call: VumsiCall,
  kind: "user" | "company",
  payload: VumsiUserPayload | VumsiCompanyPayload,
  known: string | null,
): Promise<{ ok: true; uuid: string; created: boolean } | { ok: false; fail: VumsiCallFail }> {
  if (known) return { ok: true, uuid: known, created: false };
  const ext = kind === "user" ? (payload as VumsiUserPayload).external_user_id : (payload as VumsiCompanyPayload).external_company_id;
  const base = kind === "user" ? "/users/" : "/companies/";
  const found = await call<unknown>("GET", `${base}by-external-id/${encodeURIComponent(ext)}/`);
  if (found.ok && uuidOf(found.data)) return { ok: true, uuid: uuidOf(found.data)!, created: false };
  if (!found.ok && found.kind !== "not_found") return { ok: false, fail: found };
  const created = await call<unknown>("POST", base, { json: payload });
  if (!created.ok) return { ok: false, fail: created };
  const uuid = uuidOf(created.data);
  if (!uuid) return { ok: false, fail: { ok: false, kind: "server_error", status: created.status, message: "Vumsi nu a întors identificatorul contului creat.", transient: true, retryAfterMs: null, body: created.data } };
  return { ok: true, uuid, created: true };
}

/** Anunțul după `external_id`: PATCH dacă există, altfel POST. */
export async function upsertVumsiListing(call: VumsiCall, body: VumsiListingBody, stored: VumsiStored | null) {
  let uuid: string | null = null;
  const found = await call<unknown>("GET", `/listings/by-external-id/${encodeURIComponent(body.external_id)}/`);
  if (found.ok) uuid = uuidOf(found.data);
  else if (found.kind !== "not_found") return { ok: false as const, fail: found };
  if (uuid) {
    const r = await call<unknown>("PATCH", `/listings/${uuid}/`, { json: body });
    if (!r.ok) return { ok: false as const, fail: r };
    const l = readListing(r.data);
    // Galeria salvată e valabilă doar pentru același anunț.
    const images = stored?.vumsi_uuid === uuid ? stored.images : [];
    return { ok: true as const, action: "updated" as const, uuid, listing: { ...l, uuid }, images, httpStatus: r.status };
  }
  const r = await call<unknown>("POST", "/listings/", { json: body });
  if (!r.ok) return { ok: false as const, fail: r };
  const l = readListing(r.data);
  if (!l.uuid) return { ok: false as const, fail: { ok: false, kind: "server_error", status: r.status, message: "Vumsi nu a întors identificatorul anunțului creat.", transient: true, retryAfterMs: null, body: r.data } as VumsiCallFail };
  return { ok: true as const, action: "created" as const, uuid: l.uuid, listing: l, images: [] as VumsiImageRef[], httpStatus: r.status };
}

export type VumsiDesiredImage = { source: string; url: string };
export type ImageFetcher = (url: string) => Promise<Blob | null>;

/** Șterge doar pozele scoase și încarcă doar cele noi (câte una, câmpul `image`). */
export async function syncVumsiImages(call: VumsiCall, uuid: string, desired: VumsiDesiredImage[], current: VumsiImageRef[], fetchImage: ImageFetcher) {
  const want = desired;
  const wanted = new Set(want.map((d) => d.source));
  const kept = new Map(current.filter((c) => wanted.has(c.source)).map((c) => [c.source, c]));
  const warnings: string[] = [];
  let deleted = 0;
  let uploaded = 0;
  for (const c of current) {
    if (wanted.has(c.source)) continue;
    const r = await call<unknown>("DELETE", `/listings/${uuid}/images/${c.id}/`);
    if (!r.ok && r.kind !== "not_found") return { ok: false as const, fail: r, images: [...kept.values()] };
    deleted += 1;
  }
  const result: VumsiImageRef[] = [];
  for (const [order, d] of want.entries()) {
    const k = kept.get(d.source);
    if (k) { result.push(k); continue; }
    const blob = await fetchImage(d.url);
    if (!blob) { warnings.push("O poză nu a putut fi citită și a fost omisă."); continue; }
    const img = prepareVumsiImage(new Uint8Array(await blob.arrayBuffer()));
    if (!img.ok) { warnings.push(`O poză a fost omisă (${img.reason}).`); continue; }
    const form = new FormData();
    form.append("image", new Blob([img.bytes as BlobPart], { type: img.mime }), `poza-${order + 1}.${img.ext}`);
    form.append("order", String(order));
    const r = await call<unknown>("POST", `/listings/${uuid}/images/`, { form });
    if (!r.ok) return { ok: false as const, fail: r, images: [...result, ...[...kept.values()].filter((x) => !result.includes(x))] };
    const id = Number(rec(r.data)["id"]);
    if (Number.isInteger(id)) result.push({ source: d.source, id });
    uploaded += 1;
  }
  return { ok: true as const, images: result, deleted, uploaded, warnings };
}

/** Publish doar dacă anunțul nu e deja publicat sau în moderare. */
export async function publishVumsiListing(call: VumsiCall, uuid: string, status: number | null) {
  if (status === 1 || status === 2) return { ok: true as const, status, url: null as string | null, expires_at: null as string | null, sent: false };
  const r = await call<unknown>("POST", `/listings/${uuid}/publish/`);
  if (!r.ok) return { ok: false as const, fail: r };
  const l = readListing(r.data);
  return { ok: true as const, status: l.status ?? 1, url: l.url, expires_at: l.expires_at, sent: true };
}

/** Retragere: unpublish (reversibil); DELETE doar când `hard` (ștergere definitivă). */
export async function withdrawVumsi(call: VumsiCall, stored: VumsiStored[], hard: boolean) {
  const changed: VumsiStored[] = [];
  for (const s of stored) {
    if (!s.vumsi_uuid || s.deleted_at) continue;
    if (hard) {
      const r = await call<unknown>("DELETE", `/listings/${s.vumsi_uuid}/`);
      if (!r.ok && r.kind !== "not_found") return { ok: false as const, fail: r, changed };
      changed.push({ ...s, status: null, deleted_at: new Date().toISOString(), images: [] });
      continue;
    }
    if (s.status === 0) continue;
    const r = await call<unknown>("POST", `/listings/${s.vumsi_uuid}/unpublish/`);
    if (!r.ok) return { ok: false as const, fail: r, changed };
    changed.push({ ...s, status: readListing(r.data).status ?? 0 });
  }
  return { ok: true as const, changed };
}

/** Statusul real, cel mult o dată pe minut pe anunț. */
export function vumsiStatusDue(s: VumsiStored, now: number): boolean {
  if (!s.vumsi_uuid || s.deleted_at) return false;
  return !s.status_checked_at || now - Date.parse(s.status_checked_at) >= VUMSI_STATUS_TTL_MS;
}
