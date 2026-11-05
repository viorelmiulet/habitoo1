import { describe, expect, it, vi, beforeEach } from "vitest";
import { houseraSignature, houseraWebhookKey, verifyHouseraSignature } from "./webhook";
import { applyHouseraEffect, houseraEventEffect, parseHouseraEvent, HOUSERA_EDITED_WARNING } from "./events";
import { ingestPulledHouseraEvent } from "./events.server";
import { pullHouseraEvents, runHouseraAvailability, type HouseraAccountListing } from "./sync";
import { createHouseraClient, resetHouseraRateState } from "./client.server";
import type { PortalOffer } from "../imobiliare/offer-links";

const SECRET = "whsec_aGFiaXRvby13ZWJob29rLXRlc3Qta2V5LTMyYnl0ZXM=";
const ID = "msg_test_0001";
const TS = "1762371600";
const BODY = `{"id":"msg_test_0001","type":"webhook.test","created_at":"2026-11-05T19:00:00+00:00","data":{}}`;
const SIG = "v1,4+EaNe6eo9NrvoEk7Gyt82K7DuDJT3SGTVTRkjsKgC4=";
const check = (o: Partial<{ body: string; signature: string; nowSec: number }> = {}) =>
  verifyHouseraSignature({ secret: SECRET, id: ID, timestamp: TS, signature: o.signature ?? SIG, body: o.body ?? BODY, nowSec: o.nowSec ?? Number(TS) });

describe("semnătura webhook Housera", () => {
  it("vectorul de test dă semnătura documentată", async () => {
    expect(`v1,${await houseraSignature(houseraWebhookKey(SECRET)!, ID, TS, BODY)}`).toBe(SIG);
    expect((await check()).valid).toBe(true);
  });
  it("corp cu un spațiu în plus → invalid", async () => {
    expect((await check({ body: BODY.replace(`"data":{}`, `"data": {}`) })).valid).toBe(false);
  });
  it("timestamp cu 6 minute în urmă → respins", async () => {
    expect((await check({ nowSec: Number(TS) + 360 })).valid).toBe(false);
  });
  it("două semnături, una validă → acceptat", async () => {
    expect((await check({ signature: `v1,AAAAinvalidAAAA= ${SIG}` })).valid).toBe(true);
  });
});

// Bază de date simulată, cât e nevoie pentru jurnal + portal_listings.
function fakeDb(offers: PortalOffer[]) {
  const events: Array<Record<string, unknown>> = [];
  const listing = { id: "L1", organization_id: "org", property_id: "p1", status: "pending", portal_offers: offers, public_url: null, last_error: null, last_warning: null, published_at: null } as Record<string, unknown>;
  const listingUpdates: unknown[] = [];
  const admin = {
    from(table: string) {
      const q: Record<string, unknown> & { _filters: Array<[string, unknown]> } = { _filters: [] };
      let op: "select" | "insert" | "update" | "upsert" = "select";
      let payload: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain, eq: (k: string, v: unknown) => { q._filters.push([k, v]); return q; }, contains: (k: string, v: unknown) => { q._filters.push([`@${k}`, v]); return q; },
        limit: chain, order: chain, lt: chain,
        insert: (row: Record<string, unknown>) => { op = "insert"; payload = row; return q; },
        update: (p: Record<string, unknown>) => { op = "update"; payload = p; return q; },
        upsert: () => Promise.resolve({ error: null }),
        then: (res: (v: unknown) => unknown) => res(run()),
        maybeSingle: () => Promise.resolve(run()),
      });
      function run() {
        if (table === "portal_webhook_events") {
          if (op === "insert") {
            if (payload["external_event_id"] && events.some((e) => e["external_event_id"] === payload["external_event_id"])) return { data: null, error: { code: "23505" } };
            const row = { ...payload, id: `ev${events.length + 1}` };
            events.push(row);
            return { data: { id: row.id }, error: null };
          }
          if (op === "update") { const id = q._filters.find(([k]) => k === "id")?.[1]; Object.assign(events.find((e) => e.id === id) ?? {}, payload); }
          return { data: null, error: null };
        }
        if (table === "portal_listings") {
          if (op === "update") { listingUpdates.push(payload); Object.assign(listing, payload); return { data: null, error: null }; }
          const c = q._filters.find(([k]) => k === "@portal_offers")?.[1] as Array<Record<string, string>> | undefined;
          const hit = c && (listing.portal_offers as PortalOffer[]).some((o) => Object.entries(c[0]!).every(([k, v]) => (o as Record<string, unknown>)[k] === v));
          return { data: hit ? listing : null, error: null };
        }
        return { data: null, error: null };
      }
      return q;
    },
  };
  return { admin, events, listing, listingUpdates };
}

const offer = (status = "pending"): PortalOffer => ({ transaction: "sale", reference: "HB-p1-sale", id: "HEWPUTA8", url: "u", status, etag: `"v1"` });
const ev = (id: string, type: string, data: Record<string, unknown> = {}) => parseHouseraEvent({ id, type, created_at: "2026-11-05T19:00:00+00:00", data: { code: "HEWPUTA8", external_ref: "HB-p1-sale", ...data } })!;

