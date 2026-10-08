import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  consumeOlxOAuthState,
  createOlxOAuthState,
  exchangeOlxAuthorizationCode,
  loadOlxTokens,
  olxAuthorizationUrl,
  olxPartnerRequest,
  refreshAllOlxConnections,
  saveOlxTokens,
  type OlxDeps,
  type OlxStore,
} from "./oauth.server";
import { isForbiddenOlxPurchase, OLXRO_REDIRECT_URI } from "./config";
import { portalExclusivityConflict, STORIA_BLOCKS_OLX, OLX_BLOCKS_STORIA } from "./exclusivity";

const ORG = "org-1";
type State = { id: string; organizationId: string; hash: string; expiresAt: string; consumedAt: string | null; createdBy: string | null };

function setup(responses: ((url: string, init: RequestInit) => Response)[]) {
  let now = Date.parse("2026-10-08T10:00:00Z");
  const states: State[] = [];
  const conns = new Map<string, { id: string; settings: Record<string, unknown>; credentials: string | null }>();
  const notifications: unknown[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  const store: OlxStore = {
    insertState: async (r) => void states.push({ id: `s${states.length}`, organizationId: r.organizationId, hash: r.hash, expiresAt: r.expiresAt, consumedAt: null, createdBy: r.createdBy }),
    findState: async (h) => states.find((s) => s.hash === h) ?? null,
    consumeState: async (id) => {
      const s = states.find((x) => x.id === id)!;
      if (s.consumedAt) return false;
      s.consumedAt = "now";
      return true;
    },
    loadConnection: async (o) => conns.get(o) ?? null,
    upsertConnection: async (o, id, patch) => {
      const cur = conns.get(o) ?? { id: id ?? "c1", settings: {}, credentials: null };
      if ("settings" in patch) cur.settings = patch["settings"] as Record<string, unknown>;
      if ("portal_credentials_encrypted" in patch) cur.credentials = patch["portal_credentials_encrypted"] as string | null;
      conns.set(o, cur);
    },
    listConnectedOrganizations: async () => [...conns.entries()].filter(([, c]) => c.credentials).map(([o]) => o),
    listAgencyAdmins: async () => ["admin-1", "admin-2"],
    insertNotification: async (n) => void notifications.push(n),
  };
  const deps: OlxDeps = {
    store,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("unexpected fetch");
      return next(url, init);
    }) as unknown as typeof fetch,
    encrypt: (p) => `enc:${p}`,
    decrypt: (p) => (p ? p.slice(4) : null),
    now: () => now,
  };
  return { deps, states, conns, notifications, calls, advance: (ms: number) => (now += ms) };
}

const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  process.env["OLXRO_CLIENT_ID"] = "cid";
  process.env["OLXRO_CLIENT_SECRET"] = "csecret";
});
afterEach(() => {
  delete process.env["OLXRO_CLIENT_ID"];
  delete process.env["OLXRO_CLIENT_SECRET"];
});

