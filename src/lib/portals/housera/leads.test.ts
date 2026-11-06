import { describe, expect, it, vi } from "vitest";
import { parseHouseraEvent } from "./events";
import { ingestPulledHouseraEvent } from "./events.server";
import { createHouseraClient, resetHouseraRateState } from "./client.server";
import { HOUSERA_NO_LEADS_READ } from "./leads.server";
import { sendEmail } from "@/lib/mailgun.server";

vi.mock("@/lib/mailgun.server", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));

type Row = Record<string, unknown>;
const UNIQUE: Record<string, string[]> = {
  portal_webhook_events: ["external_event_id"],
  portal_lead_links: ["portal", "organization_id", "external_lead_id"],
  portal_messages: ["portal", "organization_id", "external_message_id"],
  notifications: ["id"],
};

function fakeDb(seed: Record<string, Row[]>) {
  const t: Record<string, Row[]> = { ...seed };
  let n = 0;
  const admin = {
    from(table: string) {
      const rows = (t[table] ??= []);
      const f: Array<(r: Row) => boolean> = [];
      let op: "select" | "insert" | "update" | "upsert" = "select";
      let payload: Row = {};
      let lim = Infinity;
      const q: Record<string, unknown> = {};
      const match = () => rows.filter((r) => f.every((p) => p(r)));
      const dup = (row: Row) => { const k = UNIQUE[table]; return k && k.every((c) => row[c] != null) ? rows.find((r) => k.every((c) => r[c] === row[c])) : undefined; };
      function run() {
        if (op === "insert") {
          if (dup(payload)) return { data: null, error: { code: "23505" } };
          const row = { id: payload["id"] ?? `${table}-${++n}`, ...payload }; rows.push(row); return { data: row, error: null };
        }
        if (op === "upsert") { const d = dup(payload); if (d) Object.assign(d, payload); else rows.push({ id: `${table}-${++n}`, ...payload }); return { data: null, error: null }; }
        if (op === "update") { match().forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
        const m = match().slice(0, lim);
        return { data: m, error: null };
      }
      Object.assign(q, {
        select: () => q, order: () => q, lt: () => q,
        limit: (l: number) => { lim = l; return q; },
        eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return q; },
        is: (k: string, v: unknown) => { f.push((r) => (r[k] ?? null) === v); return q; },
        ilike: (k: string, v: string) => { f.push((r) => String(r[k] ?? "").toLowerCase() === v.toLowerCase()); return q; },
        not: (k: string, o: string, v: string) => { const list = v.replace(/[()]/g, "").split(","); f.push((r) => !(o === "in" && list.includes(String(r[k])))); return q; },
        contains: (k: string, s: unknown) => { if (typeof s !== "string") throw new Error("contains needs a JSON string"); const v = JSON.parse(s) as Row[]; f.push((r) => ((r[k] as Row[]) ?? []).some((o) => Object.entries(v[0]!).every(([a, b]) => o[a] === b))); return q; },
        insert: (p: Row) => { op = "insert"; payload = p; return q; },
        update: (p: Row) => { op = "update"; payload = p; return q; },
        upsert: (p: Row) => { op = "upsert"; payload = p; return q; },
        maybeSingle: () => { const r = run(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }); },
        single: () => { const r = run(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error }); },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
      });
      return q;
    },
  };
  return { admin, t };
}

const PID = "11111111-2222-4333-8444-555555555555";
const seed = () => ({
  profiles: [{ id: "agent-x", organization_id: "org", is_active: true, email: "ana@agentie.ro", full_name: "Ana" }, { id: "resp", organization_id: "org", is_active: true, email: "resp@agentie.ro" }],
  properties: [{ id: PID, organization_id: "org", title: "Apartament 2 camere", assigned_to: "resp" }],
  portal_listings: [{ id: "L1", organization_id: "org", portal: "housera", property_id: PID, portal_offers: [{ id: "HEWPUTA8", reference: `${PID}-sale`, transaction: "sale" }] }],
  user_roles: [{ user_id: "boss", organization_id: "org", role: "agency_admin" }],
});

const LEAD = { data: { id: "lead_1", source: "message", message: "Bună ziua, mai e disponibil?", price: 125000, contact: { name: "Ion Pop", phone: "+40722000000", email: "ion@ex.ro" }, listing: { code: "HEWPUTA8", external_ref: `${PID}-sale` }, agent: { email: "ANA@agentie.ro" } } };

