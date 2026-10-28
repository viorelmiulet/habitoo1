import { describe, expect, it } from "vitest";
import {
  buildViewAgencyEnvelope,
  buildLoginEnvelope,
  parseSoapResponse,
  readImopediaResult,
  redactSoapXml,
  ImopediaSoapError,
} from "./soap";
import { createImopediaAdapter } from "../adapters/imopedia.server";
import { getPortalDefinition, validatePortalConfigValues } from "../registry";
import type { PortalContext } from "../adapter";

const env = (inner: string) =>
  `<?xml version="1.0"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"><SOAP-ENV:Body>${inner}</SOAP-ENV:Body></SOAP-ENV:Envelope>`;
const fault = env(`<SOAP-ENV:Fault><faultcode>SOAP-ENV:Client</faultcode><faultstring>Invalid login</faultstring></SOAP-ENV:Fault>`);
const loginOk = env(`<ns1:loginResponse><return xsi:type="xsd:string">SESS123</return></ns1:loginResponse>`);
const view = (valid: string, extra = "") =>
  env(`<ns1:viewAgencyResponse><return xsi:type="SOAP-ENC:Array">` +
    `<item><key xsi:type="xsd:string">_isValid</key><value xsi:type="xsd:string">${valid}</value></item>` +
    `<item><key xsi:type="xsd:string">_errors</key><value xsi:type="SOAP-ENC:Array"><item xsi:type="xsd:string">Agentia nu apartine contului</item></value></item>` +
    extra + `</return></ns1:viewAgencyResponse>`);

describe("plicuri SOAP Imopedia", () => {
  it("viewAgency: session_id + options tns:ViewAgencyType cu AGENTIA xsd:int", () => {
    const xml = buildViewAgencyEnvelope("TEST", 123);
    expect(xml).toContain(`xmlns:tns="syncapi.imopedia.ro"`);
    expect(xml).toContain(`<tns:viewAgency soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">`);
    expect(xml).toContain(`<session_id xsi:type="xsd:string">TEST</session_id>`);
    expect(xml).toContain(`<options xsi:type="tns:ViewAgencyType"><AGENTIA xsi:type="xsd:int">123</AGENTIA></options>`);
  });
  it("escapează XML", () => {
    expect(buildLoginEnvelope("a&b", "<p\"'>")).toContain(`<password xsi:type="xsd:string">&lt;p&quot;&apos;&gt;</password>`);
  });
});

describe("parser răspuns", () => {
  it("SOAP Fault → SOAP_FAULT cu faultstring", () => {
    expect(() => parseSoapResponse(fault)).toThrowError(ImopediaSoapError);
    try { parseSoapResponse(fault); } catch (e) { expect((e as ImopediaSoapError).code).toBe("SOAP_FAULT"); expect((e as Error).message).toBe("Invalid login"); }
  });
  it("array asociativ item/key/value, _isValid normalizat, _success cu cheia 0", () => {
    const r = readImopediaResult(parseSoapResponse(view("1",
      `<item><key xsi:type="xsd:string">_success</key><value><item><key>0</key><value>ok</value></item></value></item>`)));
    expect(r.isValid).toBe(true);
    expect(r.errors).toEqual(["Agentia nu apartine contului"]);
    expect(r.success).toEqual(["ok"]);
  });
  it("array indexat și tipuri numerice", () => {
    const v = parseSoapResponse(env(`<r><return xsi:type="SOAP-ENC:Array"><item xsi:type="xsd:int">1</item><item xsi:type="xsd:float">2.5</item></return></r>`));
    expect(v).toEqual([1, 2.5]);
  });
  it("redactează parola și session_id și trunchiază", () => {
    const out = redactSoapXml(`<password>secret</password><session_id>S1</session_id>${"x".repeat(30000)}`);
    expect(out).not.toContain("secret");
    expect(out).not.toContain("S1<");
    expect(out.length).toBeLessThan(20_100);
  });
});

function ctx(agency: unknown = 123): PortalContext {
  return {
    organizationId: "o", definition: getPortalDefinition("imopedia")!, direction: "habitoo_to_portal",
    authenticationMode: "username_password", externalAccountId: "user", portalCredential: "PAROLA-SECRETA",
    settings: { agency_id: agency }, allowLiveRequests: true,
  };
}
function fakeFetch(responses: Record<string, string>, calls: string[]) {
  return async (_u: string, init: RequestInit) => {
    const op = String((init.headers as Record<string, string>).SOAPAction).match(/method=(\w+)/)![1]!;
    calls.push(op);
    const body = responses[op] ?? env(`<x><return>true</return></x>`);
    return new Response(body, { status: body.includes("Fault") ? 500 : 200 });
  };
}

describe("testul conexiunii", () => {
  it("succes: login → viewAgency → logout, boost afișat, fără parolă/sesiune în jurnal", async () => {
    const calls: string[] = [];
    const adapter = createImopediaAdapter({ fetch: fakeFetch({ login: loginOk, viewAgency: view("true",
      `<item><key>boostAvailable</key><value xsi:type="xsd:int">5</value></item>`) }, calls) });
    const r = await adapter.testConnection(ctx());
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["login", "viewAgency", "logout"]);
    if (r.ok) {
      expect(r.data.detail).toContain("disponibile 5");
      const log = JSON.stringify(r.data.portalResponse);
      expect(log).not.toContain("SESS123");
      expect(log).not.toContain("PAROLA-SECRETA");
    }
  });
  it("credențiale greșite → mesaj fix, fără logout", async () => {
    const calls: string[] = [];
    const r = await createImopediaAdapter({ fetch: fakeFetch({ login: fault }, calls) }).testConnection(ctx());
    expect(r.ok === false && r.message).toBe("Utilizator sau parolă Imopedia greșite");
    expect(calls).toEqual(["login"]);
  });
  it("_isValid false → mesajul din _errors, logout tot apelat", async () => {
    const calls: string[] = [];
    const r = await createImopediaAdapter({ fetch: fakeFetch({ login: loginOk, viewAgency: view("false") }, calls) }).testConnection(ctx());
    expect(r.ok === false && r.message).toBe("Agentia nu apartine contului");
    expect(calls.at(-1)).toBe("logout");
  });
  it("AGENTIA invalid → eroare de configurare, fără cereri", async () => {
    const calls: string[] = [];
    const r = await createImopediaAdapter({ fetch: fakeFetch({}, calls) }).testConnection(ctx("0"));
    expect(r.ok === false && r.code).toBe("CONFIG_ERROR");
    expect(calls).toEqual([]);
  });
  it("validarea UI/server pentru ID agenție", () => {
    expect(validatePortalConfigValues("imopedia", { endpointUrl: "12" })).toBeNull();
    expect(validatePortalConfigValues("imopedia", { endpointUrl: "0" })).toMatch(/întreg/);
    expect(validatePortalConfigValues("imopedia", { endpointUrl: "1.5" })).toMatch(/întreg/);
  });
});
