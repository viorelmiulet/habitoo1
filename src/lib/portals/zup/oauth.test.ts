import { describe, expect, it, vi } from "vitest";
import { zupCall, createZupState, consumeZupState, exchangeZupCode, refreshZupTokens, saveZupTokens, clearZupTokens, getZupAccessToken, testZupConnection, zupAuthorizationUrl, zupHttpError, type ZupDeps, type ZupStore, type ZupConnection, type ZupTokens } from "./oauth.server";
import { ZUP_CALLBACK, ZUP_TIMEOUT_MS, ZUP_MISSING_MESSAGE, zupConfigured } from "./config";
import { getPortalDefinition } from "../registry";
import { integrationSlugFor, homepagePortals } from "../integration-pages";
import { zupAdapter } from "../adapters/zup.server";
import { portalRequirementSpec } from "../requirements";
const ENV = { ZUP_CLIENT_ID: "test-client", ZUP_CLIENT_SECRET: "test-secret" };
const tokenBody = (access = "A", refresh: string | null = "R", seconds = 120) => ({ access_token: access, refresh_token: refresh, token_type: "bearer", expires_in: seconds });
function setup(responses: { status: number; body: unknown }[] = []) {
  let time = Date.parse("2026-10-29T13:00:00Z");
  let connection: ZupConnection | null = null;
  let locked = false;
  const states = new Map<string, { expiresAt: string; org: string; actor: string; consumed: boolean }>();
  const calls: { url: string; init: RequestInit }[] = [];
  const store: ZupStore = {
    async insertState(s) { states.set(s.hash, { expiresAt: s.expiresAt, org: s.organizationId, actor: s.createdBy, consumed: false }); },
    async consumeState(hash, date) { const s = states.get(hash); if (!s || s.consumed || s.expiresAt <= date) return null; s.consumed = true; return { id: hash, organizationId: s.org, createdBy: s.actor, expiresAt: s.expiresAt }; },
    async load() { return connection; },
    async save(_org, credentials, settings, _actor, expected) {
      if (expected !== undefined && connection?.credentials !== expected) return false;
      connection = { id: "connection", credentials, settings }; return true;
    },
    async acquire() { if (locked) return false; locked = true; return true; },
    async release() { locked = false; },
  };
  const d: ZupDeps = {
    store, env: ENV, now: () => time,
    encrypt: p => `encrypted:${p}`, decrypt: c => c.slice(10),
    fetch: (async (url: unknown, init: RequestInit) => {
      calls.push({ url: String(url), init }); const r = responses.shift();
      if (!r) throw new Error("Unexpected network request");
      return new Response(JSON.stringify(r.body), { status: r.status });
    }) as typeof fetch,
    pause: async () => { await new Promise(resolve => setTimeout(resolve, 0)); },
  };
  const seed = async (access = "A", refresh: string | null = "R", expiring = false) => {
    const tokens: ZupTokens = { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_at: new Date(time + 120000).toISOString(), refresh_after: new Date(time + (expiring ? -1 : 96000)).toISOString() };
    await saveZupTokens("org", tokens, "actor", d);
  };
  return { d, calls, states, seed, connection: () => connection, advance: (ms: number) => { time += ms; } };
}
describe("ZUP OAuth stage 1", () => {
  it("422 type required blocks without choosing paid",async()=>{const t=setup([{status:422,body:{errors:{type:["required"],phone:["invalid"]}}}]);await t.seed();await expect(zupCall("org","anunturi","POST",{name:"test"},t.d)).rejects.toThrow("al cărui sens nu este documentat");expect(JSON.parse(String(t.calls[0]?.init.body))).not.toHaveProperty("type");});
  it("429 waits and retries once with a per-account rate reservation on each call",async()=>{const t=setup([{status:429,body:{}},{status:200,body:{data:{id:1}}}]);await t.seed();let reservations=0;const pauses:number[]=[];t.d.reserve=async org=>{expect(org).toBe("org");reservations++;return 510;};t.d.pause=async ms=>{pauses.push(ms);};await zupCall("org","anunturi","POST",{name:"test"},t.d);expect(reservations).toBe(2);expect(pauses).toEqual([510,1000,510]);expect(t.calls).toHaveLength(2);});
  it("second 429 stops after one retry",async()=>{const t=setup([{status:429,body:{}},{status:429,body:{}}]);await t.seed();t.d.pause=async()=>{};await expect(zupCall("org","anunturi","POST",{},t.d)).rejects.toMatchObject({code:"RATE_LIMIT"});expect(t.calls).toHaveLength(2);});
  it("refreshes once on 302 /login without following the redirect", async () => {
    const t = setup(); await t.seed(); let reads = 0;
    t.d.fetch = (async (_url: unknown, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      if (init?.method === "POST") return new Response(JSON.stringify(tokenBody("NEW")));
      reads++;
      return reads === 1 ? new Response("<html>login</html>",{status:302,headers:{location:"/login"}}) : new Response("[]");
    }) as typeof fetch;
    expect((await testZupConnection("org",t.d)).count).toBe(0); expect(reads).toBe(2);
  });
  it("second login redirect requires reconnection and does not loop", async () => {
    const t=setup(); await t.seed();let calls=0;
    t.d.fetch=(async (_url:unknown,init?:RequestInit)=>{calls++;return init?.method==="POST"?new Response(JSON.stringify(tokenBody("NEW"))):new Response("login",{status:302,headers:{location:"https://zup.ro/login"}});}) as typeof fetch;
    await expect(testZupConnection("org",t.d)).rejects.toThrow("Reconectează contul ZUP");expect(calls).toBe(3);
  });
  it("uses documented authorization endpoint and exact callback", () => {
    const url = new URL(zupAuthorizationUrl("test-state", ENV));
    expect(url.origin + url.pathname).toBe("https://zup.ro/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: "test-client", redirect_uri: ZUP_CALLBACK, response_type: "code", state: "test-state" });
  });
  it("hashes state, binds agency, consumes once", async () => {
    const t = setup(); const state = await createZupState("org", "actor", t.d);
    expect(t.states.has(state)).toBe(false);
    expect(await consumeZupState(state, t.d)).toMatchObject({ organizationId: "org", createdBy: "actor" });
    expect(await consumeZupState(state, t.d)).toBeNull();
  });
  it("rejects expired, missing and forged state", async () => {
    const t = setup(); const state = await createZupState("org", "actor", t.d); t.advance(600000);
    expect(await consumeZupState(state, t.d)).toBeNull();
    expect(await consumeZupState(null, t.d)).toBeNull();
    expect(await consumeZupState("x".repeat(43), t.d)).toBeNull();
  });
  it("exchanges code using form body and persists encrypted tokens", async () => {
    const t = setup([{ status: 200, body: tokenBody() }]);
    const tokens = await exchangeZupCode("CODE", t.d);
    expect(t.calls[0]?.url).toBe("https://zup.ro/zapi/v1/oauth/token");
    expect(t.calls[0]?.init.redirect).toBe("manual");
    expect(Object.fromEntries(new URLSearchParams(String(t.calls[0]?.init.body)))).toEqual({ grant_type: "authorization_code", code: "CODE", redirect_uri: ZUP_CALLBACK, client_id: "test-client", client_secret: "test-secret" });
    expect(t.calls[0]?.init.headers).toMatchObject({ "content-type": "application/x-www-form-urlencoded" });
    await saveZupTokens("org", tokens, "actor", t.d);
    expect(t.connection()?.credentials?.startsWith("encrypted:")).toBe(true);
    expect(JSON.stringify(t.connection()?.settings)).not.toContain('"access_token"');
  });
  it("uses separate refresh endpoint and respects short expiry", async () => {
    const t = setup([{ status: 200, body: tokenBody("B", "R2", 10) }]);
    const tokens = await refreshZupTokens("R", t.d);
    expect(t.calls[0]?.url).toBe("https://zup.ro/zapi/v1/oauth/token/refresh");
    expect(new URLSearchParams(String(t.calls[0]?.init.body)).get("grant_type")).toBe("refresh_token");
    expect(Date.parse(tokens.expires_at) - Date.parse(tokens.refresh_after)).toBe(2000);
  });
  it.each(["R2", null])("keeps rotated or existing refresh token (%s)", async next => {
    const t = setup([{ status: 200, body: tokenBody("B", next) }]); await t.seed("A", "R", true);
    expect(await getZupAccessToken("org", t.d)).toBe("B");
    const stored = t.connection()?.credentials;
    expect(stored ? JSON.parse(t.d.decrypt(stored) ?? "{}").refresh_token : null).toBe(next ?? "R");
  });
  it("valid token does not refresh and returns only count", async () => {
    const t = setup([{ status: 200, body: [{ id: 1, email: "private@example.test" }, { id: 2 }] }]); await t.seed();
    expect(await testZupConnection("org", t.d)).toEqual({ count: 2, message: "Token valid · Contul ZUP are 2 anunțuri." });
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]?.url).toBe("https://zup.ro/zapi/v1/anunturi");
  });
  it("refreshes once at 401 and retries GET exactly once", async () => {
    const t = setup([{ status: 401, body: {} }, { status: 200, body: tokenBody("B", "R2") }, { status: 200, body: [] }]); await t.seed();
    expect((await testZupConnection("org", t.d)).count).toBe(0);
    expect(t.calls.map(c => c.url)).toEqual(["https://zup.ro/zapi/v1/anunturi", "https://zup.ro/zapi/v1/oauth/token/refresh", "https://zup.ro/zapi/v1/anunturi"]);
  });
  it("does not loop after a second 401", async () => {
    const t = setup([{ status: 401, body: {} }, { status: 200, body: tokenBody("B") }, { status: 401, body: {} }]); await t.seed();
    await expect(testZupConnection("org", t.d)).rejects.toMatchObject({ code: "AUTH_ERROR" }); expect(t.calls).toHaveLength(3);
  });
  it("concurrent expiry shares one rotating refresh", async () => {
    const t = setup([{ status: 200, body: tokenBody("B", "R2") }]); await t.seed("A", "R", true);
    expect(await Promise.all([getZupAccessToken("org", t.d), getZupAccessToken("org", t.d)])).toEqual(["B", "B"]);
    expect(t.calls).toHaveLength(1);
  });
  it("disconnect clears tokens and cannot be overwritten by stale refresh", async () => {
    const t = setup(); await t.seed(); const previous = t.connection()?.credentials;
    await clearZupTokens("org", "actor", t.d);
    expect(t.connection()?.credentials).toBeNull(); expect(t.connection()?.settings["oauth"]).toBeUndefined();
    if (!previous) throw new Error("Missing test connection");
    await expect(saveZupTokens("org", { access_token: "B", refresh_token: "R2", token_type: "Bearer", expires_at: "2027-01-01", refresh_after: "2026-12-31" }, null, t.d, previous)).rejects.toMatchObject({ detail: "zup_connection_changed" });
    expect(t.connection()?.credentials).toBeNull();
  });
  it.each([[401, "Reconectează"], [403, "nu permite accesul"], [404, "nu a găsit"], [422, "respins datele"], [429, "Prea multe"], [503, "temporar indisponibil"]])("Romanian HTTP %s message", (status, text) => {
    expect(zupHttpError(Number(status), {}).message).toContain(text);
  });
  it("422 names only errors fields and does not echo sensitive messages", () => {
    const message = zupHttpError(422, { errors: { price: ["private input"], locality: ["invalid"], access_token: ["private"] } }).message;
    expect(message).toContain("price, locality"); expect(message).not.toContain("private"); expect(message).not.toContain("access_token");
  });
  it("missing platform secrets are unconfigured without requests", async () => {
    expect(zupConfigured({})).toBe(false); expect(zupConfigured({ ZUP_CLIENT_ID: "test" })).toBe(false);
    const t = setup(); t.d.env = {};
    await expect(createZupState("org", "actor", t.d)).rejects.toThrow(ZUP_MISSING_MESSAGE);
    await expect(testZupConnection("org", t.d)).rejects.toThrow(ZUP_MISSING_MESSAGE); expect(t.calls).toHaveLength(0);
  });
  it("30 second deadline includes reading the response", async () => {
    vi.useFakeTimers();
    try {
      const t = setup(); await t.seed();
      t.d.fetch = ((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
      const outcome = testZupConnection("org", t.d).catch(e => e);
      await vi.advanceTimersByTimeAsync(ZUP_TIMEOUT_MS);
      expect(await outcome).toMatchObject({ code: "TIMEOUT", message: "ZUP nu a răspuns în 30 de secunde." });
    } finally { vi.useRealTimers(); }
  });
  it("rejects unexpected list envelopes", async () => {
    const t = setup([{ status: 200, body: { data: [] } }]); await t.seed(); await expect(testZupConnection("org", t.d)).rejects.toMatchObject({ detail: "zup_invalid_list" });
  });
  it("registry permits stage-three publishing while public pages remain absent", async () => {
    const portal = getPortalDefinition("zup"); expect(portal?.activation).toBe("oauth"); expect(portal?.publish_coming_soon).not.toBe(true); expect(portal?.capabilities).toEqual(["test_connection","publish_listing","update_listing","withdraw_listing","sync"]);
    expect(portalRequirementSpec("zup")?.required.map(r => r.key)).not.toContain("stage");
    expect(integrationSlugFor("zup")).toBeNull(); expect(homepagePortals().some(p => p.portal.id === "zup")).toBe(false);
    if (!portal) throw new Error("ZUP missing");
    expect(typeof zupAdapter.publishListing).toBe("function");expect(typeof zupAdapter.updateListing).toBe("function");
  });
  it("rejects malformed token responses instead of inventing expiry", async () => {
    const t = setup([{ status: 200, body: { access_token: "A", token_type: "bearer" } }]);
    await expect(exchangeZupCode("CODE", t.d)).rejects.toMatchObject({ detail: "zup_invalid_token" });
  });
  it("disconnect and absent refresh require reconnection without network writes", async () => {
    const t = setup(); await t.seed("A", null, true);
    await expect(getZupAccessToken("org", t.d)).rejects.toMatchObject({ detail: "zup_no_refresh" });
    await clearZupTokens("org", "actor", t.d);
    await expect(getZupAccessToken("org", t.d)).rejects.toMatchObject({ detail: "zup_disconnected" });
    expect(t.calls).toHaveLength(0);
  });
});