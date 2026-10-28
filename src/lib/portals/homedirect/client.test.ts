import { beforeEach, describe, expect, it } from "vitest";
import { homedirectRequest, getHomedirectStats, describeHomedirectStats, resetHomedirectClientState, HOMEDIRECT_USER_AGENT } from "./client.server";
import { HOMEDIRECT_DEV_URL, HOMEDIRECT_KEY_MISSING_MESSAGE, HOMEDIRECT_PROD_URL, homedirectKeyMissing, resolveHomedirectBaseUrl } from "./config";
import { derivePortalConnectionStatus, getPortalDefinition, portalCanPublish } from "../registry";
import { createHomedirectAdapter } from "../adapters/homedirect.server";

const KEY = "hd_crm_SECRETVALUE_123456";
const env = { HOMEDIRECT_CRM_API_KEY: KEY };
type Reply = [number, unknown, Record<string, string>?];
function fake(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const [status, body, headers] = replies.shift() ?? [200, {}];
    return new Response(JSON.stringify(body), { status, headers });
  }) as unknown as typeof globalThis.fetch;
  return { calls, sleeps, deps: { fetch, env, sleep: async (ms: number) => { sleeps.push(ms); } } };
}

beforeEach(() => resetHomedirectClientState());

describe("HomeDirect configurare", () => {
  const def = getPortalDefinition("homedirect")!;
  it("registry: cheie globală, fără câmpuri, publicare „În curând”", () => {
    expect(def).toMatchObject({ display_name: "HomeDirect.ro", activation: "approval", logo: "HD", capabilities: ["test_connection"], publish_coming_soon: true });
    expect(def.configuration_schema.fields).toEqual([]);
    expect(portalCanPublish("homedirect")).toBe(false);
  });
  it("fără cheie pe server → Deconectat, chiar dacă e activat", () => {
    expect(homedirectKeyMissing("homedirect", {})).toBe(true);
    expect(homedirectKeyMissing("homedirect", env)).toBe(false);
    expect(homedirectKeyMissing("zonata", {})).toBe(false);
    const status = (missing: boolean) => derivePortalConnectionStatus({ definition: def, activated: true, externalAccountId: null, hasPortalCredential: false, lastError: null, serverKeyMissing: missing });
    expect(status(true)).toBe("disconnected");
    expect(status(false)).toBe("connected");
  });
  it("fără cheie, cererea nu pleacă", async () => {
    const f = fake([]);
    const r = await homedirectRequest("GET", "/stats", undefined, { ...f.deps, env: {} });
    expect(r).toMatchObject({ ok: false, kind: "not_configured", message: HOMEDIRECT_KEY_MISSING_MESSAGE });
    expect(f.calls).toHaveLength(0);
  });
  it("URL de bază: implicit producție, dev acceptat, altceva refuzat", async () => {
    expect(resolveHomedirectBaseUrl(undefined)).toMatchObject({ ok: true, url: HOMEDIRECT_PROD_URL, environment: "production" });
    expect(resolveHomedirectBaseUrl(HOMEDIRECT_DEV_URL)).toMatchObject({ ok: true, environment: "development" });
    expect(resolveHomedirectBaseUrl("https://evil.example/api/crm/v1").ok).toBe(false);
    expect(resolveHomedirectBaseUrl("http://www.homedirect.ro/api/crm/v1").ok).toBe(false);
    const f = fake([]);
    const r = await homedirectRequest("GET", "/stats", undefined, { ...f.deps, env: { ...env, HOMEDIRECT_API_BASE_URL: "https://evil.example" } });
    expect(r).toMatchObject({ ok: false, kind: "invalid_base_url" });
    expect(f.calls).toHaveLength(0);
  });
});

