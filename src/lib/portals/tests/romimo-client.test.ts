/**
 * Teste Romimo API v2 — exclusiv cu fetch mock, fără niciun apel real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ROMIMO_MESSAGE,
  assertRomimoUrl,
  clearRomimoTokenCache,
  deleteArticle,
  getPackage,
  getToken,
  saveArticle,
  withRomimoToken,
} from "@/lib/portals/romimo/client.server";
import { createRomimoAdapter } from "@/lib/portals/adapters/romimo.server";
import type { PortalContext } from "@/lib/portals/adapter";
import type { SaveArticleDto } from "@/lib/portals/romimo/types";

const API_KEY = "rk_secret_apikey_do_not_log";
const TOKEN = "jwt.header.payload.signature";
const EMAIL = "agentie@example.ro";

type Call = { url: string; init: RequestInit };

function mockFetch(responder: (call: Call, index: number) => Response) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return responder(call, calls.length - 1);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function headerOf(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

function ctx(overrides: Partial<PortalContext> = {}): PortalContext {
  return {
    organizationId: "org-1",
    definition: { id: "romimo" } as PortalContext["definition"],
    direction: "habitoo_to_portal",
    authenticationMode: "portal_api_key",
    externalAccountId: EMAIL,
    portalCredential: API_KEY,
    settings: {},
    allowLiveRequests: true,
    ...overrides,
  };
}

const DTO: SaveArticleDto = {
  user: { email: "placeholder@example.ro" },
  ad: { externalid: "HBT-1", title: "Apartament 2 camere" },
};

beforeEach(() => {
  clearRomimoTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("client Romimo", () => {
  it("obține tokenul cu POST /api/Token, Content-Length: 0 și fără body", async () => {
    const calls = mockFetch(() => new Response(JSON.stringify(TOKEN), { status: 200 }));
    const result = await getToken(API_KEY);
    expect(result.ok && result.data).toBe(TOKEN);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("https://services.romimo.ro/api/Token?ApiKey=");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.body).toBeUndefined();
    expect(headerOf(calls[0]!.init, "content-length")).toBe("0");
  });

  it("trimite x-api-version: 2 pe toate apelurile", async () => {
    const calls = mockFetch((_call, index) =>
      index === 0 ? new Response(JSON.stringify(TOKEN)) : json({ name: "Standard" }),
    );
    await withRomimoToken(API_KEY, (token) => getPackage(token, EMAIL));
    await saveArticle(TOKEN, DTO);
    await deleteArticle(TOKEN, EMAIL, "HBT-1");
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) expect(headerOf(call.init, "x-api-version")).toBe("2");
  });

  it("reînnoiește tokenul o singură dată după 401 și reia apelul o singură dată", async () => {
    const calls = mockFetch((call) => {
      if (call.url.includes("/api/Token")) return new Response(JSON.stringify(TOKEN));
      return calls.filter((c) => c.url.includes("/api/User/Package")).length === 1
        ? json({ title: "unauthorized" }, 401)
        : json({ name: "Standard" });
    });
    const result = await withRomimoToken(API_KEY, (token) => getPackage(token, EMAIL));
    expect(result.ok).toBe(true);
    expect(calls.filter((c) => c.url.includes("/api/Token"))).toHaveLength(2);
    expect(calls.filter((c) => c.url.includes("/api/User/Package"))).toHaveLength(2);
  });

  it("reînnoiește tokenul o singură dată după 402 și nu insistă dacă tot eșuează", async () => {
    const calls = mockFetch((call) => {
      if (call.url.includes("/api/Token")) return new Response(JSON.stringify(TOKEN));
      return json({ title: "expired" }, 402);
    });
    const result = await withRomimoToken(API_KEY, (token) => getPackage(token, EMAIL));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toBe(ROMIMO_MESSAGE.tokenExpired);
    expect(calls.filter((c) => c.url.includes("/api/Token"))).toHaveLength(2);
    expect(calls.filter((c) => c.url.includes("/api/User/Package"))).toHaveLength(2);
  });

  it("mapează 400 cu detaliile din ProblemDetails", async () => {
    mockFetch(() => json({ title: "Bad Request", detail: "externalid lipsește" }, 400));
    const result = await saveArticle(TOKEN, DTO);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.kind).toBe("invalid_request");
    expect(!result.ok && result.message).toContain(
      "Romimo a respins cererea: structură invalidă SAU emailul contului nu are pachet Romimo activ.",
    );
    expect(!result.ok && result.message).toContain("externalid lipsește");
  });

  it("dă mesaje distincte pentru 415, 500 și timeout", async () => {
    mockFetch(() => json({}, 415));
    const unsupported = await saveArticle(TOKEN, DTO);
    expect(!unsupported.ok && unsupported.message).toBe(ROMIMO_MESSAGE.unsupportedMediaType);

    mockFetch(() => json({}, 500));
    const server = await saveArticle(TOKEN, DTO);
    expect(!server.ok && server.message).toBe(ROMIMO_MESSAGE.serverError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }),
    );
    const timeout = await saveArticle(TOKEN, DTO);
    expect(!timeout.ok && timeout.message).toBe(ROMIMO_MESSAGE.timeout);
  });

  it("nu face retry la POST, dar reîncearcă o dată la GET pe 500", async () => {
    const postCalls = mockFetch(() => json({}, 500));
    await saveArticle(TOKEN, DTO);
    expect(postCalls).toHaveLength(1);

    const getCalls = mockFetch(() => json({}, 500));
    await getPackage(TOKEN, EMAIL);
    expect(getCalls).toHaveLength(2);
  });

  it("refuză orice host în afara allowlist-ului și nu urmează redirecturi", async () => {
    expect(() => assertRomimoUrl("https://services.romimo.com/api/Token")).toThrow();
    expect(() => assertRomimoUrl("http://services.romimo.ro/api/Token")).toThrow();
    expect(assertRomimoUrl("https://services.romimo.ro/api/Article").hostname).toBe(
      "services.romimo.ro",
    );

    const calls = mockFetch(() => new Response(null, { status: 302 }));
    const result = await saveArticle(TOKEN, DTO);
    expect(!result.ok && result.kind).toBe("blocked_host");
    expect(calls[0]!.init.redirect).toBe("manual");
  });

  it("nu scurge ApiKey-ul sau tokenul în mesaje, detalii sau loguri", async () => {
    const logs: string[] = [];
    const spyLog = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    const spyError = vi.spyOn(console, "error").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockFetch((call) =>
      call.url.includes("/api/Token")
        ? new Response(JSON.stringify(TOKEN))
        : json({ title: "Bad Request" }, 400),
    );
    const adapter = createRomimoAdapter(async () => ({ ok: true, dto: DTO }));
    const result = await adapter.publishListing(ctx(), { propertyId: "p1", externalId: "HBT-1" });

    const serialized = JSON.stringify(result) + logs.join(" ");
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain(TOKEN);
    spyLog.mockRestore();
    spyError.mockRestore();
  });
});

describe("adaptor Romimo", () => {
  it("testConnection reușește când tokenul și pachetul sunt returnate", async () => {
    mockFetch((call) =>
      call.url.includes("/api/Token")
        ? new Response(JSON.stringify(TOKEN))
        : json({ name: "Standard", active: true }),
    );
    const adapter = createRomimoAdapter(async () => ({ ok: true, dto: DTO }));
    const result = await adapter.testConnection(ctx());
    expect(result.ok && result.data.live).toBe(true);
  });

  it("testConnection raportează separat ApiKey invalid și lipsa pachetului", async () => {
    mockFetch((call) =>
      call.url.includes("/api/Token") ? json({ title: "no" }, 401) : json({}),
    );
    const adapter = createRomimoAdapter(async () => ({ ok: true, dto: DTO }));
    const invalidKey = await adapter.testConnection(ctx());
    expect(!invalidKey.ok && invalidKey.message).toBe(ROMIMO_MESSAGE.invalidApiKey);

    clearRomimoTokenCache();
    mockFetch((call) =>
      call.url.includes("/api/Token") ? new Response(JSON.stringify(TOKEN)) : json(null),
    );
    const noPackage = await adapter.testConnection(ctx());
    expect(!noPackage.ok && noPackage.message).toContain("nu are pachet Romimo activ");
  });

  it("publishListing setează user.email din contul agenției și trimite externalid-ul", async () => {
    const calls = mockFetch((call) =>
      call.url.includes("/api/Token") ? new Response(JSON.stringify(TOKEN)) : json({ ok: true }),
    );
    const adapter = createRomimoAdapter(async () => ({ ok: true, dto: DTO }));
    const result = await adapter.publishListing(ctx(), { propertyId: "p1", externalId: null });
    expect(result.ok && result.data.externalId).toBe("HBT-1");

    const article = calls.find((c) => c.url.endsWith("/api/Article"))!;
    expect(headerOf(article.init, "content-type")).toBe("application/json");
    expect(JSON.parse(String(article.init.body))).toMatchObject({
      externalid: "HBT-1",
      user: { email: EMAIL },
    });
  });

  it("withdrawListing apelează DELETE /api/Article cu emailul și externalid-ul", async () => {
    const calls = mockFetch((call) =>
      call.url.includes("/api/Token")
        ? new Response(JSON.stringify(TOKEN))
        : new Response(null, { status: 204 }),
    );
    const adapter = createRomimoAdapter(async () => ({ ok: true, dto: DTO }));
    const result = await adapter.withdrawListing(ctx(), {
      propertyId: "p1",
      externalId: "HBT-1",
    });
    expect(result.ok).toBe(true);
    const del = calls.find((c) => c.init.method === "DELETE")!;
    expect(del.url).toContain("ExternalId=HBT-1");
    expect(del.url).toContain(`Email=${encodeURIComponent(EMAIL)}`);
  });

  it("nu trimite nimic când scrierile live sunt oprite", async () => {
    const calls = mockFetch(() => json({}));
    const adapter = createRomimoAdapter(async () => ({ ok: true, dto: DTO }));
    const result = await adapter.publishListing(ctx({ allowLiveRequests: false }), {
      propertyId: "p1",
      externalId: null,
    });
    expect(result.ok && result.data.live).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
