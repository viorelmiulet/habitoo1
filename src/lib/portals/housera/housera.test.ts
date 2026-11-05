import { beforeEach, describe, expect, it, vi } from "vitest";
import { houseraBaseUrl, houseraConfigured, houseraConsentUrl, houseraEnv, houseraKeyMode, maskHouseraKey, HOUSERA_CALLBACK, HOUSERA_RECONNECT_MESSAGE } from "./config";
import { createHouseraClient, HouseraError, resetHouseraRateState } from "./client.server";

const KEY = "12|hsr_test_abcdefgh1234WXYZ";
const BASE = "https://staging.housera.ro/api/v1/";

function res(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}
function client(responses: Response[], extra: Partial<Parameters<typeof createHouseraClient>[0]> = {}) {
  const fetch = vi.fn(async () => responses.shift()!);
  const sleep = vi.fn(async () => {});
  return { fetch, sleep, c: createHouseraClient({ key: KEY, baseUrl: BASE, fetch: fetch as never, sleep, ...extra }) };
}

beforeEach(() => resetHouseraRateState());

describe("config", () => {
  it("staging is the default", () => {
    expect(houseraEnv({})).toBe("staging");
    expect(houseraBaseUrl({})).toBe("https://staging.housera.ro/api/v1/");
    expect(houseraConsentUrl({ HOUSERA_ENV: "staging" })).toBe("https://staging.housera.ro/setari/api/conectare");
  });
  it("production", () => {
    const env = { HOUSERA_ENV: "production" };
    expect(houseraBaseUrl(env)).toBe("https://housera.ro/api/v1/");
    expect(houseraConsentUrl(env)).toBe("https://housera.ro/setari/api/conectare");
  });
  it("callback and configured", () => {
    expect(HOUSERA_CALLBACK).toBe("https://crm.habitoo.ro/api/public/portal/v1/housera/oauth/callback");
    expect(houseraConfigured({ HOUSERA_CLIENT_ID: "a" })).toBe(false);
    expect(houseraConfigured({ HOUSERA_CLIENT_ID: "a", HOUSERA_CLIENT_SECRET: "b" })).toBe(true);
  });
  it("masks keys to the last 4 characters", () => {
    expect(maskHouseraKey(KEY)).toBe("••••WXYZ");
    expect(maskHouseraKey(KEY)).not.toContain("hsr_");
    expect(maskHouseraKey(null)).toBeNull();
  });
  it("key format", () => {
    expect(houseraKeyMode(KEY)).toBe("test");
    expect(houseraKeyMode("7|hsr_live_abcdefgh123")).toBe("live");
    expect(houseraKeyMode("hsr_test_abcdefgh123")).toBeNull();
  });
});

describe("client", () => {
  it("sends the whole key, accept header and manual redirect", async () => {
    const { c, fetch } = client([res(200, { data: [] })]);
    await c.request("account/listings", { query: { fields: "code,status", per_page: 1 } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://staging.housera.ro/api/v1/account/listings?fields=code%2Cstatus&per_page=1");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect((init.headers as Record<string, string>).Accept).toBe("application/json");
    expect(init.redirect).toBe("manual");
  });
  it("401 marks reconnect with the reconnect message", async () => {
    const onUnauthorized = vi.fn();
    const { c } = client([res(401, { code: "unauthenticated", detail: "secret detail" })], { onUnauthorized });
    const e = await c.request("account/listings").catch((x) => x);
    expect(e).toBeInstanceOf(HouseraError);
    expect(e.message).toBe(HOUSERA_RECONNECT_MESSAGE);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
  it("409 listing_busy retries 3 times at 1.5 s", async () => {
    const busy = () => res(409, { code: "listing_busy" });
    const { c, fetch, sleep } = client([busy(), busy(), busy(), res(200, { ok: 1 })]);
    await expect(c.request("x")).resolves.toEqual({ ok: 1 });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((a) => (a as unknown[])[0])).toEqual([1500, 1500, 1500]);
  });
  it("409 listing_busy gives up after 3 retries", async () => {
    const busy = () => res(409, { code: "listing_busy" });
    const { c, fetch } = client([busy(), busy(), busy(), busy()]);
    const e = await c.request("x").catch((x) => x);
    expect(e.kind).toBe("busy");
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("422 returns only codes and field names", async () => {
    const { c } = client([res(422, { errors: [{ pointer: "/title", code: "min", detail: "Titlul e prea scurt" }, { pointer: "/floor", code: "floor_above_total", detail: "Etajul 5…" }] })]);
    const e = await c.request("x").catch((x) => x);
    expect(e.kind).toBe("validation");
    expect(e.codes).toEqual(["min", "floor_above_total"]);
    expect(e.fields).toEqual(["title", "floor"]);
    expect(e.message).not.toContain("prea scurt");
  });
  it("429 waits Retry-After (max 60 s) and retries once", async () => {
    const { c, fetch, sleep } = client([res(429, {}, { "Retry-After": "120" }), res(200, { ok: 1 })]);
    await expect(c.request("x")).resolves.toEqual({ ok: 1 });
    expect(sleep).toHaveBeenCalledWith(60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("429 twice fails as rate limited", async () => {
    const { c } = client([res(429, {}, { "Retry-After": "2" }), res(429, {}, { "Retry-After": "2" })]);
    expect((await c.request("x").catch((x) => x)).kind).toBe("rate_limited");
  });
  it("5xx and timeout are temporary", async () => {
    expect((await client([res(503, {})]).c.request("x").catch((x) => x)).kind).toBe("temporary");
    const fetch = vi.fn(async () => { throw new DOMException("t", "TimeoutError"); });
    const c = createHouseraClient({ key: KEY, baseUrl: BASE, fetch: fetch as never, sleep: async () => {} });
    expect((await c.request("x").catch((x) => x)).kind).toBe("temporary");
  });
  it("slows down when X-RateLimit-Remaining is low", async () => {
    const { c, sleep } = client([res(200, {}, { "X-RateLimit-Remaining": "3" }), res(200, {})]);
    await c.request("x");
    expect(sleep).not.toHaveBeenCalled();
    await c.request("x");
    expect(sleep).toHaveBeenCalledOnce();
  });
});
