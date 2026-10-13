import { describe, expect, it, vi } from "vitest";
import { checkRelayIp, relayFetch } from "./relay.server";

const KEY = "super-secret-relay-key";
const env = { url: "https://relay.habitoo.ro", key: KEY };
const ok = () => vi.fn(async () => new Response("185.166.212.65", { status: 200 }));

describe("relayFetch", () => {
  it("rescrie VDI prin releu cu X-Relay-Key", async () => {
    const f = ok();
    await relayFetch("vdi", "https://vdi.ro/apioferte?cat=add", { method: "POST", redirect: "manual", headers: { "X-Api-Key": "k" } }, f, env);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://relay.habitoo.ro/vdi/apioferte?cat=add");
    const h = new Headers(init.headers);
    expect(h.get("X-Relay-Key")).toBe(KEY);
    expect(h.get("X-Api-Key")).toBe("k");
    expect(init.redirect).toBe("manual");
  });
  it("rescrie Imobiliare prin releu", async () => {
    const f = ok();
    await relayFetch("imobiliare", "https://www.imobiliare.ro/api/v3/me?x=1", {}, f, env);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://relay.habitoo.ro/imobiliare/api/v3/me?x=1");
    expect(new Headers(init.headers).get("X-Relay-Key")).toBe(KEY);
  });
  it("fără PORTAL_RELAY_URL, folosește adresa implicită a releului", async () => {
    const f = ok();
    await relayFetch("vdi", "https://vdi.ro/apioferte?cat=add", {}, f, { key: KEY });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://relay.habitoo.ro/vdi/apioferte?cat=add");
    expect(new Headers(init.headers).get("X-Relay-Key")).toBe(KEY);
    const r = await checkRelayIp(ok(), { key: KEY });
    expect(r).toEqual({ ok: true, ip: "185.166.212.65", expected: true });
  });
  it("fără secrete, apel direct", async () => {
    const f = ok();
    await relayFetch("vdi", "https://vdi.ro/api?cat=list", {}, f, {});
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://vdi.ro/api?cat=list");
    expect(new Headers(init?.headers).has("X-Relay-Key")).toBe(false);
  });
  it("cheia nu apare în erori sau loguri", async () => {
    const log = vi.spyOn(console, "log");
    const err = vi.spyOn(console, "error");
    const f = vi.fn(async () => { throw new Error(`fail ${KEY}`); });
    const e = await relayFetch("vdi", "https://vdi.ro/api", {}, f, env).catch((x: Error) => x);
    expect(String((e as Error).message)).not.toContain(KEY);
    const r = await checkRelayIp(f, env);
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(JSON.stringify([...log.mock.calls, ...err.mock.calls])).not.toContain(KEY);
  });
  it("ipcheck: 403 dă mesaj de cheie greșită", async () => {
    const r = await checkRelayIp(vi.fn(async () => new Response("", { status: 403 })), env);
    expect(r).toMatchObject({ ok: false, reason: "forbidden" });
    const good = await checkRelayIp(ok(), env);
    expect(good).toEqual({ ok: true, ip: "185.166.212.65", expected: true });
  });
});
