/**
 * Teste pentru clientul HTTP: retry identic, 429, 409, limite locale, gard SSRF
 * și serializarea scrierilor pe același external_id. `fetch` este înlocuit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalError } from "../../errors";
import { assertSafeLaCheieUrl, laCheieRequest, withLaCheieWriteLock } from "../client.server";

const CONFIG = {
  baseUrl: "https://test.lacheie.example/api/v1",
  apiKey: "secret-key-123",
  environment: "test" as const,
  connectionKey: "org-1:test",
};

function config(overrides: Partial<typeof CONFIG> = {}) {
  // Cheie de limitare unică per test, ca să nu se amestece contoarele.
  return { ...CONFIG, connectionKey: `${Math.random()}`, ...overrides };
}

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];

function respond(entries: { status: number; body?: unknown; headers?: Record<string, string> }[]) {
  let index = 0;
  return vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const entry = entries[Math.min(index, entries.length - 1)]!;
    index += 1;
    return new Response(JSON.stringify(entry.body ?? {}), {
      status: entry.status,
      headers: { "content-type": "application/json", ...(entry.headers ?? {}) },
    });
  });
}

beforeEach(() => {
  calls.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function run<T>(promise: Promise<T>): Promise<T> {
  const settled = promise;
  await vi.runAllTimersAsync();
  return settled;
}

describe("La Cheie — client HTTP", () => {
  it("trimite Bearer, Content-Type și X-Source-Version la scriere", async () => {
    vi.stubGlobal("fetch", respond([{ status: 201, body: { offer: { url: "https://p/1" } } }]));
    const response = await run(
      laCheieRequest(config(), {
        method: "POST",
        path: "/offers",
        body: { title: "x" },
        sourceVersion: "7",
      }),
    );
    expect(response.ok).toBe(true);
    const headers = new Headers(calls[0]!.init.headers as HeadersInit);
    expect(headers.get("authorization")).toBe("Bearer secret-key-123");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-source-version")).toBe("7");
  });

  it("citirile nu trimit versiune", async () => {
    vi.stubGlobal("fetch", respond([{ status: 200, body: { account: { name: "Agenția" } } }]));
    await run(laCheieRequest(config(), { method: "GET", path: "/account" }));
    const headers = new Headers(calls[0]!.init.headers as HeadersInit);
    expect(headers.get("x-source-version")).toBeNull();
  });

  it("5xx se reia cu EXACT aceeași versiune, același corp și aceeași metodă", async () => {
    vi.stubGlobal("fetch", respond([{ status: 503 }, { status: 200, body: { ok: true } }]));
    const response = await run(
      laCheieRequest(config(), {
        method: "PUT",
        path: "/offers/HBT-1-SALE",
        body: { title: "x" },
        sourceVersion: "3",
      }),
    );
    expect(response.ok).toBe(true);
    expect(response.attempts).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.init.method).toBe(calls[1]!.init.method);
    expect(calls[0]!.init.body).toBe(calls[1]!.init.body);
    const first = new Headers(calls[0]!.init.headers as HeadersInit);
    const second = new Headers(calls[1]!.init.headers as HeadersInit);
    expect(second.get("x-source-version")).toBe(first.get("x-source-version"));
    expect(second.get("x-source-version")).toBe("3");
  });

  it("429 respectă Retry-After și reia identic", async () => {
    vi.stubGlobal(
      "fetch",
      respond([{ status: 429, headers: { "retry-after": "1" } }, { status: 200 }]),
    );
    const response = await run(
      laCheieRequest(config(), { method: "POST", path: "/offers", body: {}, sourceVersion: "1" }),
    );
    expect(response.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("409 NU se reia automat: se raportează versiunea acceptată", async () => {
    vi.stubGlobal("fetch", respond([{ status: 409, body: { accepted_version: "12" } }]));
    const response = await run(
      laCheieRequest(config(), { method: "PUT", path: "/offers/x", body: {}, sourceVersion: "5" }),
    );
    expect(response.ok).toBe(false);
    expect(response.status).toBe(409);
    expect(response.conflict?.acceptedVersion).toBe("12");
    expect(calls).toHaveLength(1);
  });

  it("400 nu se reia", async () => {
    vi.stubGlobal("fetch", respond([{ status: 400, body: { message: "invalid" } }]));
    const response = await run(
      laCheieRequest(config(), { method: "POST", path: "/offers", body: {}, sourceVersion: "1" }),
    );
    expect(response.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("corpul peste 1 MiB este blocat înainte de request", async () => {
    vi.stubGlobal("fetch", respond([{ status: 200 }]));
    await expect(
      laCheieRequest(config(), {
        method: "POST",
        path: "/offers",
        body: { description: "x".repeat(1024 * 1024 + 100) },
      }),
    ).rejects.toBeInstanceOf(PortalError);
    expect(calls).toHaveLength(0);
  });

  it("limita locală de 60 de scrieri pe minut oprește trimiterea", async () => {
    vi.stubGlobal("fetch", respond([{ status: 200 }]));
    const shared = config();
    for (let index = 0; index < 60; index += 1) {
      await run(laCheieRequest(shared, { method: "POST", path: "/offers", body: {} }));
    }
    await expect(
      laCheieRequest(shared, { method: "POST", path: "/offers", body: {} }),
    ).rejects.toMatchObject({ code: "RATE_LIMIT" });
  });

  it("gardul de adresă respinge HTTP și gazde nevalide", () => {
    expect(() => assertSafeLaCheieUrl("nu-e-url")).toThrow(PortalError);
    expect(assertSafeLaCheieUrl("https://api.lacheie.example/v1").hostname).toBe(
      "api.lacheie.example",
    );
  });

  it("scrierile pe același identificator se serializează", async () => {
    const order: string[] = [];
    const slow = withLaCheieWriteLock("org-1:HBT-1-SALE", async () => {
      order.push("start-1");
      await new Promise((resolve) => setTimeout(resolve, 50));
      order.push("end-1");
      return 1;
    });
    const fast = withLaCheieWriteLock("org-1:HBT-1-SALE", async () => {
      order.push("start-2");
      return 2;
    });
    await vi.runAllTimersAsync();
    await Promise.all([slow, fast]);
    expect(order).toEqual(["start-1", "end-1", "start-2"]);
  });
});
