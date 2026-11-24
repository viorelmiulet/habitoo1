import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearVrexaTokenCache, vrexaRequest, VREXA_AGENCY_INACTIVE, type VrexaCredentials } from "./client";
import { vrexaBaseUrl, vrexaConnectionEnv } from "./config";
import { createVrexaAdapter } from "../adapters/vrexa.server";
import type { PortalContext } from "../adapter";

const SECRET = "super-secret-value-123";
const TOKEN = "tok-abcdef-999";
const creds: VrexaCredentials = { organizationId: "org1", env: "test", baseUrl: "https://test.vrexa.ro", clientId: "cid", clientSecret: SECRET };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function mockTransport(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const t = vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); const r = responses.shift(); if (!r) throw new Error("no response"); return r; });
  return { t, calls };
}
const tokenRes = (tok = TOKEN) => json(200, { access_token: tok, expires_in: 1800 });

beforeEach(() => clearVrexaTokenCache());

describe("vrexa client", () => {
  it("obține token-ul și îl memorează", async () => {
    const { t, calls } = mockTransport([tokenRes(), json(200, { totalCount: 3 }), json(200, { totalCount: 3 })]);
    await vrexaRequest(creds, "GET", "/partner/v1/listings?pageSize=1", undefined, { transport: t });
    await vrexaRequest(creds, "GET", "/partner/v1/listings?pageSize=1", undefined, { transport: t });
    expect(calls.filter((c) => c.url.endsWith("/oauth/token"))).toHaveLength(1);
    const body = String(calls[0]!.init.body);
    expect(body).toContain("grant_type=client_credentials");
    expect(calls[0]!.init.redirect).toBe("manual");
    expect((calls[1]!.init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  it("la 401 cere un token nou o singură dată", async () => {
    const { t, calls } = mockTransport([tokenRes("a1111"), json(401, {}), tokenRes("b2222"), json(401, { code: "unauthorized" })]);
    const r = await vrexaRequest(creds, "GET", "/x", undefined, { transport: t });
    expect(r.ok).toBe(false);
    expect(calls.filter((c) => c.url.endsWith("/oauth/token"))).toHaveLength(2);
    expect(calls).toHaveLength(4);
  });

  it("429 respectă Retry-After o singură dată, iar peste 10 s nu așteaptă", async () => {
    const sleep = vi.fn(async () => undefined);
    const a = mockTransport([tokenRes(), json(429, { code: "rate_limited" }, { "Retry-After": "3" }), json(200, { ok: 1 })]);
    const r1 = await vrexaRequest(creds, "GET", "/x", undefined, { transport: a.t, sleep });
    expect(r1.ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(3000);
    clearVrexaTokenCache();
    sleep.mockClear();
    const b = mockTransport([tokenRes(), json(429, { code: "rate_limited" }, { "Retry-After": "60" })]);
    const r2 = await vrexaRequest(creds, "GET", "/x", undefined, { transport: b.t, sleep });
    expect(sleep).not.toHaveBeenCalled();
    expect(r2.ok).toBe(false);
    if (!r2.ok) { expect(r2.kind).toBe("rate_limited"); expect(r2.retryAt).toMatch(/\d{2}:\d{2}/); }
  });

  it("agency_inactive și validation_failed păstrează code/detail/errors", async () => {
    const { t } = mockTransport([tokenRes(), json(403, { code: "agency_inactive", detail: "inactive" })]);
    const r = await vrexaRequest(creds, "GET", "/x", undefined, { transport: t });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.message).toBe(VREXA_AGENCY_INACTIVE); expect(r.problem.code).toBe("agency_inactive"); }
    const v = mockTransport([json(422, { code: "validation_failed", errors: { price: ["obligatoriu"] } })]);
    const r2 = await vrexaRequest(creds, "POST", "/x", {}, { transport: v.t });
    if (!r2.ok) { expect(r2.problem.errors).toEqual({ price: ["obligatoriu"] }); expect(r2.message).toContain("price: obligatoriu"); }
  });
});

const ctx = (settings: Record<string, unknown> = {}): PortalContext => ({
  organizationId: "org1", definition: {} as PortalContext["definition"], direction: "habitoo_to_portal" as PortalContext["direction"],
  authenticationMode: "portal_api_key" as PortalContext["authenticationMode"], externalAccountId: "cid", portalCredential: SECRET, settings, allowLiveRequests: true,
});

describe("vrexa adapter", () => {
  it("testul de conexiune afișează mediul și totalCount", async () => {
    const { t } = mockTransport([tokenRes(), json(200, { totalCount: 7, items: [] })]);
    const a = createVrexaAdapter({ transport: t, env: () => ({}) });
    const r = await a.testConnection(ctx());
    expect(r.ok && r.data.detail).toBe("Conectat la Vrexa (test). Anunțuri prin API: 7.");
  });

  it("producție fără adresă → eroare clară, niciun apel", async () => {
    const { t } = mockTransport([]);
    const a = createVrexaAdapter({ transport: t, env: () => ({ VREXA_ENV: "production" }) });
    const r = await a.testConnection(ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("VREXA_PRODUCTION_URL");
    expect(t).not.toHaveBeenCalled();
    expect(vrexaBaseUrl("production", { VREXA_PRODUCTION_URL: "http://x.ro" })).toBeNull();
    expect(vrexaConnectionEnv({ vrexa_env: "production" }, {})).toBe("production");
  });

  it("secretul și token-ul nu apar în rezultate sau loguri", async () => {
    const logs: string[] = [];
    const spies = (["log", "warn", "error", "info"] as const).map((k) => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); }));
    const { t } = mockTransport([tokenRes(), json(500, { code: "server_error", detail: `boom ${TOKEN} ${SECRET}` })]);
    const r = await createVrexaAdapter({ transport: t, env: () => ({}) }).testConnection(ctx());
    const out = JSON.stringify(r) + logs.join("\n");
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(TOKEN);
    spies.forEach((s) => s.mockRestore());
  });
});