describe("procesarea evenimentelor Housera", () => {
  it("același webhook-id de două ori → o singură procesare", async () => {
    const db = fakeDb([offer()]);
    const e = ev("01A", "listing.published", { status: "active", url: "https://housera.ro/anunt/hewputa8/x" });
    expect(await ingestPulledHouseraEvent(db.admin, "org", e)).toBe(true);
    expect(await ingestPulledHouseraEvent(db.admin, "org", e)).toBe(false);
    expect(db.listingUpdates).toHaveLength(1);
    expect(db.events[0]).toMatchObject({ processed: true });
  });

  it("listing.published → published + public_url", () => {
    const eff = houseraEventEffect(ev("1", "listing.published", { status: "active", url: "https://housera.ro/anunt/hewputa8/x" }));
    if (eff.kind !== "listing") throw new Error();
    const p = applyHouseraEffect({ status: "pending", portal_offers: [offer()], public_url: null, last_error: null, last_warning: null, published_at: null }, eff, "2026-11-05T19:00:00Z")!;
    expect(p.status).toBe("published");
    expect(p.public_url).toBe("https://housera.ro/anunt/hewputa8/x");
    expect(p.portal_offers![0]!.status).toBe("active");
  });

  it("listing.rejected → error cu motiv", () => {
    const eff = houseraEventEffect(ev("2", "listing.rejected", { status: "rejected", reason: "Date de contact în text.", rejection_codes: ["contact_in_text"] }));
    if (eff.kind !== "listing") throw new Error();
    const p = applyHouseraEffect({ status: "pending", portal_offers: [offer()], public_url: null, last_error: null, last_warning: null, published_at: null }, eff, "now")!;
    expect(p.status).toBe("error");
    expect(p.last_error).toContain("Date de contact în text.");
    expect(p.last_error).toContain("date de contact în text");
  });

  it("listing.edited_in_portal → etag nou + avertisment", () => {
    const eff = houseraEventEffect(ev("3", "listing.edited_in_portal", { status: "active", etag: `"v9"` }));
    if (eff.kind !== "listing") throw new Error();
    const p = applyHouseraEffect({ status: "published", portal_offers: [offer("active")], public_url: null, last_error: null, last_warning: null, published_at: "x" }, eff, "now")!;
    expect(p.portal_offers![0]!.etag).toBe(`"v9"`);
    expect(p.last_warning).toBe(HOUSERA_EDITED_WARNING);
  });
});

type Call = { url: string; method: string };
function client(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => { const c = { url, method: String(init.method) }; calls.push(c); return handler(c); });
  return { calls, client: createHouseraClient({ key: "12|hsr_test_abcdefgh", baseUrl: "https://staging.housera.ro/api/v1/", fetch: f as never, sleep: async () => {} }) };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => resetHouseraRateState());

describe("recuperarea evenimentelor", () => {
  it("două pagini, cursorul avansează, duplicatele cu webhook-ul se ignoră", async () => {
    const { client: c, calls } = client((call) => {
      const after = new URL(call.url).searchParams.get("after");
      if (after === "C0") return json(200, { data: [{ id: "E1", type: "listing.paused", data: {} }, { id: "E2", type: "listing.sold", data: {} }], meta: { next: "https://staging.housera.ro/api/v1/events?after=E2&limit=200" } });
      if (after === "E2") return json(200, { data: [{ id: "E3", type: "webhook.test", data: {} }], meta: { next: null } });
      return json(200, { data: [], meta: { next: null } });
    });
    const seen = new Set(["E2"]); // E2 a venit deja prin webhook
    const handled: string[] = [];
    const r = await pullHouseraEvents({ client: c, cursor: "C0", handle: async (e) => { handled.push(e.id); if (seen.has(e.id)) return false; seen.add(e.id); return true; } });
    expect(calls).toHaveLength(2);
    expect(new URL(calls[0]!.url).searchParams.get("limit")).toBe("200");
    expect(handled).toEqual(["E1", "E2", "E3"]);
    expect(r).toMatchObject({ cursor: "E3", fetched: 3, fresh: 2, duplicates: 1 });
  });
});

describe("confirmarea disponibilității", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  const tomorrow = "2026-11-06T12:00:00Z";
  const list = (confirm_by: string | null) => json(200, { data: [{ code: "HEWPUTA8", status: "active", etag: `"v2"`, external_ref: "HB-p1-sale", availability: { confirm_by } }], meta: { next_cursor: null } });
  const run = (handler: (c: Call) => Response, eligible: boolean) => {
    const { client: c, calls } = client(handler);
    const reconciled: HouseraAccountListing[] = [];
    return runHouseraAvailability({ client: c, nowMs: now, eligible: () => eligible, reconcile: async (l) => { reconciled.push(l); return true; } }).then((r) => ({ r, calls, reconciled }));
  };

  it("confirm_by mâine + bifat → confirm", async () => {
    const { r, calls, reconciled } = await run((c) => (c.method === "POST" ? json(200, { data: { status: "active", etag: `"v3"` } }) : list(tomorrow)), true);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(["GET /api/v1/account/listings", "POST /api/v1/listings/HEWPUTA8/confirm"]);
    expect(r.confirmed).toEqual(["HEWPUTA8"]);
    expect(reconciled[0]).toMatchObject({ status: "active", etag: `"v2"` });
  });

  it("debifat → fără apel de confirmare", async () => {
    const { r, calls } = await run(() => list(tomorrow), false);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(r.skipped).toEqual(["HEWPUTA8"]);
  });

  it("409 listing_action_refused → reușită", async () => {
    const { r } = await run((c) => (c.method === "POST" ? json(409, { code: "listing_action_refused" }) : list(tomorrow)), true);
    expect(r.failed).toEqual([]);
    expect(r.nothingToConfirm).toEqual(["HEWPUTA8"]);
  });
});
