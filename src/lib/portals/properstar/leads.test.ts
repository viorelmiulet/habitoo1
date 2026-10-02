import { beforeEach, describe, expect, it } from "vitest";
import { makeFakeDb, type FakeOp } from "../../../../tests/mail/fake-db";
import { handleProperstarLead, htmlToPlainText } from "./leads.server";
import { properstarEntityId } from "./mapper";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let rateAllowed = true;
let seq = 0;

function matches(row: Row, ops: FakeOp[]) {
  for (const { method, args } of ops) {
    const [col, a, b] = args as [string, any, any];
    if (method === "eq" && row[col] !== a) return false;
    if (method === "is" && (row[col] ?? null) !== a) return false;
    if (method === "gte" && !(String(row[col]) >= String(a))) return false;
    if (method === "in" && !(a as unknown[]).includes(row[col])) return false;
    if (method === "not" && a === "is" && (row[col] ?? null) === b) return false;
    if (method === "not" && a === "in" && String(b).replace(/[()]/g, "").split(",").includes(row[col])) return false;
  }
  return true;
}

function handler(table: string, ops: FakeOp[]) {
  const rows = (tables[table] ??= []);
  const single = ops.some((o) => o.method === "single" || o.method === "maybeSingle");
  const ins = ops.find((o) => o.method === "insert");
  if (ins) {
    const row = { id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...(ins.args[0] as Row) };
    rows.push(row);
    return { data: single ? row : [row], error: null };
  }
  const upd = ops.find((o) => o.method === "update");
  const hit = rows.filter((r) => matches(r, ops));
  if (upd) {
    hit.forEach((r) => Object.assign(r, upd.args[0]));
    return { data: null, error: null };
  }
  return { data: single ? (hit[0] ?? null) : hit, error: null };
}

const db = () => makeFakeDb({ handler, rpc: () => ({ data: rateAllowed, error: null }) }) as any;

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_OFF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const env = { user: "ps-user", password: "ps-pass" };
const auth = `Basic ${Buffer.from("ps-user:ps-pass").toString("base64")}`;

const call = (body: unknown, authorization: string | null = auth, admin = db()) =>
  handleProperstarLead(admin, { rawBody: typeof body === "string" ? body : JSON.stringify(body), authorization, headers: {} }, env);

beforeEach(() => {
  rateAllowed = true;
  seq = 0;
  tables = {
    organizations: [{ id: ORG_A, name: "Agenția A" }, { id: ORG_B, name: "Agenția B" }, { id: ORG_OFF, name: "Fără Properstar" }],
    portal_connections: [
      { organization_id: ORG_A, portal: "properstar", activated: true },
      { organization_id: ORG_B, portal: "properstar", activated: true },
      { organization_id: ORG_OFF, portal: "properstar", activated: false },
    ],
    properties: [
      { id: "p1", organization_id: ORG_A, assigned_to: "agent1", title: "Apartament", reference: "HB-1088", deleted_at: null },
      { id: "p2", organization_id: ORG_A, assigned_to: "agent1", title: "Casă", reference: "HB-2000", deleted_at: null },
      { id: "p3", organization_id: ORG_B, assigned_to: "agent2", title: "Casă B", reference: "HB-2000", deleted_at: null },
      { id: "p4", organization_id: ORG_OFF, assigned_to: null, title: "X", reference: "HB-3000", deleted_at: null },
    ],
    profiles: [{ id: "agent1", full_name: "Bogdan M" }],
  };
});

const base = { listing_id: "HB-1088", lead_name: "Ion Pop", lead_email: "ion@example.com", message: "<p>Bună &amp; salut</p>" };

