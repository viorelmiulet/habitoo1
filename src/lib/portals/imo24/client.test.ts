import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IMO24_BASE_URL,
  describeImo24Account,
  getImo24Account,
  imo24Request,
  imo24SpacingMs,
  resetImo24ClientState,
  type Imo24Account,
} from "./client";
import { imo24KeyPrefix, isValidImo24Key } from "./key";
import { validatePortalConfigValues } from "../registry";
import { createImo24Adapter } from "../adapters/imo24.server";

const KEY = `i24_0123abcd_${"a1".repeat(20)}`;

const account: Imo24Account = {
  agentie: { id: 7, nume: "Agenția Test", email: "a@test.ro" },
  pachet: { stare: "activ", total: 50, ocupate: 10, rezervate: 2, libere: 38, fara_limita: 0, expira: "2026-12-01", gratie_expira: "" },
  limite: { rata_ora: 600 },
  cheie: { prefix: "0123abcd", nume: "CRM", scopuri: ["citire", "scriere"] },
};

function res(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const noSleep = vi.fn(async () => {});

beforeEach(() => {
  resetImo24ClientState();
  noSleep.mockClear();
});

describe("imo24 key format", () => {
  it("accepts i24_<8 hex>_<40 hex> only", () => {
    expect(isValidImo24Key(KEY)).toBe(true);
    expect(isValidImo24Key(`  ${KEY}  `)).toBe(true);
    expect(imo24KeyPrefix(KEY)).toBe("0123abcd");
    expect(isValidImo24Key("i24_0123abc_" + "a".repeat(40))).toBe(false);
    expect(isValidImo24Key("i24_0123abcd_" + "a".repeat(39))).toBe(false);
    expect(isValidImo24Key("i24_0123abcz_" + "a".repeat(40))).toBe(false);
    expect(isValidImo24Key("sk_" + "a".repeat(40))).toBe(false);
  });
  it("is enforced by the registry when saving", () => {
    expect(validatePortalConfigValues("imo24", { credential: KEY })).toBeNull();
    expect(validatePortalConfigValues("imo24", { credential: "gresit" })).toMatch(/i24_/);
  });
});

describe("imo24 client", () => {
  it("GET /me over HTTPS with Bearer, no redirects, reads headers", async () => {
    const fetchMock = vi.fn(async () =>
      res(200, { ok: true, data: account, meta: { id_cerere: "0123456789abcdef" } }, {
        "X-Request-Id": "0123456789abcdef",
        "X-RateLimit-Remaining": "599",
      }),
    );
    const r = await getImo24Account(KEY, { fetch: fetchMock as unknown as typeof fetch, sleep: noSleep });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.requestId).toBe("0123456789abcdef");
    expect(r.rateLimitRemaining).toBe(599);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${IMO24_BASE_URL}/me`);
    expect(url.startsWith("https://imo24.ro/api/v1")).toBe(true);
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it("never retries 401 and stops using the rejected key", async () => {
    const fetchMock = vi.fn(async () =>
      res(401, { ok: false, error: { code: "neautorizat", message: "x" }, meta: { id_cerere: "0" } }),
    );
    const deps = { fetch: fetchMock as unknown as typeof fetch, sleep: noSleep };
    const r = await getImo24Account(KEY, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("unauthorized");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const again = await getImo24Account(KEY, deps);
    expect(!again.ok && again.kind).toBe("auth_cooldown");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 5xx and 429 with a pause, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(503, { ok: false, error: { code: "serviciu_indisponibil", message: "x" } }))
      .mockResolvedValueOnce(res(429, { ok: false, error: { code: "rata_depasita", message: "x" } }, { "Retry-After": "3" }))
      .mockResolvedValueOnce(res(200, { ok: true, data: account }));
    const r = await getImo24Account(KEY, { fetch: fetchMock as unknown as typeof fetch, sleep: noSleep });
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(noSleep).toHaveBeenCalledWith(2000);
    expect(noSleep).toHaveBeenCalledWith(3000);
  });

  it("does not retry 4xx business errors and maps Romanian messages", async () => {
    for (const [code, re] of [
      ["limita_pachet", /sloturi libere/],
      ["pachet_inactiv", /nu este activ/],
      ["anunt_duplicat", /același titlu sau aceeași descriere/],
      ["camp_imutabil", /modificarea unui câmp/],
    ] as const) {
      resetImo24ClientState();
      const fetchMock = vi.fn(async () => res(409, { ok: false, error: { code, message: "x" } }));
      const r = await imo24Request(KEY, "GET", "/me", undefined, { fetch: fetchMock as unknown as typeof fetch, sleep: noSleep });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(!r.ok && r.message).toMatch(re);
    }
  });

  it("lists validation fields", async () => {
    const fetchMock = vi.fn(async () =>
      res(422, { ok: false, error: { code: "validare", message: "x", fields: { titlu: { code: "prea_scurt", message: "minim 10 caractere" } } } }),
    );
    const r = await imo24Request(KEY, "GET", "/me", undefined, { fetch: fetchMock as unknown as typeof fetch, sleep: noSleep });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("validation");
    expect(r.fields).toEqual([{ field: "titlu", code: "prea_scurt", message: "minim 10 caractere" }]);
    expect(r.message).toContain("titlu: minim 10 caractere");
  });

  it("refuses redirects and invalid keys without calling, never uses /credite", async () => {
    const redirect = vi.fn(async () => new Response(null, { status: 301, headers: { Location: "http://imo24.ro/x" } }));
    const r = await getImo24Account(KEY, { fetch: redirect as unknown as typeof fetch, sleep: noSleep });
    expect(!r.ok && r.kind).toBe("blocked_redirect");
    const none = vi.fn();
    const bad = await getImo24Account("gresit", { fetch: none as unknown as typeof fetch });
    expect(!bad.ok && bad.kind).toBe("invalid_key_format");
    expect(none).not.toHaveBeenCalled();
    await expect(imo24Request(KEY, "GET", "/credite", undefined, { fetch: none as unknown as typeof fetch })).rejects.toThrow();
  });

  it("slows down when few requests remain and stops at zero", async () => {
    const now = 1_000_000;
    expect(imo24SpacingMs(400, now + 3_600_000, now)).toBe(0);
    expect(imo24SpacingMs(10, now + 50_000, now)).toBe(5000);
    expect(imo24SpacingMs(0, now + 50_000, now)).toBeNull();
    const fetchMock = vi.fn(async () =>
      res(200, { ok: true, data: account }, { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(Math.floor((Date.now() + 60_000) / 1000)) }),
    );
    const deps = { fetch: fetchMock as unknown as typeof fetch, sleep: noSleep };
    await getImo24Account(KEY, deps);
    const blocked = await getImo24Account(KEY, deps);
    expect(!blocked.ok && blocked.kind).toBe("rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("imo24 test connection", () => {
  const ctx = (credential: string | null) => ({
    organizationId: "o",
    definition: {} as never,
    direction: "habitoo_to_portal" as const,
    authenticationMode: "portal_api_key" as const,
    externalAccountId: null,
    portalCredential: credential,
    settings: {},
    allowLiveRequests: true,
  });

  it("shows agency, package, slots and scopes", async () => {
    const fetchMock = vi.fn(async () => res(200, { ok: true, data: account }));
    const adapter = createImo24Adapter({ fetch: fetchMock as unknown as typeof fetch, sleep: noSleep });
    const r = await adapter.testConnection(ctx(KEY));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.detail).toBe("Agenție: Agenția Test · Pachet: activ, 38/50 sloturi libere · Scopurile cheii: citire, scriere");
  });

  it("fails when the key lacks the write scope", async () => {
    const readOnly = { ...account, pachet: { ...account.pachet, stare: "gratie" as const }, cheie: { ...account.cheie, scopuri: ["citire" as const] } };
    expect(describeImo24Account(readOnly).ok).toBe(false);
    const fetchMock = vi.fn(async () => res(200, { ok: true, data: readOnly }));
    const r = await createImo24Adapter({ fetch: fetchMock as unknown as typeof fetch, sleep: noSleep }).testConnection(ctx(KEY));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/în perioada de grație.*scriere/);
  });

  it("rejects a malformed key without calling imo24", async () => {
    const fetchMock = vi.fn();
    const r = await createImo24Adapter({ fetch: fetchMock as unknown as typeof fetch }).testConnection(ctx("i24_bad"));
    expect(!r.ok && r.code).toBe("CONFIG_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
