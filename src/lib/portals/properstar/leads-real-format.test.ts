/** Formatul real Properstar (cele 5 exemple trimise de Properstar) — doar mock-uri. */
import { beforeEach, describe, expect, it } from "vitest";
import { makeFakeDb, type FakeOp } from "../../../../tests/mail/fake-db";
import { handleProperstarLead, PROPERSTAR_DIRECT_NOTE, PROPERSTAR_HIDDEN_CONTACT_NOTE } from "./leads.server";
import { properstarEntityId } from "./mapper";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
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
  if (upd) { hit.forEach((r) => Object.assign(r, upd.args[0])); return { data: null, error: null }; }
  return { data: single ? (hit[0] ?? null) : hit, error: null };
}
const db = () => makeFakeDb({ handler, rpc: () => ({ data: true, error: null }) }) as any;

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const AGENCY_ID = properstarEntityId("hb", ORG);
const AGENT_ID = properstarEntityId("ag", AGENT);
const env = { user: "u", password: "p" };
const auth = `Basic ${Buffer.from("u:p").toString("base64")}`;

/** Exemplele exacte Properstar; doar ID-urile de agenție/agent sunt cele ale datelor simulate. */
const real = (raw: string) => raw.replaceAll("hbf255a149456c48bca6", AGENCY_ID).replaceAll("ag336795478b954d57aa", AGENT_ID);
const GENERAL = real(`{"listing_id":"HB-1174","agency_id":"hbf255a149456c48bca6","agent_id":"ag336795478b954d57aa","lead_name":"Jane Doe","lead_email":"jane@example.com","lead_phone":"+1(234)567-8900","message":"Hello, I am interested in this property for sale. I’d like to know more details about it. Thank you.","gateway":"properstar"}`);
const HIDDEN = real(`{"listing_id":"HB-1174","agency_id":"hbf255a149456c48bca6","agent_id":"ag336795478b954d57aa","lead_name":"Jane Doe","lead_email":"jane.doe-ue90p79qekkazxyk2zepgq@reply.properstar.com","lead_phone":"","message":"Hello, I am interested in this property for sale. I’d like to know more details about it. Thank you.  This lead is provided by Properstar. To access full contact details, please visit https://www.properstar.com/professionals/partners/how-to-get-contact-details?fullname=Jane%20Doe&email=jane.doe-ue90p79qekkazxyk2zepgq%40reply.properstar.com&utm_medium=email&utm_source=notifications&utm_content=cta_how_to_get_contact_details&utm_campaign=listing  Conversation ID: (#GXXIA0)","gateway":"properstar"}`);
const TOUR = real(`{"listing_id":"HB-1174","agency_id":"hbf255a149456c48bca6","agent_id":"ag336795478b954d57aa","lead_name":"Jane Doe","lead_email":"jane@example.com","lead_phone":"+1(234)567-8900","message":"Hey there, I’d like to take a tour of this property. Are you available?  Preferred date: As soon as possible — Anytime ⚠️ The visit has not yet been confirmed. Reply to or call Jane Doe to finalize the appointment.","gateway":"properstar"}`);
const ADDRESS = real(`{"listing_id":"HB-1174","agency_id":"hbf255a149456c48bca6","agent_id":"ag336795478b954d57aa","lead_name":"Jane Doe","lead_email":"jane@example.com","lead_phone":"+1(234)567-8900","message":"Hello, I am interested in this property for sale. Could you please share the exact address? Thank you.","gateway":"properstar"}`);
const DIRECT = real(`{"listing_id":"ag336795478b954d57aa","agency_id":"hbf255a149456c48bca6","agent_id":"ag336795478b954d57aa","lead_name":"Jane Doe","lead_email":"jane@example.com","lead_phone":"+1(234)567-8900","message":"Hello,<br/><br/>I’ve seen your agent page on Properstar and I believe you can help me find my new home. Can you contact me?<br/><br/>Thanks in advance.<br/><br/>All the best","gateway":"properstar","test":true}`);

