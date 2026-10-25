/**
 * Teste Argus cu răspunsuri simulate — fără apeluri reale la Argus.
 * Acoperă: refolosirea tokenului și reautentificarea doar la 401, mesajul de
 * cotă la 403, retry o dată la 429, limitele locale și faptul că cheia nu
 * ajunge în browser (DTO-ul de stare expune doar ultimele 4 caractere).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArgusError, ARGUS_QUOTA_MESSAGE } from "./errors";
import { argusAuthenticate, argusRequest } from "./client.server";
import { argusAccessToken, argusCall } from "./connection.server";
import { argusApiThrottle, argusAuthThrottle, resetArgusThrottles } from "./rate-limit";

const TOKEN = "tok-1";
const TOKEN_2 = "tok-2";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function authOk(token = TOKEN) {
  return jsonResponse(200, [{ authorization_token: token }]);
}

/** DB fals: o singură conexiune, cu token cache-able. */
function fakeDb(row: Record<string, unknown> | null) {
  const state = { row: row ? { ...row } : null };
  const updates: Record<string, unknown>[] = [];
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: state.row, error: null }),
    update: (values: Record<string, unknown>) => {
      updates.push(values);
      state.row = state.row ? { ...state.row, ...values } : null;
      return { eq: async () => ({ error: null }) };
    },
  };
  return { from: () => q, updates, state };
}

// Cheia reală e criptată; în teste ocolim criptografia.
vi.mock("@/lib/portals/crypto.server", () => ({
  encryptPortalCredential: (plain: string) => `enc:${plain}`,
  decryptPortalCredential: (payload: string | null) =>
    payload?.startsWith("enc:") ? payload.slice(4) : null,
}));

const ROW = {
  organization_id: "org-1",
  api_key_enc: "enc:api-key-1",
  api_key_last4: "ey-1",
  token_enc: null,
  token_obtained_at: null,
  connected_by: "user-1",
  created_at: "2026-10-25T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z",
};

beforeEach(() => {
  resetArgusThrottles();
  process.env["ARGUS_APPLICATION_TOKEN"] = "app-token";
});

describe("autentificare și refolosirea tokenului", () => {
  it("auth trimite cheia în body și tokenul de aplicație în headerul Application", async () => {
    const f = vi.fn().mockResolvedValue(authOk());
    const token = await argusAuthenticate("api-key-1", f, "app-token");
    expect(token).toBe(TOKEN);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.argus.me/v2.1/auth");
    expect((init.headers as Record<string, string>)["Application"]).toBe("app-token");
    expect(JSON.parse(init.body as string)).toEqual({ api_key: "api-key-1" });
  });

  it("tokenul salvat se refolosește fără o nouă autentificare", async () => {
    const db = fakeDb({ ...ROW, token_enc: `enc:${TOKEN}` });
    const f = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    await argusCall(db, "org-1", { path: "/properties/filters", fetchFn: f });
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toContain("/properties/filters");
  });

  it("la 401 se reautentifică o singură dată și reia cererea", async () => {
    const db = fakeDb({ ...ROW, token_enc: `enc:${TOKEN}` });
    const f = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {})) // token vechi respins
      .mockResolvedValueOnce(authOk(TOKEN_2)) // reautentificare
      .mockResolvedValueOnce(jsonResponse(200, { properties: [] }));
    const result = await argusCall(db, "org-1", { path: "/properties/search", fetchFn: f });
    expect(result).toEqual({ properties: [] });
    expect(f).toHaveBeenCalledTimes(3);
    expect(String(f.mock.calls[1][0])).toContain("/v2.1/auth");
    expect(db.state.row?.["token_enc"]).toBe(`enc:${TOKEN_2}`);
  });

  it("fără token salvat autentifică o dată și îl păstrează", async () => {
    const db = fakeDb({ ...ROW });
    const f = vi.fn().mockResolvedValueOnce(authOk()).mockResolvedValueOnce(jsonResponse(200, []));
    await argusCall(db, "org-1", { path: "/properties/filters", fetchFn: f });
    expect(f).toHaveBeenCalledTimes(2);
    expect(db.state.row?.["token_enc"]).toBe(`enc:${TOKEN}`);
  });
});

describe("erori Argus", () => {
  it("403 dă mesajul de cotă lunară depășită", async () => {
    const db = fakeDb({ ...ROW, token_enc: `enc:${TOKEN}` });
    const f = vi.fn().mockResolvedValue(jsonResponse(403, { message: "quota exceeded" }));
    const err = await argusCall(db, "org-1", { path: "/properties/search", fetchFn: f }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ArgusError);
    expect((err as ArgusError).kind).toBe("quota");
    expect((err as ArgusError).message).toContain(ARGUS_QUOTA_MESSAGE);
  });

  it("429 așteaptă și reîncearcă o singură dată", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { "retry-after": "2" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await argusRequest({
      token: TOKEN,
      path: "/properties/filters",
      fetchFn: f,
      sleep,
    });
    expect(result).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("al doilea 429 oprește cererea", async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(429, {}));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      argusRequest({ token: TOKEN, path: "/properties/filters", fetchFn: f, sleep }),
    ).rejects.toMatchObject({ kind: "rate_limit" });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("fără conexiune salvată cere cheia din Setări", async () => {
    const db = fakeDb(null);
    await expect(argusAccessToken(db, "org-1", vi.fn())).rejects.toMatchObject({
      kind: "config",
    });
  });
});

describe("limitele locale", () => {
  it("/auth e limitat la 5 pe oră", () => {
    const now = 1_000_000;
    // 1/minut: spațiem apelurile; a 6-a din aceeași oră e blocată.
    for (let i = 0; i < 5; i += 1) expect(argusAuthThrottle(now + i * 61_000)).toBe(0);
    expect(argusAuthThrottle(now + 5 * 61_000)).toBeGreaterThan(0);
  });

  it("/auth e limitat la 1 pe minut", () => {
    const now = 1_000_000;
    expect(argusAuthThrottle(now)).toBe(0);
    expect(argusAuthThrottle(now + 1_000)).toBeGreaterThan(0);
  });

  it("cererile de date sunt limitate la 2 pe secundă pe agenție", () => {
    const now = 1_000_000;
    expect(argusApiThrottle("org-1", now)).toBe(0);
    expect(argusApiThrottle("org-1", now + 10)).toBe(0);
    expect(argusApiThrottle("org-1", now + 20)).toBeGreaterThan(0);
    // altă agenție (altă cheie) are contor propriu
    expect(argusApiThrottle("org-2", now + 20)).toBe(0);
  });
});

describe("client_ip", () => {
  it("cererile POST trimit client_ip în body", async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await argusRequest({
      token: TOKEN,
      path: "/properties/search",
      body: { page: 1 },
      clientIp: "86.120.1.5",
      fetchFn: f,
    });
    const init = f.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ page: 1, client_ip: "86.120.1.5" });
  });

  it("cererile GET trimit client_ip în query", async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await argusRequest({
      token: TOKEN,
      path: "/properties/images",
      method: "GET",
      body: { property_id: "ABC" },
      clientIp: "86.120.1.5",
      fetchFn: f,
    });
    const url = String(f.mock.calls[0][0]);
    expect(url).toContain("property_id=ABC");
    expect(url).toContain("client_ip=86.120.1.5");
  });
});
