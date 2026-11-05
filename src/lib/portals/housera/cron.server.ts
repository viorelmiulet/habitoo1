/** Cronurile Housera: recuperarea evenimentelor (15 min) și disponibilitatea (zilnic). */
import { houseraBaseUrl, houseraConfigured } from "./config";
import { createHouseraClient } from "./client.server";
import { houseraAdmin, ingestPulledHouseraEvent, retryHouseraEvents } from "./events.server";
import { pullHouseraEvents, runHouseraAvailability, type HouseraAccountListing } from "./sync";
import { houseraListingStatus } from "./events";
import { parsePortalOffers } from "../imobiliare/offer-links";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Conn = { id: string; organization_id: string; portal_credentials_encrypted: string | null; settings: Record<string, unknown> | null };

async function connections(admin: Admin): Promise<Conn[]> {
  const { data } = await admin.from("portal_connections").select("id, organization_id, portal_credentials_encrypted, settings")
    .eq("portal", "housera").eq("status", "connected").not("portal_credentials_encrypted", "is", null);
  return ((data ?? []) as Conn[]).filter((c) => !(c.settings ?? {})["reconnect_required"]);
}

async function clientFor(c: Conn) {
  const { decryptPortalCredential } = await import("../crypto.server");
  const key = decryptPortalCredential(c.portal_credentials_encrypted!);
  if (!key) throw new Error("Cheia Housera a agenției nu poate fi citită.");
  return createHouseraClient({
    key, baseUrl: houseraBaseUrl(process.env),
    onUnauthorized: async () => (await import("./store.server")).markHouseraReconnect(c.organization_id),
  });
}

async function log(admin: Admin, orgId: string, operation: string, success: boolean, msg: string | null, extra: { httpStatus?: number | null; externalId?: string | null; response?: unknown; ms?: number } = {}) {
  await admin.from("portal_operation_logs").insert({
    organization_id: orgId, portal: "housera", operation, success,
    error_message: success ? null : msg, http_status: extra.httpStatus ?? null, external_id: extra.externalId ?? null,
    portal_response: extra.response ?? (success && msg ? { note: msg } : null), duration_ms: extra.ms ?? null,
    environment: process.env["HOUSERA_ENV"] === "production" ? "production" : "staging",
  }).then(() => undefined, () => undefined);
}

export async function runHouseraEventsCron() {
  const admin = await houseraAdmin();
  const retried = await retryHouseraEvents(admin);
  if (!houseraConfigured(process.env)) return { ok: true, skipped: "not_configured", retried };
  const out: Array<{ organizationId: string; fetched: number; fresh: number; error?: string }> = [];
  for (const c of await connections(admin)) {
    const started = Date.now();
    const cursor = typeof c.settings?.["housera_events_cursor"] === "string" ? (c.settings["housera_events_cursor"] as string) : null;
    let saved = cursor;
    try {
      const client = await clientFor(c);
      const r = await pullHouseraEvents({
        client, cursor,
        handle: async (e) => { const fresh = await ingestPulledHouseraEvent(admin, c.organization_id, e); saved = e.id; return fresh; },
      });
      saved = r.cursor;
      out.push({ organizationId: c.organization_id, fetched: r.fetched, fresh: r.fresh });
      await log(admin, c.organization_id, "sync_events", true, `evenimente: ${r.fetched}, noi: ${r.fresh}, duplicate: ${r.duplicates}`, { ms: Date.now() - started });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "eroare";
      out.push({ organizationId: c.organization_id, fetched: 0, fresh: 0, error: msg });
      await log(admin, c.organization_id, "sync_events", false, msg, { ms: Date.now() - started });
    }
    if (saved !== cursor) {
      const { data: fresh } = await admin.from("portal_connections").select("settings").eq("id", c.id).maybeSingle();
      await admin.from("portal_connections").update({ settings: { ...((fresh?.settings as Record<string, unknown>) ?? {}), housera_events_cursor: saved } }).eq("id", c.id);
    }
  }
  return { ok: true, retried, agencies: out };
}

type Row = { id: string; property_id: string; status: string; portal_offers: unknown };

export async function runHouseraAvailabilityCron(nowMs = Date.now()) {
  if (!houseraConfigured(process.env)) return { ok: true, skipped: "not_configured" };
  const admin = await houseraAdmin();
  const out: Array<Record<string, unknown>> = [];
  for (const c of await connections(admin)) {
    const org = c.organization_id;
    const [{ data: rows }, { data: pubs }] = await Promise.all([
      admin.from("portal_listings").select("id, property_id, status, portal_offers").eq("organization_id", org).eq("portal", "housera"),
      admin.from("portal_publications").select("property_id").eq("organization_id", org).eq("portal_key", "housera").eq("enabled", true),
    ]);
    const listings = (rows ?? []) as Row[];
    const enabled = new Set(((pubs ?? []) as Array<{ property_id: string }>).map((p) => p.property_id));
    const propIds = listings.map((l) => l.property_id);
    const { data: props } = propIds.length
      ? await admin.from("properties").select("id").in("id", propIds).eq("status", "active").is("deleted_at", null)
      : { data: [] };
    const active = new Set(((props ?? []) as Array<{ id: string }>).map((p) => p.id));
    const byCode = new Map<string, Row>();
    const byRef = new Map<string, Row>();
    for (const l of listings) for (const o of parsePortalOffers(l.portal_offers)) { byCode.set(o.id, l); byRef.set(o.reference, l); }
    const rowOf = (l: HouseraAccountListing) => byCode.get(l.code) ?? (l.externalRef ? byRef.get(l.externalRef) : undefined);
    try {
      const r = await runHouseraAvailability({
        client: await clientFor(c), nowMs,
        eligible: (l) => { const row = rowOf(l); return !!row && row.status !== "withdrawn" && enabled.has(row.property_id) && active.has(row.property_id); },
        reconcile: async (l) => {
          const row = rowOf(l);
          if (!row) return false;
          const offers = parsePortalOffers(row.portal_offers);
          const o = offers.find((x) => x.id === l.code) ?? offers.find((x) => x.reference === l.externalRef);
          if (!o) return false;
          if ((l.status ?? o.status) === o.status && (l.etag ?? o.etag) === o.etag) return true;
          if (l.status) o.status = l.status;
          if (l.etag) o.etag = l.etag;
          row.portal_offers = offers;
          row.status = houseraListingStatus(offers, row.status);
          await admin.from("portal_listings").update({ portal_offers: offers, status: row.status, last_sync_at: new Date().toISOString() }).eq("id", row.id);
          return true;
        },
        log: async (e) => {
          const row = byCode.get(e.code);
          await admin.from("portal_operation_logs").insert({
            organization_id: org, portal: "housera", operation: "confirm_availability", success: e.success,
            error_message: e.success ? null : e.note, http_status: e.httpStatus, external_id: e.code,
            property_id: row?.property_id ?? null, portal_response: { note: e.note },
          }).then(() => undefined, () => undefined);
        },
      });
      out.push({ organizationId: org, listed: r.listed, confirmed: r.confirmed.length, skipped: r.skipped.length, failed: r.failed.length });
      await log(admin, org, "sync_availability", true, `anunțuri: ${r.listed}, reconciliate: ${r.reconciled}, confirmate: ${r.confirmed.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "eroare";
      out.push({ organizationId: org, error: msg });
      await log(admin, org, "sync_availability", false, msg);
    }
  }
  return { ok: true, agencies: out };
}
