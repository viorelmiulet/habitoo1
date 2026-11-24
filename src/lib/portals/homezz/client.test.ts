import { describe, expect, it, vi } from "vitest";
import { encodeHomezzForm, homezzPost, interpretHomezzResponse, redactHomezz } from "./client";
import { relayFetch, rewriteForRelay } from "../relay.server";
import { createHomezzAdapter } from "../adapters/homezz.server";

const KEY = "hz-secret-KEY-123";
const TOKEN = "tok/+ secret";

describe("HomeZZ form encoding", () => {
  it("codează vectorii ca nume[index]", () => {
    const body = encodeHomezzForm({ key: "k", images: ["a.jpg", "b.jpg"], promotions: { 3: 5 }, skip: null, flag: true });
    expect(body).toBe("key=k&images%5B0%5D=a.jpg&images%5B1%5D=b.jpg&promotions%5B3%5D=5&flag=1");
    expect(new URLSearchParams(body).get("promotions[3]")).toBe("5");
  });
});

describe("HomeZZ response", () => {
  it("200 = succes", () => {
    const r = interpretHomezzResponse(200, JSON.stringify({ meta: { code: 200, message: "OK" }, data: { slots: 10 } }));
    expect(r).toMatchObject({ ok: true, data: { slots: 10 } });
  });
  it("400 păstrează exact meta.message și data.ad_error", () => {
    const r = interpretHomezzResponse(200, JSON.stringify({ meta: { code: 400, message: "Anunț invalid" }, data: { ad_error: "Lipsește prețul" } }));
    expect(r).toMatchObject({ ok: false, kind: "action_error", message: "Anunț invalid — Lipsește prețul", adError: "Lipsește prețul", retryable: false });
  });
  it("403 = parametri incorecți, fără reîncercare", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ meta: { code: 403, message: "Cheie invalida" }, data: null }), { status: 403 }));
    const r = await homezzPost("details-agency", { key: KEY }, transport);
    expect(r).toMatchObject({ ok: false, kind: "forbidden", message: "Cheie invalida", retryable: false });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://homezz.ro/xmlimport/details-agency");
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
  });
});

describe("HomeZZ redactare", () => {
  it("key și token nu apar în mesaje sau răspuns brut", () => {
    const body = JSON.stringify({ meta: { code: 400, message: `key ${KEY} greșită` }, data: { ad_error: `token=${encodeURIComponent(TOKEN)}`, key: KEY } });
    const r = interpretHomezzResponse(400, body, [KEY, TOKEN]);
    const all = JSON.stringify(r);
    expect(all).not.toContain(KEY);
    expect(all).not.toContain(encodeURIComponent(TOKEN));
    expect(redactHomezz(`a ${TOKEN} b`, [TOKEN])).toBe("a [ascuns] b");
  });
  it("testul conexiunii nu expune cheia", async () => {
    const adapter = createHomezzAdapter(async () => new Response(JSON.stringify({ meta: { code: 200, message: "ok" }, data: { key: KEY, contract_end: "2027-01-01", slots: 20, promotions: 3 } }), { status: 200 }));
    const r = await adapter.testConnection({ portalCredential: KEY, allowLiveRequests: true } as never);
    expect(r.ok).toBe(true);
    const all = JSON.stringify(r);
    expect(all).not.toContain(KEY);
    if (r.ok) expect(r.data.detail).toContain("Sloturi");
  });
});

describe("HomeZZ releu", () => {
  it("rescrie homezz.ro către releu", async () => {
    expect(rewriteForRelay("homezz", "https://homezz.ro/xmlimport/details-agency", "https://relay.x")).toBe("https://relay.x/homezz/xmlimport/details-agency");
    expect(rewriteForRelay("homezz", "https://evil.ro/xmlimport/x", "https://relay.x")).toBeNull();
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await relayFetch("homezz", "https://homezz.ro/xmlimport/details-agency", { method: "POST" }, fetchImpl as unknown as typeof fetch, { url: "https://relay.x", key: "rk" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://relay.x/homezz/xmlimport/details-agency");
    expect(new Headers(init.headers).get("X-Relay-Key")).toBe("rk");
  });
});