const call = (rawBody: string) => handleProperstarLead(db(), { rawBody, authorization: auth, headers: {} }, env);

beforeEach(() => {
  seq = 0;
  tables = {
    organizations: [{ id: ORG, name: "MRM" }],
    portal_connections: [{ organization_id: ORG, portal: "properstar", activated: true }],
    properties: [{ id: "p1", organization_id: ORG, assigned_to: OWNER, title: "Apartament", reference: "HB-1174", deleted_at: null }],
    profiles: [
      { id: AGENT, full_name: "Ana Agent", organization_id: ORG },
      { id: OWNER, full_name: "Ion Proprietar", organization_id: ORG },
    ],
  };
});

describe("Properstar — formatul real", () => {
  it("mesaj general: atribuit agentului din agent_id, telefon E.164", async () => {
    const r = await call(GENERAL);
    expect(r.status).toBe(200);
    expect(tables.leads![0]).toMatchObject({ property_id: "p1", assigned_to: AGENT, phone: "+12345678900" });
    expect(tables.leads![0]!.notes).toContain("Tip cerere: Mesaj general");
    expect(tables.notifications![0]!.user_id).toBe(AGENT);
  });

  it("contact ascuns: notă releu, telefon gol acceptat, link și Conversation ID intacte", async () => {
    const r = await call(HIDDEN);
    expect(r.status).toBe(200);
    const lead = tables.leads![0]!;
    expect(lead.phone).toBeNull();
    expect(lead.notes).toContain(PROPERSTAR_HIDDEN_CONTACT_NOTE);
    expect(lead.notes).toContain("https://www.properstar.com/professionals/partners/how-to-get-contact-details?fullname=Jane%20Doe&email=jane.doe-ue90p79qekkazxyk2zepgq%40reply.properstar.com&utm_medium=email&utm_source=notifications&utm_content=cta_how_to_get_contact_details&utm_campaign=listing");
    expect(lead.notes).toContain("Conversation ID: (#GXXIA0)");
  });

  it("vizionare: tipul și data preferată în notă și în eveniment", async () => {
    await call(TOUR);
    expect(tables.leads![0]!.notes).toContain("Tip cerere: Cerere vizionare (data preferată: As soon as possible — Anytime)");
    expect(tables.lead_events![0]!.note).toContain("Cerere vizionare");
  });

  it("adresă: „Cerere adresă”", async () => {
    await call(ADDRESS);
    expect(tables.leads![0]!.notes).toContain("Tip cerere: Cerere adresă");
  });

  it("mesaj direct către agent (test: true): răspunde cu agentul, nu scrie nimic", async () => {
    const r = await call(DIRECT);
    expect(r.body).toMatchObject({ status: "success", test: true, direct: true, agent: "Ana Agent", agency: "MRM" });
    expect(tables.leads ?? []).toHaveLength(0);
  });

  it("mesaj direct către agent (real): fără proprietate, notă, notificare la agent", async () => {
    const r = await call(DIRECT.replace(',"test":true', ""));
    expect(r.status).toBe(200);
    const lead = tables.leads![0]!;
    expect(lead).toMatchObject({ property_id: null, assigned_to: AGENT });
    expect(lead.notes).toContain(PROPERSTAR_DIRECT_NOTE);
    expect(lead.notes).not.toContain("negăsit");
    expect(lead.notes).toContain("I’ve seen your agent page");
    expect(tables.notifications![0]!.user_id).toBe(AGENT);
  });

  it("retry de 5 ori → un singur lead", async () => {
    for (let i = 0; i < 5; i += 1) expect((await call(GENERAL)).status).toBe(200);
    expect(tables.leads).toHaveLength(1);
    expect(tables.portal_messages).toHaveLength(1);
  });

  it("agent necunoscut la mesaj direct → 404 agent_not_found", async () => {
    const r = await call(DIRECT.replaceAll(AGENT_ID, "ag0000000000000000ff"));
    expect(r.status).toBe(404);
    expect(r.body["code"]).toBe("agent_not_found");
  });
});