function client(routes: Record<string, () => Response>) {
  resetHouseraRateState();
  const calls: string[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    const u = new URL(String(url));
    const key = `${u.pathname.replace(/^.*\/v1\//, "")}${u.search}`;
    calls.push(key);
    const h = routes[key] ?? routes[u.pathname.replace(/^.*\/v1\//, "")];
    return h ? h() : new Response("{}", { status: 404 });
  });
  return { calls, c: createHouseraClient({ key: "hk_test", baseUrl: "https://api.test/v1/", fetch: fetchFn as unknown as typeof fetch, sleep: async () => {} }) };
}
const json = (b: unknown, status = 200) => () => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const ev = (id: string, type: string, data: Row = {}, at = "2026-11-05T19:00:00+00:00") => parseHouseraEvent({ id, type, created_at: at, data: { lead_id: "lead_1", source: "message", ...data } })!;
const now = () => new Date("2026-11-05T20:00:00Z");

describe("cereri Housera → lead-uri", () => {
  it("lead.created cu source message → lead nou asignat agentului din agent.email", async () => {
    const { admin, t } = fakeDb(seed());
    const { c } = client({ "leads/lead_1": json(LEAD) });
    await ingestPulledHouseraEvent(admin, "org", ev("e1", "lead.created"), { client: c, now });
    expect(t.leads).toHaveLength(1);
    expect(t.leads![0]).toMatchObject({ assigned_to: "agent-x", property_id: PID, source: "Housera.ro", name: "Ion Pop", value: 125000 });
    expect(t.portal_lead_links![0]).toMatchObject({ external_lead_id: "lead_1", lead_id: t.leads![0]!.id });
    expect(t.portal_messages![0]).toMatchObject({ external_message_id: "housera:lead:lead_1:2026-11-05T19:00:00+00:00", conversation_id: "housera:lead_1" });
    const logs = JSON.stringify(t.portal_operation_logs);
    expect(logs).toContain("lead_import");
    expect(logs).not.toMatch(/ion@ex\.ro|0722|Ion Pop/);
  });

  it("același eveniment de două ori → un singur lead", async () => {
    const { admin, t } = fakeDb(seed());
    const { c } = client({ "leads/lead_1": json(LEAD) });
    await ingestPulledHouseraEvent(admin, "org", ev("e1", "lead.created"), { client: c, now });
    expect(await ingestPulledHouseraEvent(admin, "org", ev("e1", "lead.created"), { client: c, now })).toBe(false);
    expect(t.leads).toHaveLength(1);
  });

  it("lead.updated → notă nouă pe același lead", async () => {
    const { admin, t } = fakeDb(seed());
    const { c } = client({ "leads/lead_1": json(LEAD) });
    await ingestPulledHouseraEvent(admin, "org", ev("e1", "lead.created"), { client: c, now });
    const { c: c2 } = client({ "leads/lead_1": json({ data: { ...LEAD.data, source: "phone", message: null } }) });
    await ingestPulledHouseraEvent(admin, "org", ev("e2", "lead.updated", {}, "2026-11-05T19:30:00+00:00"), { client: c2, now });
    expect(t.leads).toHaveLength(1);
    expect(String(t.leads![0]!.notes)).toContain("Clientul a cerut să fie sunat.");
    expect(t.lead_events).toHaveLength(2);
  });

  it("H11: lead.updated cu alt status → notă „Etapa pe Housera”, etapa Habitoo neschimbată", async () => {
    const { admin, t } = fakeDb(seed());
    const { c } = client({ "leads/lead_1": json({ data: { ...LEAD.data, status: "new" } }) });
    await ingestPulledHouseraEvent(admin, "org", ev("e1", "lead.created"), { client: c, now });
    t.leads![0]!.stage = "negotiation";
    const { c: c2 } = client({ "leads/lead_1": json({ data: { ...LEAD.data, status: "viewing" } }) });
    await ingestPulledHouseraEvent(admin, "org", ev("e2", "lead.updated", {}, "2026-11-05T19:30:00+00:00"), { client: c2, now });
    expect(t.leads![0]!.stage).toBe("negotiation");
    const notes = (t.lead_events ?? []).map((e) => e.note).filter((n) => String(n).startsWith("Etapa pe Housera"));
    expect(notes).toEqual(["Etapa pe Housera: vizionare"]);
  });

  it("H11: ecoul propriei schimbări → fără notă", async () => {
    const { admin, t } = fakeDb(seed());
    const { c } = client({ "leads/lead_1": json({ data: { ...LEAD.data, status: "new" } }) });
    await ingestPulledHouseraEvent(admin, "org", ev("e1", "lead.created"), { client: c, now });
    Object.assign(t.portal_lead_links![0]!, { status_sent: "offer", status_remote: "new" });
    const { c: c2 } = client({ "leads/lead_1": json({ data: { ...LEAD.data, status: "offer" } }) });
    await ingestPulledHouseraEvent(admin, "org", ev("e2", "lead.updated", {}, "2026-11-05T19:30:00+00:00"), { client: c2, now });
    expect((t.lead_events ?? []).some((e) => String(e.note).startsWith("Etapa pe Housera"))).toBe(false);
  });

  it("lead.message_received cu două mesaje noi → două rânduri, last_message_id, o notificare", async () => {
    const { admin, t } = fakeDb(seed());
    const { c } = client({ "leads/lead_1": json(LEAD) });
    await ingestPulledHouseraEvent(admin, "org", ev("e1", "lead.created"), { client: c, now });
    t.portal_lead_links![0]!.last_message_id = "m0";
    const notifBefore = (t.notifications ?? []).length;
    const { c: c2, calls } = client({
      "leads/lead_1/messages?after=m0": json({ data: [
        { id: "m1", direction: "in", body: "Se poate sâmbătă?", created_at: "2026-11-05T19:40:00Z" },
        { id: "m2", direction: "in", body: "Sau duminică.", created_at: "2026-11-05T19:41:00Z" },
      ] }),
    });
    await ingestPulledHouseraEvent(admin, "org", ev("e3", "lead.message_received", { message_id: "m2" }), { client: c2, now });
    expect(calls).toContain("leads/lead_1/messages?after=m0");
    expect(t.portal_messages!.filter((m) => String(m.external_message_id).startsWith("housera:msg:"))).toHaveLength(2);
    expect(t.portal_lead_links![0]!.last_message_id).toBe("m2");
    expect(t.notifications!.length - notifBefore).toBe(1);
  });

  it("403 missing_ability → marcaj „fără drept leads:read”", async () => {
    const { admin, t } = fakeDb(seed());
    const { c } = client({ "leads/lead_1": json({ code: "missing_ability", ability: "leads:read" }, 403) });
    await ingestPulledHouseraEvent(admin, "org", ev("e1", "lead.created"), { client: c, now });
    expect(t.portal_webhook_events![0]!.process_note).toBe(HOUSERA_NO_LEADS_READ);
    expect(t.leads ?? []).toHaveLength(0);
    expect(t.notifications!.some((x) => x.user_id === "boss")).toBe(true);
  });
});

describe("H12 notificări Housera", () => {
  const mail = vi.mocked(sendEmail);
  const msgs = (after: string, list: Row[]) => client({ [`leads/lead_1/messages?after=${after}`]: json({ data: list }) });

  it("lead nou → notificare în aplicație + email la agentul responsabil, link la lead", async () => {
    mail.mockClear();
    const { admin, t } = fakeDb(seed());
    const { c } = client({ "leads/lead_1": json(LEAD) });
    await ingestPulledHouseraEvent(admin, "org", ev("e1", "lead.created"), { client: c, now });
    expect(t.notifications!.filter((n) => n.user_id === "agent-x")).toHaveLength(1);
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail.mock.calls[0]![0]).toMatchObject({ to: ["ana@agentie.ro"] });
    expect(String(mail.mock.calls[0]![0].text)).toContain(`/app/leads?lead=${t.leads![0]!.id}`);
    expect(String(mail.mock.calls[0]![0].subject)).toContain("Housera.ro");
  });

  it("mesaj nou → notificare; mesaj propriu → nimic; două mesaje rapide → un singur email", async () => {
    const { admin, t } = fakeDb(seed());
    const { c } = client({ "leads/lead_1": json(LEAD) });
    await ingestPulledHouseraEvent(admin, "org", ev("e1", "lead.created"), { client: c, now: () => new Date("2026-11-05T19:00:00Z") });
    t.portal_lead_links![0]!.last_message_id = "m0";
    t.portal_lead_links![0]!.last_email_notified_at = null;
    mail.mockClear();
    const before = t.notifications!.length;

    const { c: own } = msgs("m0", [{ id: "m1", direction: "out", body: "Răspunsul nostru", created_at: "2026-11-05T19:50:00Z" }]);
    await ingestPulledHouseraEvent(admin, "org", ev("e2", "lead.message_received", { message_id: "m1" }), { client: own, now });
    expect(t.notifications!.length).toBe(before);
    expect(mail).not.toHaveBeenCalled();

    const { c: c1 } = msgs("m1", [{ id: "m2", direction: "in", body: "Se poate sâmbătă?", created_at: "2026-11-05T19:55:00Z" }]);
    await ingestPulledHouseraEvent(admin, "org", ev("e3", "lead.message_received", { message_id: "m2" }), { client: c1, now });
    const { c: c2 } = msgs("m2", [{ id: "m3", direction: "in", body: "Sau duminică.", created_at: "2026-11-05T19:56:00Z" }]);
    await ingestPulledHouseraEvent(admin, "org", ev("e4", "lead.message_received", { message_id: "m3" }), { client: c2, now: () => new Date("2026-11-05T20:03:00Z") });
    expect(t.notifications!.length - before).toBe(2);
    expect(mail).toHaveBeenCalledTimes(1);
  });
});
