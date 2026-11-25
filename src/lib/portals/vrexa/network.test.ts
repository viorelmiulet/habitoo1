import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearVrexaTokenCache, vrexaRequest, type VrexaCredentials } from "./client";
import { createVrexaAdapter } from "../adapters/vrexa.server";
import type { PortalContext } from "../adapter";
import type { VrexaListingData } from "./listing.server";

const secret = "fixture-secret-123";
const token = "fixture-token-456";
const creds: VrexaCredentials = { organizationId: "fixture-org", env: "production", baseUrl: "https://fixture.vrexa.invalid", clientId: "fixture-client", clientSecret: secret };
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const ctx: PortalContext = {
  organizationId: creds.organizationId, definition: {} as PortalContext["definition"],
  direction: "habitoo_to_portal" as PortalContext["direction"], authenticationMode: "portal_api_key" as PortalContext["authenticationMode"],
  externalAccountId: creds.clientId, portalCredential: secret, settings: { vrexa_env: "production" }, allowLiveRequests: true,
};

beforeEach(() => clearVrexaTokenCache());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Vrexa network regression", () => {
  it("uses global fetch without an object receiver for OAuth and the authenticated request", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async function (this: unknown, url: string) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      calls.push(url);
      return response(url.endsWith("/oauth/token") ? { access_token: token } : { totalCount: 7 });
    });
    const result = await vrexaRequest(creds, "GET", "/partner/v1/listings?pageSize=1");
    expect(result).toEqual({ ok: true, status: 200, data: { totalCount: 7 } });
    expect(calls).toEqual([`${creds.baseUrl}/oauth/token`, `${creds.baseUrl}/partner/v1/listings?pageSize=1`]);
  });

  it.each(["oauth", "listing"])("keeps the real %s exception in the adapter journal detail without credentials", async (stage) => {
    const logs: unknown[][] = [];
    for (const key of ["log", "warn", "error", "info"] as const) vi.spyOn(console, key).mockImplementation((...args: unknown[]) => { logs.push(args); });
    const transport = vi.fn(async (url: string) => {
      if (stage === "listing" && url.endsWith("/oauth/token")) return response({ access_token: token });
      throw new TypeError(`connection refused ${secret} ${token}`);
    });
    // OAuth has no issued token yet, so its diagnostic contains only the known secret.
    if (stage === "oauth") transport.mockImplementation(async () => { throw new TypeError(`connection refused ${secret}`); });
    const result = await createVrexaAdapter({ transport, env: () => ({ VREXA_PRODUCTION_URL: creds.baseUrl }) }).testConnection(ctx);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected network failure");
    expect(result.detail).toContain("TypeError: connection refused [redactat]");
    expect(result.message).toContain("Vrexa nu a putut fi contactat: TypeError: connection refused");
    expect(JSON.stringify({ result, logs })).not.toContain(secret);
    expect(JSON.stringify({ result, logs })).not.toContain(token);
    expect(transport).toHaveBeenCalledTimes(stage === "oauth" ? 1 : 2);
  });

  it.each(["oauth", "listing"])("identifies the 30-second timeout during %s and retains its technical detail", async (stage) => {
    const transport = vi.fn(async (url: string) => {
      if (stage === "listing" && url.endsWith("/oauth/token")) return response({ access_token: token });
      throw new DOMException("request deadline exceeded", "TimeoutError");
    });
    const result = await vrexaRequest(creds, "GET", "/partner/v1/listings?pageSize=1", undefined, { transport });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected timeout");
    expect(result.message).toBe("Vrexa nu a răspuns în 30 de secunde.");
    expect(result.problem.detail).toBe("TimeoutError: request deadline exceeded");
    expect(transport).toHaveBeenCalledTimes(stage === "oauth" ? 1 : 2);
  });

  it("preserves the sanitized exception for publication journaling too", async () => {
    const listing: VrexaListingData = {
      mapping: { ok: true, listings: [{ transaction: "sale", body: { type: "apartment", title: "Fixture", price: 100000 } }], warnings: [] },
      reference: "HB-1376", stored: [], images: [], imageWarnings: [],
    };
    const transport = vi.fn(async (url: string) => {
      if (url.endsWith("/oauth/token")) return response({ access_token: token });
      throw new TypeError(`connection refused ${secret} ${token}`);
    });
    const result = await createVrexaAdapter({ transport, env: () => ({ VREXA_PRODUCTION_URL: creds.baseUrl }), load: async () => listing })
      .publishListing(ctx, { propertyId: "fixture-property", externalId: null });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected publication failure");
    expect(result.code).toBe("NETWORK_ERROR");
    expect(result.detail).toContain("TypeError: connection refused [redactat] [redactat]");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(transport).toHaveBeenCalledTimes(2);
  });
});