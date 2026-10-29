/**
 * ZonaTa pasul 3: publicare (POST /listings, idempotent după `external_id`),
 * republicare după retragere (PATCH `{status:"active"}` + POST), retragere
 * (DELETE fără `permanent`) și citirea statusului (GET /listings/ext:{id}).
 * Fără bază de date: persistarea o face adaptorul.
 */
import { zonataRequest, type ZonataCallFail, type ZonataDeps } from "./client";
import type { ZonataListingBody, ZonataTransaction } from "./mapper";
import { zonataKeyMode } from "./key";

export type ZonataStatus = "test" | "in_review" | "active" | "rejected" | "withdrawn" | "sold" | "expired";
export const ZONATA_STATUSES: readonly ZonataStatus[] = ["test", "in_review", "active", "rejected", "withdrawn", "sold", "expired"];

export const ZONATA_STATUS_LABEL: Record<ZonataStatus, string> = {
  test: "Validat în mod test – nimic publicat pe ZonaTa",
  in_review: "În verificare",
  active: "Publicat",
  rejected: "Respins",
  withdrawn: "Retras",
  sold: "Vândut",
  expired: "Expirat",
};

/** Statusul ZonaTa → vocabularul `portal_listings.status`. */
export const ZONATA_PORTAL_STATUS: Record<ZonataStatus, "pending" | "published" | "error" | "withdrawn"> = {
  test: "withdrawn",
  in_review: "pending",
  active: "published",
  rejected: "error",
  withdrawn: "withdrawn",
  sold: "withdrawn",
  expired: "withdrawn",
};

/** Verificarea statusului: cel mult o dată pe minut pe anunț. */
export const ZONATA_STATUS_CHECK_MIN_MS = 60_000;

export function zonataStatusCheckDue(lastCheckedAt: string | null | undefined, now: number): boolean {
  if (!lastCheckedAt) return true;
  const t = Date.parse(lastCheckedAt);
  return !Number.isFinite(t) || now - t >= ZONATA_STATUS_CHECK_MIN_MS;
}

export function zonataListingPath(externalId: string): string {
  return `/listings/ext:${encodeURIComponent(externalId)}`;
}

export type ZonataListingState = {
  externalId: string | null;
  zonataId: string | null;
  status: ZonataStatus | null;
  url: string | null;
  expiresAt: string | null;
  rejectedReason: string | null;
};

const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** Citire tolerantă: `{data:{…}}`, `{listing:{…}}` sau obiectul direct. */
export function readZonataListing(body: unknown): ZonataListingState {
  const root = rec(body) ?? {};
  const l = rec(root["data"]) ?? rec(root["listing"]) ?? root;
  const raw = (s(l["status"]) ?? s(root["status"]))?.toLowerCase() ?? null;
  const status = raw && (ZONATA_STATUSES as readonly string[]).includes(raw) ? (raw as ZonataStatus) : null;
  const url = s(l["url"]);
  return {
    externalId: s(l["external_id"]),
    zonataId: s(l["id"]),
    status,
    url: url && /^https:\/\/([a-z0-9-]+\.)*zonata\.ro\//i.test(url) ? url : null,
    expiresAt: s(l["expires_at"]),
    rejectedReason: s(l["rejected_reason"]),
  };
}

export type ZonataWritten = { body: ZonataListingBody; transaction: ZonataTransaction; state: ZonataListingState; httpStatus: number; reactivated: boolean };

export type ZonataUpsertResult =
  | { ok: true; results: ZonataWritten[] }
  | { ok: false; fail: ZonataCallFail; done: ZonataWritten[] };

const txOf = (b: ZonataListingBody): ZonataTransaction => (b.external_id.endsWith("-i") ? "rent" : "sale");

/**
 * POST cu corpul complet pentru fiecare tranzacție. Anunțurile retrase/expirate
 * (`reactivate`) primesc întâi PATCH `{status:"active"}`; 404 la PATCH = anunțul nu mai
 * există, iar POST-ul îl creează din nou.
 */
export async function upsertZonataBodies(
  apiKey: string,
  bodies: ZonataListingBody[],
  reactivate: ReadonlySet<string>,
  deps: ZonataDeps = {},
): Promise<ZonataUpsertResult> {
  const done: ZonataWritten[] = [];
  for (const body of bodies) {
    let reactivated = false;
    if (reactivate.has(body.external_id)) {
      const patch = await zonataRequest<unknown>(apiKey, "PATCH", zonataListingPath(body.external_id), { status: "active" }, deps);
      if (!patch.ok && patch.kind !== "not_found") return { ok: false, fail: patch, done };
      reactivated = patch.ok;
    }
    let res = await zonataRequest<unknown>(apiKey, "POST", "/listings", body, deps);
    if (!res.ok && res.kind === "timeout" && zonataKeyMode(apiKey) === "live") {
      const found = await getZonataListing(apiKey, body.external_id, deps);
      if (found.ok) {
        const state = readZonataListing(found.data);
        if (state.zonataId && state.status && state.status !== "test" && (!state.externalId || state.externalId === body.external_id)) res = found;
      }
    }
    if (!res.ok) return { ok: false, fail: res, done };
    const state = readZonataListing(res.data);
    done.push({ body, transaction: txOf(body), state: { ...state, externalId: state.externalId ?? body.external_id }, httpStatus: res.status, reactivated });
  }
  return { ok: true, results: done };
}

export type ZonataWithdrawResult =
  | { ok: true; withdrawn: string[]; missing: string[] }
  | { ok: false; fail: ZonataCallFail };

/** DELETE fără `permanent`: anunțul rămâne inactiv în contul agenției. */
export async function withdrawZonata(apiKey: string, externalIds: string[], deps: ZonataDeps = {}): Promise<ZonataWithdrawResult> {
  const withdrawn: string[] = [];
  const missing: string[] = [];
  for (const id of externalIds) {
    const res = await zonataRequest<unknown>(apiKey, "DELETE", zonataListingPath(id), undefined, deps);
    if (res.ok) withdrawn.push(id);
    else if (res.kind === "not_found") missing.push(id);
    else return { ok: false, fail: res };
  }
  return { ok: true, withdrawn, missing };
}

export function getZonataListing(apiKey: string, externalId: string, deps: ZonataDeps = {}) {
  return zonataRequest<unknown>(apiKey, "GET", zonataListingPath(externalId), undefined, deps);
}

/** Starea agregată pe proprietate (cea mai „problematică” câștigă). */
export function aggregateZonataStatus(statuses: (ZonataStatus | null)[]): ZonataStatus | null {
  const order: ZonataStatus[] = ["rejected", "in_review", "active", "expired", "sold", "withdrawn", "test"];
  for (const st of order) if (statuses.includes(st)) return st;
  return null;
}

export function zonataStatusMessage(st: ZonataListingState): string {
  if (!st.status) return "ZonaTa nu a raportat statusul anunțului.";
  if (st.status === "rejected") return `Respins de ZonaTa${st.rejectedReason ? `: ${st.rejectedReason}` : "."}`;
  return ZONATA_STATUS_LABEL[st.status];
}