describe("HomeDirect client", () => {
  it("header-e corecte și redirect manual; mediul dev", async () => {
    const f = fake([[200, { rateLimit: { limit: 10000, remaining: 9990, reset: "2026-10-28T21:00:00Z" } }]]);
    const r = await getHomedirectStats({ ...f.deps, env: { ...env, HOMEDIRECT_API_BASE_URL: HOMEDIRECT_DEV_URL } });
    expect(f.calls[0].url).toBe(`${HOMEDIRECT_DEV_URL}/stats`);
    expect(f.calls[0].init.redirect).toBe("manual");
    expect(f.calls[0].init.headers).toMatchObject({ "X-API-Key": KEY, "Content-Type": "application/json", Accept: "application/json", "User-Agent": HOMEDIRECT_USER_AGENT });
    expect(r.ok && describeHomedirectStats(r.data, r.environment)).toMatch(/Dezvoltare.*limită pe oră: 10000.*cereri rămase: 9990.*resetare: 23:00/);
  });
  it.each([
    [400, { error: "Validation failed", details: "Tip invalid", field: "propertyType", validValues: ["apartment", "house"] }, /Câmp: propertyType\. Tip invalid\. Valori acceptate: apartment, house\./],
    [401, { error: "Unauthorized" }, /^Cheia CRM HomeDirect este invalidă sau lipsește\.$/],
    [403, { error: "Forbidden" }, /^HomeDirect refuză operația \(permisiuni insuficiente sau anunțul nu aparține acestui cont\)\.$/],
    [404, { error: "Not found" }, /^Anunțul nu există la HomeDirect\.$/],
    [503, {}, /eroare/],
  ])("mesaj pentru %i", async (status, body, re) => {
    const f = fake([[status, body]]);
    const r = await homedirectRequest("GET", "/stats", undefined, f.deps);
    expect(!r.ok && r.message).toMatch(re);
    expect(!r.ok && r.transient).toBe(status >= 500);
  });
  it("409 întoarce existing.id / shortId", async () => {
    const f = fake([[409, { error: "DUPLICATE_EXTERNAL_ID", existing: { id: "abc", shortId: "HD123" } }]]);
    const r = await homedirectRequest("POST", "/listings", {}, f.deps);
    expect(r).toMatchObject({ ok: false, kind: "duplicate", existing: { id: "abc", shortId: "HD123" } });
  });
  it("429: o pauză și o singură reîncercare", async () => {
    const f = fake([[429, {}, { "Retry-After": "2" }], [429, {}]]);
    const r = await homedirectRequest("GET", "/stats", undefined, f.deps);
    expect(f.calls).toHaveLength(2);
    expect(f.sleeps).toEqual([2000]);
    expect(r).toMatchObject({ ok: false, kind: "rate_limited", transient: true });
  });
  it("429 urmat de succes", async () => {
    const f = fake([[429, {}], [200, { ok: 1 }]]);
    expect((await homedirectRequest("GET", "/stats", undefined, f.deps)).ok).toBe(true);
  });
  it("401 fără reîncercare", async () => {
    const f = fake([[401, {}]]);
    await homedirectRequest("GET", "/stats", undefined, f.deps);
    expect(f.calls).toHaveLength(1);
    expect(f.sleeps).toEqual([]);
  });
  it("rețea căzută = tranzitoriu", async () => {
    const fetch = (async () => { throw new TypeError("fail"); }) as unknown as typeof globalThis.fetch;
    const r = await homedirectRequest("GET", "/stats", undefined, { fetch, env });
    expect(r).toMatchObject({ ok: false, kind: "network_error", transient: true });
  });
  it("cheia nu apare în mesaje, corpul jurnalizat sau rezultatul adaptorului", async () => {
    const f = fake([[400, { error: `bad key ${KEY}`, details: `echo ${KEY}` }]]);
    const adapter = createHomedirectAdapter(f.deps);
    const r = await adapter.testConnection({} as never);
    expect(JSON.stringify(r)).not.toContain(KEY);
    const ok = fake([[200, { rateLimit: { limit: 10000 }, echo: KEY }]]);
    const r2 = await createHomedirectAdapter(ok.deps).testConnection({} as never);
    expect(r2.ok).toBe(true);
    expect(JSON.stringify(r2)).not.toContain(KEY);
  });
  it("test conexiune la 401 → mesajul despre cheie", async () => {
    const f = fake([[401, {}]]);
    const r = await createHomedirectAdapter(f.deps).testConnection({} as never);
    expect(!r.ok && r.message).toBe("Cheia CRM HomeDirect este invalidă sau lipsește.");
  });
});
