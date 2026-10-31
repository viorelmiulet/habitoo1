/**
 * Vumsi: pașii de publicare cu un apel injectat (testabil fără rețea).
 *  - agent (`/users/`) și agenție (`/companies/`): GET după ID-ul nostru, POST doar dacă lipsesc;
 *  - anunț: GET `/listings/by-external-id/{ext}/` → PATCH (fără status) sau POST (fără dubluri);
 *  - poze: multipart câte una (`image`), la actualizare se șterg doar cele scoase, max. 20;
 *  - publish / unpublish; DELETE doar la ștergerea definitivă.
 */
import type { VumsiCallFail, VumsiMethod } from "./client.server";
import { toVumsiJpeg } from "./jpeg";
import type { VumsiCompanyPayload, VumsiListingBody, VumsiTransaction, VumsiUserPayload } from "./mapper";

export const VUMSI_MAX_IMAGES = 20;
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

export type VumsiStatusInfo = { label: string; portalStatus: "pending" | "published" | "withdrawn" | "error"; online: boolean };

/** Statusurile Vumsi (`/reference/` listing_statuses) → eticheta din Habitoo. */
export function vumsiStatusInfo(status: number | null | undefined): VumsiStatusInfo {
  switch (status) {
    case 1: return { label: "În moderare Vumsi", portalStatus: "pending", online: false };
    case 2: return { label: "Publicat", portalStatus: "published", online: true };
    case 4: return { label: "Respins de Vumsi", portalStatus: "error", online: false };
    case 5: return { label: "Expirat", portalStatus: "withdrawn", online: false };
    case 0: return { label: "Retras", portalStatus: "withdrawn", online: false };
    case 3: return { label: "Ciornă la Vumsi", portalStatus: "pending", online: false };
    case 6: return { label: "Dezactivat de companie la Vumsi", portalStatus: "withdrawn", online: false };
    default: return { label: "Stare necunoscută", portalStatus: "pending", online: false };
  }
}

const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const uuidOf = (v: unknown) => (typeof rec(v)["uuid"] === "string" ? (rec(v)["uuid"] as string) : null);

export function readListing(v: unknown) {
  const r = rec(v);
  const status = Number(r["status"]);
  return {
    uuid: uuidOf(v),
    status: Number.isInteger(status) ? status : null,
    url: typeof r["url"] === "string" && /^https:\/\//.test(r["url"] as string) ? (r["url"] as string) : null,
    expires_at: typeof r["expires_at"] === "string" ? (r["expires_at"] as string) : null,
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
  const want = desired.slice(0, VUMSI_MAX_IMAGES);
  const wanted = new Set(want.map((d) => d.source));
  const kept = new Map(current.filter((c) => wanted.has(c.source)).map((c) => [c.source, c]));
  const warnings: string[] = [];
  if (desired.length > VUMSI_MAX_IMAGES) warnings.push(`Vumsi primește cel mult ${VUMSI_MAX_IMAGES} de poze; ${desired.length - VUMSI_MAX_IMAGES} nu au fost trimise.`);
  let deleted = 0;
  let uploaded = 0;
  for (const c of current) {
    if (wanted.has(c.source)) continue;
    const r = await call<unknown>("DELETE", `/listings/${uuid}/images/${c.id}/`);
    if (!r.ok && r.kind !== "not_found") return { ok: false as const, fail: r, images: [...kept.values()] };
    deleted += 1;
  }
  const result: VumsiImageRef[] = [];
  for (const d of want) {
    const k = kept.get(d.source);
    if (k) { result.push(k); continue; }
    const blob = await fetchImage(d.url);
    if (!blob) { warnings.push("O poză nu a putut fi citită și a fost omisă."); continue; }
    const jpg = toVumsiJpeg(new Uint8Array(await blob.arrayBuffer()));
    if (!jpg.ok) { warnings.push(`O poză a fost omisă (${jpg.reason}).`); continue; }
    const form = new FormData();
    form.append("image", new Blob([jpg.bytes as BlobPart], { type: "image/jpeg" }), `poza-${result.length + 1}.jpg`);
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
