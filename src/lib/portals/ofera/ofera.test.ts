import { describe, it, expect, vi, afterEach } from "vitest";
import { createOferaAdapter } from "../adapters/ofera.server";
import { getOferaToken, type OferaAuthDeps, type OferaToken, type OferaTokenStore } from "./auth.server";
import { oferaRequest } from "./client.server";
import { oferaTransport, type OferaLog } from "./transport.server";
import { oferaInvalidToken, oferaRedact, readOferaResponse } from "./response";
import { getPortalDefinition, derivePortalConnectionStatus, validatePortalConfigValues, portalCanPublish } from "../registry";
import type { PortalContext } from "../adapter";
const env = { OFERA_CLIENT_ID: "fixture-client-id", OFERA_CLIENT_SECRET: "fixture-secret", OFERA_USERNAME: "fixture@example.invalid", OFERA_PASSWORD: "fixture-password" };
const issuedToken = "fixture-token-".repeat(20);
function fixture(fetcher: typeof fetch) {
  let cached: OferaToken | null = null;
  let owner: string | null = null;
  let time = 1_000_000;
  const logs: OferaLog[] = [];
  const store: OferaTokenStore = {
    read: async () => cached,
    claim: vi.fn(async (id, rejected) => {
      if (owner || (cached && cached.expiresAt > time + 300_000 && cached.revision !== rejected)) return false;
      owner = id; return true;
    }),
    save: async (id, token) => { if (owner !== id) return false; cached = token; return true; },
    release: async (id) => { if (owner === id) owner = null; },
  };
  const deps: OferaAuthDeps = { env, store, fetch: fetcher, now: () => time, sleep: async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }, journal: async (log) => { logs.push(log); } };
  return { deps, logs, setTime: (t: number) => { time = t; } };
}
const tokenReply = () => new Response(JSON.stringify({ access_token: issuedToken, token_type: "bearer", expires_in: 3600, refresh_token: "fixture-refresh", scope: "read write" }));
const success = () => new Response(JSON.stringify({ code: "SUCCESS", status: 200, data: { log_track_id: "track-safe" } }));
const invalid = () => new Response(JSON.stringify({ code: "ERROR", status: 401, message: "Token invalid" }));
function context(provider?: number): PortalContext {
  const definition = getPortalDefinition("ofera");
  if (!definition) throw new Error("missing registry");
  return { organizationId: "fixture-org", definition, direction: "habitoo_to_portal", authenticationMode: "username_password", externalAccountId: null, portalCredential: null, settings: provider ? { id_furnizor: provider } : {}, allowLiveRequests: false };
}
afterEach(() => vi.useRealTimers());
describe("Ofera registry and connection", () => {
  it("missing secrets are disconnected and never call network", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const { deps } = fixture(fetcher);
    deps.env = {};
    const adapter = createOferaAdapter(deps);
    expect((await adapter.getStatus(context())).ok).toBe(true);
    const status = await adapter.getStatus(context());
    if (!status.ok) throw new Error("status");
    expect(status.data.configured).toBe(false);
    expect(status.data.detail).toBe("Credențialele Ofera nu sunt configurate pe server.");
    expect(await adapter.testConnection(context())).toMatchObject({ ok: false, code: "CONFIG_ERROR" });
    expect(derivePortalConnectionStatus({ definition: context().definition, activated: true, externalAccountId: null, hasPortalCredential: false, lastError: null, serverKeyMissing: true })).toBe("disconnected");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "1.2", "abc", "9007199254740992"])("rejects invalid provider %s", (value) => {
    expect(validatePortalConfigValues("ofera", { endpointUrl: value })).toContain("număr întreg");
  });
  it("supports push publication and a positive agency provider", () => {
    expect(validatePortalConfigValues("ofera", { endpointUrl: "123" })).toBeNull();
    expect(context().definition.capabilities).toEqual(["test_connection", "publish_listing", "update_listing", "withdraw_listing"]);
    expect(portalCanPublish("ofera")).toBe(true);
  });
  it.each([undefined, 123])("tests token and categories with provider %s", async (provider) => {
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).endsWith("/get-token") ? tokenReply() : success());
    const f = fixture(fetcher);
    const result = await createOferaAdapter(f.deps).testConnection(context(provider));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("connection");
    expect(result.data.detail).toContain("read write");
    expect(result.data.detail).toContain(provider ? "completat" : "necompletat");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded" });
    expect(new URLSearchParams(String(init?.body)).get("grant_type")).toBe("password");
    expect(fetcher.mock.calls[1]?.[1]?.redirect).toBe("manual");
  });
});
describe("Ofera body-authoritative responses and secrecy", () => {
  it("retains token rejection despite localized status messages", () => {
    expect(oferaInvalidToken(readOferaResponse({ code: "ERROR", status: 500, message: "Token expired" }))).toBe(true);
    expect(oferaInvalidToken(readOferaResponse({ code: "ERROR", status: 404, message: "Invalid token" }))).toBe(true);
    expect(oferaInvalidToken(readOferaResponse({ code: "ERROR", status: 404, message: "Missing listing" }))).toBe(false);
  });
  it("HTTP 200 ERROR is never success", async () => {
    const logs: OferaLog[] = [];
    const call = await oferaTransport("/categories", { method: "GET" }, { fetch: async () => new Response('{"code":"ERROR","status":404}'), journal: async (log) => { logs.push(log); } });
    expect(call.result.ok).toBe(false);
    expect(call.result.status).toBe(404);
    expect(logs[0]?.httpStatus).toBe(200);
    expect(readOferaResponse({ code: "SUCCESS", status: 500 }).ok).toBe(false);
  });
  it.each([[404, "Anunțul nu există la Ofera."], [409, "Ofera semnalează un posibil duplicat (ID 77). Motiv"], [406, "Nu mai sunt sloturi de promovare la Ofera. Motiv"], [412, "Anunțul nu e activ la Ofera."], [500, "Ofera a refuzat operația: Motiv"]])("status %s has localized message and tracking", (status, message) => {
    const result = readOferaResponse({ code: "ERROR", status, message: "Motiv", data: { id_duplicat: 77, log_track_id: "track-safe" } });
    expect(result.message).toBe(`${message} Referință Ofera: track-safe.`);
  });
  it("sanitizes every call, including credentials echoed under unrelated keys", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).endsWith("/get-token") ? tokenReply() : new Response(JSON.stringify({ code: "ERROR", status: 500, message: `${env.OFERA_PASSWORD} ${issuedToken}`, data: { nested: { note: env.OFERA_CLIENT_SECRET }, log_track_id: "track-safe" } })));
    const f = fixture(fetcher);
    const result = await oferaRequest("GET", "/categories", f.deps);
    const output = JSON.stringify({ result, logs: f.logs });
    for (const secret of [...Object.values(env), issuedToken, "fixture-refresh"]) expect(output.includes(secret)).toBe(false);
    expect(f.logs).toHaveLength(2);
    expect(result.message).toContain("track-safe");
  });
  it("unexpected response logs only redacted first 500 characters", async () => {
    const logs: OferaLog[] = [];
    const result = await oferaTransport("/categories", { method: "GET" }, { fetch: async () => new Response(`password=${env.OFERA_PASSWORD} ${"x".repeat(900)}`), secrets: Object.values(env), journal: async (log) => { logs.push(log); } });
    expect(result.result.message).toBe("Răspuns Ofera neașteptat");
    expect(logs[0]?.raw.length).toBe(500);
    expect(logs[0]?.raw.includes(env.OFERA_PASSWORD)).toBe(false);
    expect(oferaRedact('{"token":"unknown-capability"}')).not.toContain("unknown-capability");
  });
  it("journals at most 20 KB", async () => {
    const logs: OferaLog[] = [];
    await oferaTransport("/categories", { method: "GET" }, { fetch: async () => new Response(JSON.stringify({ code: "SUCCESS", status: 200, data: "x".repeat(25000) })), journal: async (log) => { logs.push(log); } });
    expect(logs[0]?.raw.length).toBe(20000);
  });
  it("30-second timeout covers body reading and is journaled", async () => {
    vi.useFakeTimers();
    const logs: OferaLog[] = [];
    const pending = oferaTransport("/categories", { method: "GET" }, { fetch: async (_url, init) => ({ status: 200, text: async () => new Promise<string>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("abort")))) }) as Response, journal: async (log) => { logs.push(log); } });
    await vi.advanceTimersByTimeAsync(29999);
    expect(logs).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).result.message).toBe("Ofera nu a răspuns în 30 de secunde.");
    expect(logs).toHaveLength(1);
  });
});
describe("Ofera token lifetime and concurrent renewal", () => {
  it("reuses a long token until five minutes before expiry", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => tokenReply());
    const f = fixture(fetcher);
    expect((await getOferaToken(f.deps)).token).toBe(issuedToken);
    f.setTime(4_299_999);
    await getOferaToken(f.deps);
    expect(fetcher).toHaveBeenCalledTimes(1);
    f.setTime(4_300_000);
    await getOferaToken(f.deps);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("parallel jobs issue one token", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => tokenReply());
    const f = fixture(fetcher);
    const tokens = await Promise.all([getOferaToken(f.deps), getOferaToken(f.deps), getOferaToken(f.deps)]);
    expect(new Set(tokens.map((token) => token.revision)).size).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])("invalid token: exactly one renewal and retry (success %s)", async (recovers) => {
    let operations = 0;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith("/get-token")) return tokenReply();
      operations++;
      return operations === 1 || !recovers ? invalid() : success();
    });
    const f = fixture(fetcher);
    const result = await oferaRequest("GET", "/categories", f.deps);
    expect(result.ok).toBe(recovers);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/get-token"))).toHaveLength(2);
    expect(operations).toBe(2);
    expect(f.logs).toHaveLength(4);
    expect(fetcher.mock.calls.every(([, init]) => !String(init?.body).includes("grant_type=refresh_token"))).toBe(true);
  });
  it("parallel rejection of same token renews once", async () => {
    let operations = 0;
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).endsWith("/get-token") ? tokenReply() : ++operations <= 2 ? invalid() : success());
    const f = fixture(fetcher);
    await getOferaToken(f.deps);
    const responses = await Promise.all([oferaRequest("GET", "/categories", f.deps), oferaRequest("GET", "/categories", f.deps)]);
    expect(responses.every((response) => response.ok)).toBe(true);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/get-token"))).toHaveLength(2);
  });
});