import { describe, expect, it } from "vitest";
import { handleSiteContact } from "./contacts.server";

type Row = Record<string, unknown>;
const ORG = "00000000-0000-0000-0000-00000000000a";
const OTHER = "00000000-0000-0000-0000-00000000000b";
const AGENT = "00000000-0000-0000-0000-0000000000a1";

/** Bază de date în memorie pentru lanțurile folosite de handler. */
function fakeDb(seed: Record<string, Row[]>) {
  const t: Record<string, Row[]> = { contacts: [], leads: [], lead_events: [], portal_messages: [], notifications: [], audit_logs: [], portal_lead_links: [], ...seed };
  let n = 0;
  function from(table: string) {
    t[table] ??= [];
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "update" | "upsert" = "select";
    let payload: Row | null = null;
    let limit = Infinity;
    const run = () => {
      if (op === "insert" || op === "upsert") {
        const row = { id: `id-${++n}`, ...payload! };
        if (op === "upsert") {
          const i = t[table]!.findIndex((r) => r["portal"] === row["portal"] && r["organization_id"] === row["organization_id"] && r["external_lead_id"] === row["external_lead_id"]);
          if (i >= 0) { t[table]![i] = { ...t[table]![i], ...payload! }; return [t[table]![i]!]; }
        }
        t[table]!.push(row);
        return [row];
      }
      const rows = t[table]!.filter((r) => filters.every((f) => f(r))).slice(0, limit);
      if (op === "update") rows.forEach((r) => Object.assign(r, payload));
      return rows;
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (v: Row) => { op = "insert"; payload = v; return b; },
      update: (v: Row) => { op = "update"; payload = v; return b; },
      upsert: (v: Row) => { op = "upsert"; payload = v; return Promise.resolve({ error: null, data: run() }); },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return b; },
      not: (k: string, _o: string, v: string) => { const s = v.replace(/[()]/g, "").split(","); filters.push((r) => !s.includes(String(r[k]))); return b; },
      limit: (x: number) => { limit = x; return b; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return b;
  }
  return { db: { from } as never, t };
}

const seed = () => ({
  properties: [
    { id: "11111111-1111-1111-1111-111111111111", organization_id: ORG, reference: "HB-1091", assigned_to: AGENT, title: "Apartament 2 camere" },
    { id: "22222222-2222-2222-2222-222222222222", organization_id: OTHER, reference: "HB-2000", assigned_to: null, title: "Altă agenție" },
  ],
});
const portal = { organizationId: ORG, portal: "imobiliareplus" };
const site = { organizationId: ORG, portal: null };

describe("POST /sites/v1/contacts", () => {
  it("idstr găsit → lead pe proprietate", async () => {
    const { db, t } = fakeDb(seed());
    const r = await handleSiteContact(db, site, { nume: "Ana Pop", telefon: "0722000000", idstr: "HB-1091" });
    expect(r.status).toBe(201);
    expect(t["leads"]![0]!["property_id"]).toBe("11111111-1111-1111-1111-111111111111");
  });
  it("idstr necunoscut sau din altă agenție → 404", async () => {
    const { db, t } = fakeDb(seed());
    expect(await handleSiteContact(db, portal, { nume: "Ana Pop", telefon: "0722000000", idstr: "HB-9999" })).toEqual({ status: 404, message: "Property not found." });
    expect(await handleSiteContact(db, portal, { nume: "Ana Pop", telefon: "0722000000", idstr: "HB-2000" })).toEqual({ status: 404, message: "Property not found." });
    expect(t["leads"]).toHaveLength(0);
  });
  it("fără telefon și email → 422", async () => {
    const { db } = fakeDb(seed());
    expect((await handleSiteContact(db, portal, { nume: "Ana Pop" })).status).toBe(422);
  });
  it("token de portal → sursa portalului, agentul proprietății, notificare", async () => {
    const { db, t } = fakeDb(seed());
    const r = await handleSiteContact(db, portal, { nume: "Ana Pop", email: "ana@x.ro", idstr: "HB-1091", mesaj: "Bună" });
    expect(r.status).toBe(201);
    const lead = t["leads"]![0]!;
    expect(lead["source"]).toBe("Imobiliare+");
    expect(lead["assigned_to"]).toBe(AGENT);
    expect(lead["contact_id"]).toBe(t["contacts"]![0]!["id"]);
    expect(t["contacts"]![0]!["source"]).toBe("Imobiliare+");
    expect(t["lead_events"]![0]!["note"]).toBe("Cerere primită de pe Imobiliare+");
    expect(t["notifications"]![0]!["user_id"]).toBe(AGENT);
  });
  it("același message_id de două ori → un lead, mesajul o dată", async () => {
    const { db, t } = fakeDb(seed());
    const body = { nume: "Ana Pop", email: "ana@x.ro", idstr: "HB-1091", mesaj: "Bună", message_id: "m-1" };
    const a = await handleSiteContact(db, portal, body);
    const b = await handleSiteContact(db, portal, body);
    expect(a.status).toBe(201);
    expect(b).toEqual({ status: 200, data: { lead_id: (a as { data: { lead_id: string } }).data.lead_id, contact_id: t["contacts"]![0]!["id"], deduplicated: true } });
    expect(t["leads"]).toHaveLength(1);
    expect(t["portal_messages"]).toHaveLength(1);
    expect(t["lead_events"]).toHaveLength(1);
  });
  it("token de site → comportament neschimbat", async () => {
    const { db, t } = fakeDb(seed());
    const r = await handleSiteContact(db, site, { nume: "Ana Pop", email: "ana@x.ro", id: "11111111-1111-1111-1111-111111111111", source: "home" });
    expect(r.status).toBe(201);
    const lead = t["leads"]![0]!;
    expect(lead["source"]).toBe("website:home");
    expect(lead["assigned_to"]).toBeUndefined();
    expect(t["contacts"]![0]!["source"]).toBe("Site-ul agenției");
    expect(t["lead_events"]![0]!["note"]).toBe("Lead primit din site (website:home).");
    expect(t["notifications"]).toHaveLength(0);
    const again = await handleSiteContact(db, site, { nume: "Ana Pop", email: "ana@x.ro", id: "11111111-1111-1111-1111-111111111111", mesaj: "Din nou" });
    expect(again).toMatchObject({ status: 201, data: { deduplicated: true } });
  });
});