describe("Properstar leads endpoint", () => {
  it("200 creează lead pe agentul proprietății și loghează evenimentul", async () => {
    const r = await call(base);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "success", duplicate: false });
    expect(tables.leads![0]).toMatchObject({ property_id: "p1", assigned_to: "agent1", source: "Properstar", email: "ion@example.com" });
    expect(tables.portal_messages![0]).toMatchObject({ portal: "properstar", body: "Bună & salut" });
    expect(tables.notifications).toHaveLength(1);
    expect(tables.lead_events).toHaveLength(1);
    expect(tables.audit_logs).toHaveLength(1);
    const ev = tables.portal_webhook_events![0]!;
    expect(ev.portal).toBe("properstar");
    expect(JSON.stringify(ev)).not.toContain("ps-pass");
  });

  it("duplicat → același lead_id, nimic nou", async () => {
    const first = await call(base);
    const second = await call(base);
    expect(second.body).toEqual({ status: "success", lead_id: first.body["lead_id"], duplicate: true });
    expect(tables.leads).toHaveLength(1);
    expect(tables.portal_messages).toHaveLength(1);
  });

  it("mesaj nou de la aceeași persoană → atașat la lead-ul deschis", async () => {
    const first = await call(base);
    const second = await call({ ...base, message: "Altă întrebare" });
    expect(second.body).toMatchObject({ lead_id: first.body["lead_id"], duplicate: false });
    expect(tables.leads).toHaveLength(1);
    expect(tables.portal_messages).toHaveLength(2);
    expect(tables.leads![0]!.notes).toContain("Altă întrebare");
  });

  it("400 la JSON invalid, fără listing_id, fără contact, email invalid", async () => {
    for (const body of ["{nu", { lead_email: "a@b.ro" }, { listing_id: "HB-1088" }, { listing_id: "HB-1088", lead_email: "nu-e-email" }]) {
      const r = await call(body);
      expect(r.status).toBe(400);
      expect(r.body["code"]).toBe("invalid_payload");
    }
  });

  it("401 fără credențiale sau cu parolă greșită", async () => {
    expect((await call(base, null)).status).toBe(401);
    expect((await call(base, `Basic ${Buffer.from("ps-user:gresit").toString("base64")}`)).body["code"]).toBe("unauthorized");
    expect(tables.portal_webhook_events).toHaveLength(2);
  });

  it("403 agenție fără Properstar", async () => {
    expect((await call({ ...base, listing_id: "HB-3000" })).body["code"]).toBe("agency_not_enabled");
    expect((await call({ ...base, agency_id: properstarEntityId("hb", ORG_OFF) })).status).toBe(403);
  });

  it("404 anunț inexistent; 409 ambiguu fără agency_id", async () => {
    expect((await call({ ...base, listing_id: "HB-9999" })).body["code"]).toBe("listing_not_found");
    const amb = await call({ ...base, listing_id: "HB-2000" });
    expect(amb.status).toBe(409);
    expect(amb.body["code"]).toBe("ambiguous_listing");
    const ok = await call({ ...base, listing_id: "HB-2000", agency_id: properstarEntityId("hb", ORG_B) });
    expect(ok.status).toBe(200);
    expect(tables.leads![0]!.property_id).toBe("p3");
  });

  it("agency_id valid + anunț negăsit → lead fără proprietate", async () => {
    const r = await call({ ...base, listing_id: "HB-9999", agency_id: properstarEntityId("hb", ORG_A) });
    expect(r.status).toBe(200);
    expect(tables.leads![0]).toMatchObject({ organization_id: ORG_A, property_id: null });
    expect(tables.leads![0]!.notes).toContain("Anunț Properstar HB-9999 negăsit");
  });

  it("429 peste limită", async () => {
    rateAllowed = false;
    expect((await call(base)).status).toBe(429);
  });

  it("500 la eroare neprevăzută", async () => {
    const broken = makeFakeDb({ handler: (t) => (t === "portal_connections" ? { data: null, error: new Error("db down") } : { data: [], error: null }), rpc: () => ({ data: true, error: null }) }) as any;
    const r = await call(base, auth, broken);
    expect(r.status).toBe(500);
    expect(r.body["code"]).toBe("internal_error");
  });

  it("modul test nu scrie nimic, dar loghează", async () => {
    const r = await call({ ...base, test: true });
    expect(r.body).toEqual({ status: "success", test: true, listing: "HB-1088", agency: "Agenția A", agent: "Bogdan M" });
    expect(tables.leads ?? []).toHaveLength(0);
    expect(tables.portal_messages ?? []).toHaveLength(0);
    expect(tables.portal_webhook_events![0]!.process_note).toContain("[test]");
  });

  it("HTML transformat în text simplu", () => {
    expect(htmlToPlainText("<p>Salut<br>lume &lt;3 &#259;&#x219;</p><script>x</script>")).toBe("Salut\nlume <3 ăș");
    expect(htmlToPlainText("a".repeat(6000))!.length).toBe(5000);
  });
});
