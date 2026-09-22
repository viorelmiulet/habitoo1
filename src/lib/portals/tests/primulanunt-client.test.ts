/**
 * Teste PrimulAnunț.ro API public v1 — exclusiv cu fetch mock, fără apeluri reale.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PRIMULANUNT_MESSAGE,
  assertPrimulAnuntUrl,
  createOrUpdateListing,
  deleteListing,
  patchListing,
  ping,
} from "@/lib/portals/primulanunt/client.server";
import { createPrimulAnuntAdapter } from "@/lib/portals/adapters/primulanunt.server";
import type { PortalContext } from "@/lib/portals/adapter";
import type { PrimulAnuntListingDto } from "@/lib/portals/primulanunt/types";

const API_KEY = "pa_live_secret_key_do_not_log";

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

const DTO: PrimulAnuntListingDto = {
  external_id: "HB-1009",
  title: "Apartament 3 camere, bloc nou, Cluj-Napoca",
  description: "Text descriptiv complet pentru anunț.",
  purpose: "sale",
  property_type: "apartament",
  price: 145000,
  currency: "EUR",
  rooms: 3,
  county: "Cluj",
  city: "Cluj-Napoca",
};

function ctx(overrides: Partial<PortalContext> = {}): PortalContext {
  return {
    organizationId: "org-1",
    definition: { id: "primulanunt" } as PortalContext["definition"],
    direction: "habitoo_to_portal",
    authenticationMode: "portal_api_key",
    externalAccountId: null,
    portalCredential: API_KEY,
    settings: {},
    allowLiveRequests: true,
    ...overrides,
  };
}

const adapter = createPrimulAnuntAdapter(async () => ({ ok: true, dto: DTO }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("client PrimulAnunț.ro", () => {
  it("ping reușit trimite Bearer pe adresa documentată", async () => {
    const calls = mockFetch(() => json({ ok: true }));
    const result = await ping(API_KEY);
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe("https://www.primulanunt.ro/api/public/v1/ping");
    expect(calls[0]?.init.method).toBe("GET");
    expect(headerOf(calls[0]!.init, "authorization")).toBe(`Bearer ${API_KEY}`);
  });

  it("ping eșuat cu 401 dă mesajul de cheie lipsă sau revocată", async () => {
    mockFetch(() => json({ message: "unauthorized" }, 401));
    const result = await ping(API_KEY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("invalid_api_key");
    expect(result.message).toBe(PRIMULANUNT_MESSAGE.invalidApiKey);
  });

  it("creare/actualizare trimite JSON pe POST /listings și întoarce linkul public", async () => {
    const calls = mockFetch(() =>
      json({ id: "pa-1", external_id: "HB-1009", status: "published", url: "https://www.primulanunt.ro/anunturi/abc" }),
    );
    const result = await createOrUpdateListing(API_KEY, DTO);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.url).toBe("https://www.primulanunt.ro/anunturi/abc");
    expect(calls[0]?.url).toBe("https://www.primulanunt.ro/api/public/v1/listings");
    expect(calls[0]?.init.method).toBe("POST");
    expect(headerOf(calls[0]!.init, "content-type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ external_id: "HB-1009" });
  });

  it("422 este mapat cu lista câmpurilor invalide din răspuns", async () => {
    mockFetch(() => json({ errors: { title: ["prea scurt"], price: ["obligatoriu"] } }, 422));
    const result = await createOrUpdateListing(API_KEY, DTO);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("invalid_data");
    expect(result.fields).toEqual(["title", "price"]);
    expect(result.message).toBe("PrimulAnunț.ro a respins datele: title, price.");
  });

  it("400 preia mesajul explicit al portalului", async () => {
    mockFetch(() => json({ message: "Localitatea nu este recunoscută." }, 400));
    const result = await createOrUpdateListing(API_KEY, DTO);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(
      "Eroare de procesare la PrimulAnunț.ro: Localitatea nu este recunoscută.",
    );
  });

  it("5xx și timeout au mesaje distincte", async () => {
    mockFetch(() => json({}, 503));
    const server = await ping(API_KEY);
    expect(server.ok === false && server.message).toBe(PRIMULANUNT_MESSAGE.serverError);

    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }),
    );
    const timeout = await ping(API_KEY);
    expect(timeout.ok === false && timeout.message).toBe(PRIMULANUNT_MESSAGE.timeout);
  });

  it("PATCH trimite doar câmpurile date", async () => {
    const calls = mockFetch(() => json({ id: "pa-1" }));
    await patchListing(API_KEY, "HB-1009", { price: 139000 });
    expect(calls[0]?.url).toBe("https://www.primulanunt.ro/api/public/v1/listings/HB-1009");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ price: 139000 });
  });

  it("DELETE arhivează anunțul", async () => {
    const calls = mockFetch(() => json({ id: "pa-1", status: "archived" }));
    const result = await deleteListing(API_KEY, "HB-1009");
    expect(result.ok).toBe(true);
    expect(calls[0]?.init.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("https://www.primulanunt.ro/api/public/v1/listings/HB-1009");
  });

  it("refuză orice host în afara allowlist-ului", () => {
    expect(() => assertPrimulAnuntUrl("https://primulanunt.ro/api/public/v1/ping")).toThrow();
    expect(() => assertPrimulAnuntUrl("http://www.primulanunt.ro/api/public/v1/ping")).toThrow();
    expect(() => assertPrimulAnuntUrl("https://evil.example/api")).toThrow();
    expect(assertPrimulAnuntUrl("https://www.primulanunt.ro/api/public/v1/ping").hostname).toBe(
      "www.primulanunt.ro",
    );
  });

  it("cheia API nu apare în mesaje, detalii sau jurnal", async () => {
    mockFetch(() => json({ message: "unauthorized" }, 401));
    const result = await adapter.publishListing(ctx(), { propertyId: "p1", externalId: null });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain("pa_live_");
  });
});

describe("adaptor PrimulAnunț.ro", () => {
  it("testConnection reușește la 200 de la ping", async () => {
    mockFetch(() => json({ ok: true }));
    const result = await adapter.testConnection(ctx());
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.live).toBe(true);
  });

  it("publicarea trimite payload-ul primit și întoarce external_id plus linkul", async () => {
    mockFetch(() => json({ external_id: "HB-1009", status: "published", url: "https://www.primulanunt.ro/anunturi/x" }));
    const result = await adapter.publishListing(ctx(), { propertyId: "p1", externalId: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.externalId).toBe("HB-1009");
    expect(result.data.publicUrl).toBe("https://www.primulanunt.ro/anunturi/x");
  });

  it("fără cheie API nu se face niciun apel", async () => {
    const calls = mockFetch(() => json({}));
    const result = await adapter.testConnection(ctx({ portalCredential: null }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("CONFIG_ERROR");
    expect(calls).toHaveLength(0);
  });

  it("retragerea arhivează prin DELETE", async () => {
    const calls = mockFetch(() => json({ status: "archived" }));
    const result = await adapter.withdrawListing(ctx(), {
      propertyId: "p1",
      externalId: "HB-1009",
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.message).toContain("arhivat");
    expect(calls[0]?.init.method).toBe("DELETE");
  });

  it("404 la retragere este tratat ca anunț inexistent, nu ca eroare", async () => {
    mockFetch(() => json({ message: "not found" }, 404));
    const result = await adapter.withdrawListing(ctx(), {
      propertyId: "p1",
      externalId: "HB-1009",
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.message).toContain("nu a fost găsit");
  });
});
