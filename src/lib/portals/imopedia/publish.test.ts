/** Imopedia.ro — publicare/actualizare/retragere cu fetch simulat (format real ns1:Map). */
import { describe, expect, it } from "vitest";
import { createImopediaAdapter, type ImopediaDeps } from "../adapters/imopedia.server";
import { getPortalDefinition } from "../registry";
import type { PortalContext } from "../adapter";
import { imopediaIdLocal, readSavePropertySuccess } from "./publish";
import { parseSoapResponse } from "./soap";

const env = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="syncapi.imopedia.ro" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ns2="http://xml.apache.org/xml-soap" xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><SOAP-ENV:Body>${inner}</SOAP-ENV:Body></SOAP-ENV:Envelope>`;
const kv = (k: string, v: string) => `<item><key xsi:type="xsd:string">${k}</key><value${v}</value></item>`;
const map = (op: string, items: string) => env(`<ns1:${op}Response><return xsi:type="ns2:Map">${items}</return></ns1:${op}Response>`);
const ok = (op: string, extra = "") => map(op, kv("_isValid", ` xsi:type="xsd:boolean">true`) + extra);
const invalid = (op: string, field: string, msg: string) =>
  map(op, kv("_isValid", ` xsi:type="xsd:boolean">false`) +
    kv("_errors", ` SOAP-ENC:arrayType="ns2:Map[1]" xsi:type="SOAP-ENC:Array"><item xsi:type="ns2:Map">${kv("field", ` xsi:type="xsd:string">${field}`)}${kv("errorMessage", ` xsi:type="xsd:string">${msg}`)}${kv("errorCode", ` xsi:type="xsd:string">`)}</item>`));
const saved = (idLocal: number) =>
  ok("saveProperty", kv("_success", ` SOAP-ENC:arrayType="ns2:Map[1]" xsi:type="SOAP-ENC:Array"><item xsi:type="ns2:Map">${kv("result", ` xsi:type="ns2:Map">${kv("0", ` xsi:type="ns2:Map">${kv("ID_LOCAL", ` xsi:type="xsd:int">${idLocal}`)}${kv("property_id", ` xsi:type="xsd:int">778899`)}`)}`)}</item>`));
const loginOk = (n = 1) => env(`<ns1:loginResponse><return xsi:type="xsd:string">SESS${n}</return></ns1:loginResponse>`);
const logoutOk = env(`<ns1:logoutResponse><return xsi:type="xsd:boolean">true</return></ns1:logoutResponse>`);

type Call = { op: string; body: string };
function fakeFetch(responses: Record<string, string[]>) {
  const calls: Call[] = [];
  let logins = 0;
  const fetch = async (_url: string, init: RequestInit) => {
    const op = /method=(\w+)/.exec(String((init.headers as Record<string, string>).SOAPAction))![1]!;
    calls.push({ op, body: String(init.body) });
    if (op === "login") return new Response(loginOk(++logins), { status: 200 });
    if (op === "logout") return new Response(logoutOk, { status: 200 });
    const queue = responses[op] ?? [];
    const xml = queue.length > 1 ? queue.shift()! : queue[0]!;
    return new Response(xml, { status: 200 });
  };
  return { fetch, calls };
}

const ctx: PortalContext = {
  organizationId: "org-1",
  definition: getPortalDefinition("imopedia")!,
  direction: "habitoo_to_portal",
  authenticationMode: "username_password",
  externalAccountId: "apiuser",
  portalCredential: "secret-pass",
  settings: { agency_id: 4321 },
  allowLiveRequests: true,
};

const row = {
  id: "p1",
  reference: "HB-1009",
  property_type: "apartment",
  for_sale: true,
  sale_price: 120000,
  sale_currency: "EUR",
  commission: "2%",
  title: "Apartament 2 camere Drumul Taberei",
  description: "Apartament luminos, renovat, aproape de metrou.",
  usable_surface: 54,
  rooms: 2,
  county: "București",
  city: "București",
};
const mapContext = {
  agencyId: 4321,
  location: { status: "exact", regionId: 1, zonaId: 171, zonaText: "Drumul Taberei", reason: "" },
  collaboration: { active: false, commissionPercent: null },
  currentYear: 2026,
} as never;
const agent = { userId: "u1", fullName: "Agent Test", email: "a@example.com", phone: "0700000000" };

function deps(over: Partial<ImopediaDeps> = {}, link: { fingerprint: string | null; externalAccountId: string | null } = { fingerprint: null, externalAccountId: null }) {
  const synced: (string | null)[] = [];
  const d: ImopediaDeps = {
    loadProperty: async () => ({ ok: true, row: { ...row }, agent, mapContext }),
    agentLink: async () => ({ externalId: 55, ...link }),
    markAgentSynced: async (_o, _u, error, fp) => { synced.push(error ?? fp); },
    ...over,
  };
  return { d, synced };
}

describe("ID_LOCAL", () => {
  it("numărul din referință, cu limita xsd:int", () => {
    expect(imopediaIdLocal("HB-1009")).toBe(1009);
    expect(imopediaIdLocal("HB-ABC")).toBeNull();
    expect(imopediaIdLocal("HB-2147483648")).toBeNull();
  });
  it("_success[0].result ca obiect cu cheia 0", () => {
    expect(readSavePropertySuccess(parseSoapResponse(saved(1009)) as never)).toEqual({ idLocal: 1009, propertyId: "778899" });
  });
});

describe("publicare", () => {
  it("nouă: login → saveAgent → saveProperty → logout; ID_LOCAL și public_url", async () => {
    const f = fakeFetch({ saveAgent: [ok("saveAgent")], saveProperty: [saved(1009)] });
    const { d } = deps();
    const r = await createImopediaAdapter({ ...d, fetch: f.fetch }).publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(true);
    expect(f.calls.map((c) => c.op)).toEqual(["login", "saveAgent", "saveProperty", "logout"]);
    const save = f.calls[2]!.body;
    expect(save).toContain(`<options xsi:type="tns:SavePropertyType">`);
    expect(save).toContain(`<ID_LOCAL xsi:type="xsd:int">1009</ID_LOCAL>`);
    expect(save).toContain(`<AGENT_ID xsi:type="xsd:int">55</AGENT_ID>`);
    expect(save).toContain(`<AGENTIA xsi:type="xsd:int">4321</AGENTIA>`);
    expect(f.calls[1]!.body).toContain(`<CONTACT_TEL xsi:type="xsd:string">0700000000</CONTACT_TEL>`);
    expect(f.calls[1]!.body).not.toContain("AGENT_IMAGE");
    if (r.ok) {
      expect(r.data.externalId).toBe("1009");
      expect(r.data.publicUrl).toBe("https://www.imopedia.ro/anunt/proprietate-4321RUN1009");
      expect(JSON.stringify(r.data.portalResponse)).not.toContain("secret-pass");
      expect(JSON.stringify(r.data.portalResponse)).not.toContain("SESS1");
    }
  });

  it("actualizare: payload complet cu GOLD=0, agent nemodificat → fără saveAgent, ID_LOCAL din external_id", async () => {
    const { imopediaAgentFingerprint } = await import("./publish");
    const f = fakeFetch({ saveProperty: [saved(777)] });
    const { d } = deps({}, { fingerprint: imopediaAgentFingerprint(4321, agent), externalAccountId: "4321" });
    const r = await createImopediaAdapter({ ...d, fetch: f.fetch }).updateListing(ctx, { propertyId: "p1", externalId: "777" });
    expect(r.ok).toBe(true);
    expect(f.calls.map((c) => c.op)).toEqual(["login", "saveProperty", "logout"]);
    expect(f.calls[1]!.body).toContain(`<GOLD xsi:type="xsd:int">0</GOLD>`);
    expect(f.calls[1]!.body).toContain(`<ID_LOCAL xsi:type="xsd:int">777</ID_LOCAL>`);
    expect(f.calls[1]!.body).toContain(`<TITLU xsi:type="xsd:string">`);
  });

  it("ID_LOCAL întors diferit → eroare, fără externalId", async () => {
    const f = fakeFetch({ saveAgent: [ok("saveAgent")], saveProperty: [saved(9999)] });
    const r = await createImopediaAdapter({ ...deps().d, fetch: f.fetch }).publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("alt ID_LOCAL");
  });

  it("sesiune expirată la saveProperty → un re-login + o reîncercare, apoi eroare", async () => {
    const exp = invalid("saveProperty", "soap", "Invalid or expired session.");
    const f = fakeFetch({ saveAgent: [ok("saveAgent")], saveProperty: [exp] });
    const r = await createImopediaAdapter({ ...deps().d, fetch: f.fetch }).publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
    expect(f.calls.map((c) => c.op)).toEqual(["login", "saveAgent", "saveProperty", "logout", "login", "saveProperty", "logout"]);
    if (!r.ok) expect(r.message).toContain("Invalid or expired session.");

    const g = fakeFetch({ saveAgent: [ok("saveAgent")], saveProperty: [exp, saved(1009)] });
    const r2 = await createImopediaAdapter({ ...deps().d, fetch: g.fetch }).publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r2.ok).toBe(true);
    expect(g.calls[5]!.body).toContain("SESS2");
  });

  it("_isValid=false → mesajul din _errors; Internal server error → mesaj explicativ", async () => {
    const f = fakeFetch({ saveAgent: [ok("saveAgent")], saveProperty: [invalid("saveProperty", "T_V_PRET", "Pretul este invalid")] });
    const r = await createImopediaAdapter({ ...deps().d, fetch: f.fetch }).publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe("VALIDATION_ERROR"); expect(r.message).toContain("T_V_PRET: Pretul este invalid"); }

    const g = fakeFetch({ saveAgent: [ok("saveAgent")], saveProperty: [invalid("saveProperty", "server", "Internal server error")] });
    const r2 = await createImopediaAdapter({ ...deps().d, fetch: g.fetch }).publishListing(ctx, { propertyId: "p1", externalId: null });
    if (!r2.ok) expect(r2.message).toBe("Imopedia a respins oferta fără detalii (verifică agentul, prețul, moneda, regiunea și valorile numerice).");
    else throw new Error("expected failure");
  });

  it("saveAgent invalid → oprește publicarea", async () => {
    const f = fakeFetch({ saveAgent: [invalid("saveAgent", "CONTACT_TEL", "Telefon invalid")] });
    const r = await createImopediaAdapter({ ...deps().d, fetch: f.fetch }).publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
    expect(f.calls.map((c) => c.op)).toEqual(["login", "saveAgent", "logout"]);
  });

  it("referință fără număr / agent fără telefon → blocare înainte de orice apel", async () => {
    const f = fakeFetch({});
    const a = createImopediaAdapter({ ...deps({ loadProperty: async () => ({ ok: true, row: { ...row, reference: "HB-X" }, agent, mapContext }) }).d, fetch: f.fetch });
    const r = await a.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("ID_LOCAL");
    const b = createImopediaAdapter({ ...deps({ loadProperty: async () => ({ ok: true, row: { ...row }, agent: { ...agent, phone: null }, mapContext }) }).d, fetch: f.fetch });
    const r2 = await b.publishListing(ctx, { propertyId: "p1", externalId: null });
    if (!r2.ok) expect(r2.message).toContain("Agentul responsabil nu are telefon; Imopedia îl afișează ca date de contact.");
    else throw new Error("expected failure");
    expect(f.calls).toHaveLength(0);
  });
});

describe("retragere", () => {
  it("deleteProperty cu ID_LOCAL salvat; OK și pentru ofertă inexistentă", async () => {
    const f = fakeFetch({ deleteProperty: [ok("deleteProperty")] });
    const r = await createImopediaAdapter({ fetch: f.fetch }).withdrawListing(ctx, { propertyId: "p1", externalId: "1009" });
    expect(r.ok).toBe(true);
    expect(f.calls.map((c) => c.op)).toEqual(["login", "deleteProperty", "logout"]);
    expect(f.calls[1]!.body).toContain(`<options xsi:type="tns:DeletePropertyType"><ID_LOCAL xsi:type="xsd:int">1009</ID_LOCAL><AGENTIA xsi:type="xsd:int">4321</AGENTIA></options>`);
  });
});
