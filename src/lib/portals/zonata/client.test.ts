import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ZONATA_WINDOW_LIMIT,
  describeZonataAccount,
  getZonataAccount,
  resetZonataClientState,
  zonataLimiterWaitMs,
  zonataRequest,
} from "./client";
import { isValidZonataKey, zonataKeyMode } from "./key";
import { validatePortalConfigValues, portalCanPublish, getPortalDefinition } from "../registry";
import { createZonataAdapter } from "../adapters/zonata.server";

const LIVE = "zt_live_ABCDEFGHIJKLMNOPQRSTUVWX";
const TEST = "zt_test_ABCDEFGHIJKLMNOPQRSTUVWX";

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const noSleep = vi.fn(async () => undefined);
afterEach(() => vi.useRealTimers());

beforeEach(() => {
  resetZonataClientState();
  noSleep.mockClear();
});

describe("cheia ZonaTa", () => {
  it("acceptă doar zt_live_ și zt_test_", () => {
    expect(isValidZonataKey(LIVE)).toBe(true);
    expect(isValidZonataKey(TEST)).toBe(true);
    expect(isValidZonataKey("zt_prod_ABCDEFGHIJ")).toBe(false);
    expect(isValidZonataKey("i24_0123abcd_x")).toBe(false);
    expect(isValidZonataKey("")).toBe(false);
  });
  it("detectează modul Test / Live", () => {
    expect(zonataKeyMode(LIVE)).toBe("live");
    expect(zonataKeyMode(TEST)).toBe("test");
    expect(zonataKeyMode("abc")).toBeNull();
  });
  it("validarea la salvare respinge alt prefix", () => {
    expect(validatePortalConfigValues("zonata", { credential: "abc" })).toMatch(/zt_live_/);
    expect(validatePortalConfigValues("zonata", { credential: TEST })).toBeNull();
  });
  it("publicarea este activă de la pasul 3", () => {
    expect(portalCanPublish("zonata")).toBe(true);
    expect(getPortalDefinition("zonata")?.publish_coming_soon).toBeUndefined();
  });
});

describe("ZonaTa request deadlines", () => {
  for (const [method, path, duration] of [["POST", "/listings", 90000], ["GET", "/listings/ext:HB-1-v", 30000], ["PATCH", "/listings/ext:HB-1-v", 30000], ["DELETE", "/listings/ext:HB-1-v", 30000]] as const) {
    it(`${method} aborts at ${duration}ms, not before`, async () => {
      vi.useFakeTimers();
      let signal: AbortSignal | null = null;
      const f = vi.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
        signal = init.signal ?? null;
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }));
      const pending = zonataRequest(TEST, method, path, undefined, { fetch: f as never });
      await vi.advanceTimersByTimeAsync(duration - 1);
      expect((signal as AbortSignal | null)?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;
      expect(result).toMatchObject({ ok: false, kind: "timeout", message: `ZonaTa nu a răspuns în ${duration / 1000} de secunde.` });
    });
  }
  it("keeps the timeout active while reading the response body", async () => {
    vi.useFakeTimers();
    const f = vi.fn(async (_url, init: RequestInit) => ({ status: 200, text: () => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))) }));
    const pending = zonataRequest(TEST, "GET", "/me", undefined, { fetch: f as never });
    await vi.advanceTimersByTimeAsync(30000);
    expect(await pending).toMatchObject({ ok: false, kind: "timeout" });
  });
});