describe("OLX.ro OAuth", () => {
  it("full flow: authorize URL, state, code exchange with same redirect_uri, encrypted save", async () => {
    const t = setup([json(200, { access_token: "A1", refresh_token: "R1", expires_in: 86400, token_type: "bearer", scope: "v2 read write" })]);
    const state = await createOlxOAuthState({ organizationId: ORG, createdBy: "u1" }, t.deps);
    const url = new URL(olxAuthorizationUrl(state));
    expect(url.origin + url.pathname).toBe("https://www.olx.ro/oauth/authorize/");
    expect(url.search).toContain("scope=read+write+v2");
    expect(url.searchParams.get("redirect_uri")).toBe(OLXRO_REDIRECT_URI);
    expect(t.states[0]!.hash).not.toBe(state);
    expect(await consumeOlxOAuthState(state, t.deps)).toEqual({ organizationId: ORG, createdBy: "u1" });
    const tokens = await exchangeOlxAuthorizationCode("CODE", t.deps);
    const body = JSON.parse(String(t.calls[0]!.init.body));
    expect(t.calls[0]!.url).toBe("https://www.olx.ro/api/open/oauth/token");
    expect(body).toMatchObject({ grant_type: "authorization_code", code: "CODE", redirect_uri: OLXRO_REDIRECT_URI, client_id: "cid", client_secret: "csecret", scope: "v2 read write" });
    await saveOlxTokens({ organizationId: ORG, tokens, actorId: "u1", initial: true }, t.deps);
    expect(t.conns.get(ORG)!.credentials).toMatch(/^enc:/);
    expect((await loadOlxTokens(ORG, t.deps))!.refresh_token).toBe("R1");
  });

  it("rejects reused and expired state", async () => {
    const t = setup([]);
    const s1 = await createOlxOAuthState({ organizationId: ORG, createdBy: null }, t.deps);
    expect(await consumeOlxOAuthState(s1, t.deps)).not.toBeNull();
    expect(await consumeOlxOAuthState(s1, t.deps)).toBeNull();
    const s2 = await createOlxOAuthState({ organizationId: ORG, createdBy: null }, t.deps);
    t.advance(10 * 60 * 1000 + 1);
    expect(await consumeOlxOAuthState(s2, t.deps)).toBeNull();
  });

  it("always saves the rotated refresh token", async () => {
    const t = setup([json(200, { access_token: "A2", refresh_token: "R2", expires_in: 86400 })]);
    await saveOlxTokens({ organizationId: ORG, tokens: { access_token: "A1", refresh_token: "R1", token_type: "bearer", scope: null, expires_at: "2026-10-09T10:00:00Z" }, actorId: null, initial: true }, t.deps);
    expect(await refreshAllOlxConnections(t.deps)).toEqual({ refreshed: 1, reconnect: 0, failed: 0 });
    expect(JSON.parse(String(t.calls[0]!.init.body))).toMatchObject({ grant_type: "refresh_token", refresh_token: "R1" });
    expect((await loadOlxTokens(ORG, t.deps))!.refresh_token).toBe("R2");
  });

  it("invalid_grant marks reconnect and notifies admins once", async () => {
    const t = setup([json(400, { error: "invalid_grant" })]);
    await saveOlxTokens({ organizationId: ORG, tokens: { access_token: "A1", refresh_token: "R1", token_type: "bearer", scope: null, expires_at: "2026-10-09T10:00:00Z" }, actorId: null, initial: true }, t.deps);
    expect(await refreshAllOlxConnections(t.deps)).toEqual({ refreshed: 0, reconnect: 1, failed: 0 });
    expect(t.conns.get(ORG)!.settings["reconnect_required"]).toBe(true);
    expect(t.notifications).toHaveLength(2);
    expect(await refreshAllOlxConnections(t.deps)).toEqual({ refreshed: 0, reconnect: 0, failed: 0 });
    expect(t.notifications).toHaveLength(2);
  });

  it("partner requests send required headers; purchases are blocked", async () => {
    const t = setup([json(200, { data: { id: 1 } })]);
    await saveOlxTokens({ organizationId: ORG, tokens: { access_token: "A1", refresh_token: "R1", token_type: "bearer", scope: null, expires_at: "2026-10-09T10:00:00Z" }, actorId: null, initial: true }, t.deps);
    await olxPartnerRequest(ORG, "GET", "/users/me", undefined, t.deps);
    const h = t.calls[0]!.init.headers as Record<string, string>;
    expect(t.calls[0]!.url).toBe("https://www.olx.ro/api/partner/users/me");
    expect(h["authorization"]).toBe("Bearer A1");
    expect(h["version"]).toBe("2.0");
    await expect(olxPartnerRequest(ORG, "POST", "/users/me/packets", {}, t.deps)).rejects.toThrow();
    expect(isForbiddenOlxPurchase("POST", "/adverts/123/packets")).toBe(true);
    expect(isForbiddenOlxPurchase("POST", "/paid-features")).toBe(true);
    expect(isForbiddenOlxPurchase("GET", "/users/me/packets")).toBe(false);
    expect(t.calls).toHaveLength(1);
  });
});

describe("Storia / OLX exclusivity", () => {
  it("blocks both directions", () => {
    expect(portalExclusivityConflict("olx_direct", ["storia"])).toBe(STORIA_BLOCKS_OLX);
    expect(portalExclusivityConflict("storia", ["olx_direct"])).toBe(OLX_BLOCKS_STORIA);
    expect(portalExclusivityConflict("olx_direct", ["imospot"])).toBeNull();
  });
});
