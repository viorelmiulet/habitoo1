import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { normalizeImmofluxHost, testImmofluxPull } from "../immoflux/connection";
import { encryptImmofluxKey, unlockImmofluxKey } from "../immoflux/connection.server";

afterEach(() => vi.unstubAllEnvs());
describe("IMMOFLUX Pull stage 1", () => {
  it("uses the existing portal encryption and internal stable identity", () => {
    vi.stubEnv("PORTAL_CREDENTIALS_KEY", randomBytes(32).toString("hex"));
    const plain = randomBytes(32).toString("hex");
    const first = encryptImmofluxKey(plain);
    const second = encryptImmofluxKey(plain);
    expect(first.encrypted.startsWith("v1.")).toBe(true);
    expect(first.encrypted === plain).toBe(false);
    expect(first.encrypted === second.encrypted).toBe(false);
    expect(first.digest === second.digest).toBe(true);
    expect(unlockImmofluxKey(first.encrypted) === plain).toBe(true);
  });
  it("200 returns only aggregate total and uses documented GET without redirects", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ total: 139, data: [{ title: "private" }] })));
    const result = await testImmofluxPull("https://agency.immoflux.ro/", "habitoo", "mock-credential", fetchMock);
    expect(result).toEqual({ ok: true, httpStatus: 200, total: 139, message: "OK, 139 anunțuri disponibile" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://agency.immoflux.ro/api/bridges/portal/habitoo/properties?page=1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "manual", headers: { "X-API-Key": "mock-credential" } });
    expect(result).not.toHaveProperty("data");
  });
  it.each([[401, "Cheie API invalidă (HTTP 401)."], [404, "Portal sau slug greșit (HTTP 404)."], [500, "Conexiune nereușită: HTTP 500."]])("HTTP %s is sanitized", async (status, message) => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response("provider data must never escape", { status: Number(status) }));
    expect(await testImmofluxPull("agency.immoflux.ro", "habitoo", "mock-credential", mock)).toMatchObject({ ok: false, message, total: null });
  });
  it("rejects private/non-IMMOFLUX hosts and credential-leaking redirect destinations", async () => {
    for (const host of ["127.0.0.1", "localhost", "immoflux.ro.evil.com", "https://evil.com", "http://agency.immoflux.ro", "https://user@agency.immoflux.ro", "https://agency.immoflux.ro/path"]) expect(() => normalizeImmofluxHost(host)).toThrow();
    const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://evil.com" } }));
    expect(await testImmofluxPull("agency.immoflux.ro", "habitoo", "mock-credential", mock)).toMatchObject({ ok: false, httpStatus: 302 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("network errors never return their provider detail", async () => {
    const mock = vi.fn<typeof fetch>().mockRejectedValue(new Error("provider confidential detail"));
    expect((await testImmofluxPull("agency.immoflux.ro", "habitoo", "mock-credential", mock)).message).toBe("Conexiunea nu a răspuns în timp util sau răspunsul este invalid.");
  });
});