describe("mesajele de eroare ZonaTa", () => {
  const cases: Array<[number, string, RegExp]> = [
    [401, "unauthorized", /nu este validă sau a fost revocată/],
    [402, "package_required", /Enterprise.*650 lei \/ 30 de zile.*zt_test_/],
    [403, "email_unverified", /Emailul contului ZonaTa/],
    [404, "not_found", /nu există în contul ZonaTa/],
  ];
  for (const [status, error, re] of cases) {
    it(`${status} ${error}`, async () => {
      const f = vi.fn(async () => json(status, { error }));
      const r = await getZonataAccount(LIVE, { fetch: f as never, sleep: noSleep });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(re);
      expect(f).toHaveBeenCalledTimes(1);
    });
  }
  it("422 listează câmpurile din details", async () => {
    const f = vi.fn(async () =>
      json(422, { error: "validation_error", details: [{ field: "title", message: "prea scurt" }, { field: "price", message: "obligatoriu" }] }),
    );
    const r = await getZonataAccount(TEST, { fetch: f as never, sleep: noSleep });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("validation");
      expect(r.message).toContain("title: prea scurt; price: obligatoriu");
    }
  });
  it("trimite Bearer, fără cheia în mesaj", async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${LIVE}`);
      return json(401, { error: "unauthorized" });
    });
    const r = await getZonataAccount(LIVE, { fetch: f as never, sleep: noSleep });
    if (!r.ok) expect(r.message).not.toContain(LIVE);
    expect(f.mock.calls[0]![0]).toBe("https://zonata.ro/api/v1/me");
  });
});

describe("429 și limitatorul", () => {
  it("o pauză și o singură reîncercare, apoi succes", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(429, { error: "rate_limited" }, { "Retry-After": "3" }))
      .mockResolvedValueOnce(json(200, { account: { name: "Agenția X" } }));
    const r = await getZonataAccount(LIVE, { fetch: f as never, sleep: noSleep });
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    expect(noSleep).toHaveBeenCalledWith(3000);
  });
  it("429 repetat → eroare după exact două cereri", async () => {
    const f = vi.fn(async () => json(429, { error: "rate_limited" }));
    const r = await getZonataAccount(LIVE, { fetch: f as never, sleep: noSleep });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/300 la 10 minute/);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("limitatorul oprește local sub 300 de cereri la 10 minute", async () => {
    expect(ZONATA_WINDOW_LIMIT).toBeLessThan(300);
    const now = 1_000_000;
    const f = vi.fn(async () => json(200, {}));
    for (let i = 0; i < ZONATA_WINDOW_LIMIT; i += 1) {
      await getZonataAccount(LIVE, { fetch: f as never, sleep: noSleep, now: () => now });
    }
    expect(zonataLimiterWaitMs(LIVE, now)).toBeGreaterThan(0);
    const r = await getZonataAccount(LIVE, { fetch: f as never, sleep: noSleep, now: () => now });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("rate_limited");
    expect(f).toHaveBeenCalledTimes(ZONATA_WINDOW_LIMIT);
    // Altă cheie nu e afectată.
    expect(zonataLimiterWaitMs(TEST, now)).toBe(0);
  });
});

describe("Testează conexiunea", () => {
  it("afișează contul, pachetul, modul și limitele", async () => {
    const f = vi.fn(async () =>
      json(200, { account: { name: "Agenția X" }, package: { name: "Enterprise" }, mode: "test", limits: { requests_per_10_min: 300 } }),
    );
    const adapter = createZonataAdapter({ fetch: f as never, sleep: noSleep });
    const r = await adapter.testConnection({ portalCredential: TEST, allowLiveRequests: false } as never);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.detail).toBe("Cont ZonaTa: Agenția X · pachet: Enterprise · mod cheie: Test · limite: requests_per_10_min: 300");
  });
  it("402 explică pachetul Enterprise", async () => {
    const f = vi.fn(async () => json(402, { error: "package_required" }));
    const adapter = createZonataAdapter({ fetch: f as never, sleep: noSleep });
    const r = await adapter.testConnection({ portalCredential: LIVE, allowLiveRequests: true } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Enterprise/);
  });
  it("cheie greșită → nicio cerere", async () => {
    const f = vi.fn();
    const adapter = createZonataAdapter({ fetch: f as never });
    const r = await adapter.testConnection({ portalCredential: "abc", allowLiveRequests: true } as never);
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("describe folosește modul cheii când /me nu îl întoarce", () => {
    expect(describeZonataAccount({ name: "Y" }, "live")).toContain("mod cheie: Live");
  });
});
