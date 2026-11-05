/**
 * Recuperarea evenimentelor (`GET events`) și confirmarea disponibilității
 * (`GET account/listings` + `POST listings/{code}/confirm`). Fără acces la DB:
 * persistența vine prin funcții injectate.
 */
import { HouseraError } from "./client.server";
import type { HouseraClientLike } from "./publish";
import { parseHouseraEvent, type HouseraEvent } from "./events";

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export const HOUSERA_EVENTS_PAGE = 200;
export const HOUSERA_MAX_PAGES = 25;

/** `meta.next`: adresa paginii următoare (cu `after=`) sau direct cursorul. */
export function houseraNextAfter(next: unknown): string | null {
  const n = str(next);
  if (!n) return null;
  if (/^https?:\/\//i.test(n)) {
    try { return new URL(n).searchParams.get("after"); } catch { return null; }
  }
  return n;
}

export type PullResult = { cursor: string | null; fetched: number; fresh: number; duplicates: number };

export async function pullHouseraEvents(input: {
  client: HouseraClientLike;
  cursor: string | null;
  /** Salvează și procesează; `false` = duplicat (deja văzut). Aruncă doar dacă nu s-a putut salva. */
  handle: (e: HouseraEvent) => Promise<boolean>;
  maxPages?: number;
}): Promise<PullResult> {
  let cursor = input.cursor;
  let fetched = 0, fresh = 0, duplicates = 0;
  for (let page = 0; page < (input.maxPages ?? HOUSERA_MAX_PAGES); page++) {
    const query: Record<string, string | number> = { limit: HOUSERA_EVENTS_PAGE };
    if (cursor) query["after"] = cursor;
    const r = await input.client.requestMeta<{ data?: unknown[]; meta?: { next?: unknown } } | null>("events", { query });
    const list = Array.isArray(r.data?.data) ? r.data!.data! : [];
    for (const raw of list) {
      const e = parseHouseraEvent(raw);
      if (!e) continue;
      fetched++;
      if (await input.handle(e)) fresh++; else duplicates++;
      cursor = e.id;
    }
    const next = houseraNextAfter(r.data?.meta?.next);
    if (!next || !list.length) break;
    cursor = next;
  }
  return { cursor, fetched, fresh, duplicates };
}

export type HouseraAccountListing = { code: string; status: string | null; etag: string | null; externalRef: string | null; confirmBy: string | null };

export const HOUSERA_CONFIRM_WINDOW_MS = 3 * 86_400_000;

/** Confirmare doar pentru anunțuri active/neconfirmate cu termenul în ≤3 zile sau depășit. */
export function houseraNeedsConfirm(l: HouseraAccountListing, nowMs: number): boolean {
  if (l.status !== "active" && l.status !== "unconfirmed") return false;
  if (!l.confirmBy) return l.status === "unconfirmed";
  const t = Date.parse(l.confirmBy);
  return Number.isFinite(t) && t - nowMs <= HOUSERA_CONFIRM_WINDOW_MS;
}

export type AvailabilityResult = { listed: number; reconciled: number; confirmed: string[]; skipped: string[]; nothingToConfirm: string[]; failed: string[] };

export async function runHouseraAvailability(input: {
  client: HouseraClientLike;
  nowMs: number;
  /** Anunțul e încă bifat pe Housera și proprietatea e publicată în Habitoo. */
  eligible: (l: HouseraAccountListing) => boolean;
  /** Sincronizează `status`/`etag` în `portal_offers`; `true` dacă anunțul e cunoscut. */
  reconcile: (l: HouseraAccountListing) => Promise<boolean>;
  log?: (entry: { code: string; success: boolean; note: string; httpStatus: number | null }) => Promise<void>;
  maxPages?: number;
}): Promise<AvailabilityResult> {
  const res: AvailabilityResult = { listed: 0, reconciled: 0, confirmed: [], skipped: [], nothingToConfirm: [], failed: [] };
  let cursor: string | null = null;
  for (let page = 0; page < (input.maxPages ?? HOUSERA_MAX_PAGES); page++) {
    const query: Record<string, string | number> = { fields: "code,status,etag,availability,external_ref", per_page: 100 };
    if (cursor) query["cursor"] = cursor;
    const r = await input.client.requestMeta<{ data?: Array<Record<string, unknown>>; meta?: { next_cursor?: unknown } } | null>("account/listings", { query });
    const rows = Array.isArray(r.data?.data) ? r.data!.data! : [];
    for (const row of rows) {
      const code = str(row["code"]);
      if (!code) continue;
      const av = row["availability"] && typeof row["availability"] === "object" ? (row["availability"] as Record<string, unknown>) : {};
      const l: HouseraAccountListing = { code, status: str(row["status"]), etag: str(row["etag"]), externalRef: str(row["external_ref"]), confirmBy: str(av["confirm_by"]) };
      res.listed++;
      if (await input.reconcile(l)) res.reconciled++;
      if (!houseraNeedsConfirm(l, input.nowMs)) continue;
      if (!input.eligible(l)) { res.skipped.push(code); continue; }
      try {
        const c = await input.client.requestMeta<{ data?: { status?: unknown; etag?: unknown } } | null>(`listings/${encodeURIComponent(code)}/confirm`, { method: "POST" });
        res.confirmed.push(code);
        await input.reconcile({ ...l, status: str(c.data?.data?.status) ?? "active", etag: str(c.data?.data?.etag) ?? l.etag, confirmBy: null });
        await input.log?.({ code, success: true, note: "disponibilitate confirmată", httpStatus: c.status });
      } catch (e) {
        if (e instanceof HouseraError && e.status === 409 && e.code === "listing_action_refused") {
          res.nothingToConfirm.push(code);
          await input.log?.({ code, success: true, note: "nimic de confirmat", httpStatus: 409 });
          continue;
        }
        if (e instanceof HouseraError && (e.kind === "unauthorized" || e.kind === "rate_limited")) throw e;
        res.failed.push(code);
        await input.log?.({ code, success: false, note: e instanceof Error ? e.message : "eroare", httpStatus: e instanceof HouseraError ? e.status : null });
      }
    }
    const next = str(r.data?.meta?.next_cursor);
    if (!next || !rows.length) break;
    cursor = next;
  }
  return res;
}
