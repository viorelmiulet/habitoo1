import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { immofluxV2Url, maskImmofluxToken, normalizeImmofluxSubdomain, subdomainFromHost, testImmofluxPull } from "../immoflux/connection";
import { encryptImmofluxKey, unlockImmofluxKey } from "../immoflux/connection.server";

const TOKEN = "tok-SECRET-abc123";
afterEach(() => vi.unstubAllEnvs());
describe("IMMOFLUX API v2: conexiune", () => {
  it("tokenul se criptează cu cheia portalurilor și are identitate internă stabilă", () => {
    vi.stubEnv("PORTAL_CREDENTIALS_KEY", randomBytes(32).toString("hex"));
    const first = encryptImmofluxKey(TOKEN), second = encryptImmofluxKey(TOKEN);
    expect(first.encrypted.startsWith("v1.")).toBe(true);
    expect(first.encrypted.includes(TOKEN)).toBe(false);
    expect(first.digest).toBe(second.digest);
    expect(unlockImmofluxKey(first.encrypted)).toBe(TOKEN);
  });
  it("subdomeniul: litere mici, cifre, cratimă; adresa lipită se reduce la subdomeniu", () => {
    expect(normalizeImmofluxSubdomain("Agentia-1")).toBe("agentia-1");
    expect(normalizeImmofluxSubdomain("https://agentia.immoflux.ro/api/v2/properties?token=x")).toBe("agentia");
    expect(normalizeImmofluxSubdomain("agentia.immoflux.ro")).toBe("agentia");
    for (const bad of ["agen_tia", "-a", "a b", "evil.com", "x.y.immoflux.ro", "immoflux.ro.evil.com", ""]) expect(() => normalizeImmofluxSubdomain(bad)).toThrow();
    expect(subdomainFromHost("agentia.immoflux.ro")).toBe("agentia");
    expect(subdomainFromHost("immoflux.ro")).toBe("");
  });
  it("adresa este https://{subdomeniu}.immoflux.ro/api/v2/...?token=", () => {
    expect(immofluxV2Url("agentia", "properties", TOKEN, { page: 2 })).toBe(`https://agentia.immoflux.ro/api/v2/properties?page=2&token=${TOKEN}`);
  });
  it("Testează conexiunea: GET /properties, OK + număr dacă există", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ total: 139, data: [] })));
    expect(await testImmofluxPull("agentia", TOKEN, fetchMock)).toEqual({ ok: true, message: "OK, 139 anunțuri", httpStatus: 200, total: 139 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://agentia.immoflux.ro/api/v2/properties?token=${TOKEN}`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "manual" });
    const noTotal = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{ id: 1 }])));
    expect((await testImmofluxPull("agentia", TOKEN, noTotal)).message).toBe("OK");
  });
  it.each([[401, "Token API IMMOFLUX invalid (HTTP 401)."], [403, "Token API IMMOFLUX invalid (HTTP 403)."], [404, "Subdomeniu IMMOFLUX greșit (HTTP 404)."], [500, "IMMOFLUX a răspuns cu HTTP 500."]])("HTTP %s are mesaj clar", async (status, message) => {
    const r = await testImmofluxPull("agentia", TOKEN, vi.fn<typeof fetch>().mockResolvedValue(new Response("x", { status })));
    expect(r).toEqual({ ok: false, httpStatus: status, total: null, message });
  });
  it("tokenul nu apare în erori, chiar dacă rețeaua îl include în mesaj", async () => {
    const err = vi.fn<typeof fetch>().mockRejectedValue(new TypeError(`fetch failed https://agentia.immoflux.ro/api/v2/properties?token=${TOKEN}`));
    const r = await testImmofluxPull("agentia", TOKEN, err);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(maskImmofluxToken(`a?token=${TOKEN}&b=1 ${TOKEN} ${encodeURIComponent(TOKEN)}`, TOKEN)).not.toContain(TOKEN);
    expect(maskImmofluxToken("x?token=altceva")).toBe("x?token=***");
  });
});
