import { describe, expect, it, vi } from "vitest";
import { consumeHouseraState, exchangeHouseraCode, houseraAuthorizationUrl, houseraConnectionPatch, parseHouseraToken, pkceChallenge, startHouseraAuthorization, type HouseraOAuthDeps, type HouseraState } from "./oauth.server";
import { HOUSERA_CALLBACK } from "./config";

const env = { HOUSERA_CLIENT_ID: "cid", HOUSERA_CLIENT_SECRET: "csecret", HOUSERA_ENV: "staging" };
const KEY = "1234|hsr_test_abcdefghijkl9876";
const goodBody = { access_token: KEY, token_type: "Bearer", expires_in: 31536000, scope: "listings:read listings:write", connection_id: 1234 };

function memoryDeps(now = () => 1_000_000, fetchImpl?: typeof fetch): HouseraOAuthDeps & { rows: Map<string, { s: HouseraState; exp: string; used: boolean }> } {
  const rows = new Map<string, { s: HouseraState; exp: string; used: boolean }>();
  return {
    rows, env, now, fetch: fetchImpl,
    encrypt: (v) => `enc:${v}`, decrypt: (v) => v.replace(/^enc:/, ""),
    store: {
      async insertState(r) { rows.set(r.hash, { s: { organizationId: r.organizationId, createdBy: r.createdBy, verifierEncrypted: r.verifierEncrypted }, exp: r.expiresAt, used: false }); },
      async consumeState(hash, at) {
        const r = rows.get(hash);
        if (!r || r.used || r.exp <= at) return null;
        r.used = true;
        const s = { ...r.s }; r.s.verifierEncrypted = null; return s;
      },
    },
  };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("PKCE", () => {
  it("matches the reference challenge", () => {
    expect(pkceChallenge("habitoo-pkce-test-verifier-0123456789-abcdefgh")).toBe("f2BDX9UzmJiVd6BpEoJRaOrLPgEAt0NZriskctb2Urw");
  });
});

describe("consent URL", () => {
  it("has exactly the required parameters and no scope", () => {
    const u = new URL(houseraAuthorizationUrl("STATE", "habitoo-pkce-test-verifier-0123456789-abcdefgh", env));
    expect(u.origin + u.pathname).toBe("https://staging.housera.ro/setari/api/conectare");
    expect([...u.searchParams.keys()].sort()).toEqual(["client_id", "code_challenge", "code_challenge_method", "redirect_uri", "response_type", "state"]);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe(HOUSERA_CALLBACK);
    expect(u.searchParams.get("code_challenge")).toBe("f2BDX9UzmJiVd6BpEoJRaOrLPgEAt0NZriskctb2Urw");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.has("scope")).toBe(false);
  });
});

describe("state", () => {
  async function started(d: ReturnType<typeof memoryDeps>) {
    const u = new URL(await startHouseraAuthorization("org1", "user1", d));
    return u.searchParams.get("state")!;
  }
  it("stores only a hash and an encrypted verifier", async () => {
    const d = memoryDeps();
    const state = await started(d);
    const [hash, row] = [...d.rows.entries()][0]!;
    expect(hash).not.toBe(state);
    expect(row.s.verifierEncrypted).toMatch(/^enc:/);
  });
  it("is accepted once, then rejected as reused", async () => {
    const d = memoryDeps();
    const state = await started(d);
    const first = await consumeHouseraState(state, d);
    expect(first?.organizationId).toBe("org1");
    expect(first?.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await consumeHouseraState(state, d)).toBeNull();
  });
  it("is rejected after 10 minutes", async () => {
    let t = 1_000_000;
    const d = memoryDeps(() => t);
    const state = await started(d);
    t += 600_001;
    expect(await consumeHouseraState(state, d)).toBeNull();
  });
});

describe("code exchange", () => {
  it("posts form-encoded data once", async () => {
    const f = vi.fn(async () => json(200, goodBody));
    const t = await exchangeHouseraCode("CODE", "VERIFIER", memoryDeps(undefined, f as never));
    expect(f).toHaveBeenCalledOnce();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://staging.housera.ro/api/v1/oauth/token");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({ grant_type: "authorization_code", code: "CODE", redirect_uri: HOUSERA_CALLBACK, code_verifier: "VERIFIER", client_id: "cid", client_secret: "csecret" });
    expect(t.connection_id).toBe("1234");
    expect(t.scopes).toEqual(["listings:read", "listings:write"]);
  });
  it("never retries on errors; invalid_grant has its own message", async () => {
    const f = vi.fn(async () => json(400, { error: "invalid_grant" }));
    await expect(exchangeHouseraCode("C", "V", memoryDeps(undefined, f as never))).rejects.toThrow("Codul a expirat, reia conectarea.");
    expect(f).toHaveBeenCalledOnce();
    const g = vi.fn(async () => json(503, {}));
    await expect(exchangeHouseraCode("C", "V", memoryDeps(undefined, g as never))).rejects.toThrow();
    expect(g).toHaveBeenCalledOnce();
    const h = vi.fn(async () => { throw new Error("network"); });
    await expect(exchangeHouseraCode("C", "V", memoryDeps(undefined, h as never))).rejects.toThrow();
    expect(h).toHaveBeenCalledOnce();
  });
});

describe("token response", () => {
  it("rejects invalid responses", () => {
    for (const bad of [
      { ...goodBody, access_token: "1234|hsr_live_abcdefghijkl" },
      { ...goodBody, access_token: "hsr_test_abcdefghijkl" },
      { ...goodBody, token_type: "mac" },
      { ...goodBody, expires_in: undefined },
      { ...goodBody, scope: undefined },
      { ...goodBody, connection_id: undefined },
      null,
    ]) expect(() => parseHouseraToken(bad, env, 0)).toThrow();
  });
  it("production requires a live key", () => {
    expect(() => parseHouseraToken(goodBody, { ...env, HOUSERA_ENV: "production" }, 0)).toThrow();
  });
});

describe("saving", () => {
  it("stores the key encrypted, connection id and oauth metadata, never the raw key", () => {
    const t = parseHouseraToken(goodBody, env, 0);
    const p = houseraConnectionPatch(t, { reconnect_required: true, other: 1 }, (v) => `enc:${Buffer.from(v).toString("base64")}`, "2026-11-05T00:00:00.000Z");
    expect(p.external_account_id).toBe("1234");
    expect(p.settings).toEqual({ other: 1, oauth: { connected_at: "2026-11-05T00:00:00.000Z", expires_at: t.expires_at, scopes: ["listings:read", "listings:write"], connection_id: "1234" } });
    expect(JSON.stringify(p)).not.toContain("hsr_test_");
  });
});
