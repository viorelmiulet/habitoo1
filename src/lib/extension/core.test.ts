import { describe, expect, it, vi } from "vitest";
import { generateExtensionToken, isValidNonce, meHandler, revokeHandler, serveExtension, sha256Hex, type ExtAccount, type ExtensionStore, type ExtTokenRow } from "./core";

async function setup(over: { token?: Partial<ExtTokenRow>; account?: Partial<ExtAccount>; org?: Partial<NonNullable<ExtAccount["org"]>>; allowed?: boolean } = {}) {
  const token = generateExtensionToken();
  const row: ExtTokenRow = { id: "t1", user_id: "u1", organization_id: "o1", token_hash: await sha256Hex(token), revoked_at: null, ...over.token };
  const account: ExtAccount = { is_active: true, full_name: "Ana Pop", role: "agent", profile_org_id: "o1",
    org: { id: "o1", name: "Agenția X", logo_url: "https://x/logo.png", status: "active", archived_at: null, suspended_reason: null, ...over.org }, ...over.account };
  const revoke = vi.fn(async () => { row.revoked_at = new Date().toISOString(); });
  const store: ExtensionStore = {
    token: async (h) => (h === row.token_hash ? row : null), account: async () => account,
    rate: async () => ({ limit: 60, remaining: 59, reset: 9e9, allowed: over.allowed ?? true }), touch: async () => {}, revoke,
  };
  const req = (method = "GET", t = token) => new Request("https://x/api/public/extension/v1/me", { method, headers: { authorization: `Bearer ${t}` } });
  return { token, store, req, revoke };
}

describe("extensie Habitoo Captură", () => {
  it("token valid → /me 200 cu utilizator și agenție, fără token în răspuns", async () => {
    const { store, req, token } = await setup();
    const log = vi.spyOn(console, "log"); const warn = vi.spyOn(console, "warn"); const err = vi.spyOn(console, "error");
    const res = await serveExtension(req(), store, meHandler);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ user: { name: "Ana Pop", role: "agent" }, agency: { name: "Agenția X", logo_url: "https://x/logo.png" } });
    expect(text).not.toContain(token);
    for (const s of [log, warn, err]) expect(JSON.stringify(s.mock.calls)).not.toContain(token);
  });
  it("token revocat → 401 cu request_id", async () => {
    const { store, req } = await setup({ token: { revoked_at: "2026-01-01" } });
    const res = await serveExtension(req(), store, meHandler);
    expect(res.status).toBe(401);
    expect((await res.json()).error.request_id).toMatch(/[0-9a-f-]{36}/);
  });
  it("utilizator dezactivat → 401", async () => {
    const { store, req } = await setup({ account: { is_active: false } });
    expect((await serveExtension(req(), store, meHandler)).status).toBe(401);
  });
  it("agenție suspendată sau arhivată → 401", async () => {
    for (const org of [{ status: "suspended" }, { archived_at: "2026-01-01" }]) {
      const { store, req } = await setup({ org });
      expect((await serveExtension(req(), store, meHandler)).status).toBe(401);
    }
  });
  it("DELETE /token deconectează, apoi 401", async () => {
    const { store, req, revoke } = await setup();
    expect((await serveExtension(req("DELETE"), store, revokeHandler)).status).toBe(204);
    expect(revoke).toHaveBeenCalledWith("t1");
    expect((await serveExtension(req(), store, meHandler)).status).toBe(401);
  });
  it("peste 60/minut → 429", async () => {
    const { store, req } = await setup({ allowed: false });
    const res = await serveExtension(req(), store, meHandler);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
  it("nonce lipsă sau invalid nu este acceptat", () => {
    for (const n of [undefined, "", "short", "a".repeat(129), "abc-def-ghi", "<script>xx"]) expect(isValidNonce(n)).toBe(false);
    expect(isValidNonce("Abc12345")).toBe(true);
  });
});
