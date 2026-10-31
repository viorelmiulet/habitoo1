import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPortalDefinition } from "@/lib/portals/registry";
import { getVumsiMe, resetVumsiClientState, vumsiGet, vumsiFailure } from "./client.server";
import { buildVumsiSnapshot, parseVumsiAttributes, parseVumsiCategories } from "./nomenclature";
import { createVumsiAdapter } from "../adapters/vumsi.server";

const KEY = "vumsi_test_key_123456";
const env = { VUMSI_API_KEY: KEY };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const sleep = vi.fn(async () => {});

beforeEach(() => { resetVumsiClientState(); sleep.mockClear(); });

describe("client Vumsi", () => {
  it("trimite cheia în X-Api-Key, doar GET, la URL-ul Orion", async () => {
    const fetch = vi.fn(async () => json(200, { mode: "trial" }));
    const r = await getVumsiMe({ env, fetch: fetch as never, sleep });
    expect(r.ok).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://vumsi.com/api/orion/me/");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe(KEY);
  });

  it("fără cheie nu face nicio cerere", async () => {
    const fetch = vi.fn();
    const r = await getVumsiMe({ env: {}, fetch: fetch as never });
    expect(r.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parsează erorile {status, code, data.errors} fără să expună cheia", async () => {
    const f = vumsiFailure(400, { status: "error", code: 400, data: { errors: { price: ["Obligatoriu."] } } });
    expect(f.kind).toBe("validation");
    expect(f.fieldErrors).toEqual({ price: "Obligatoriu." });
    const fetch = vi.fn(async () => json(401, { status: "error", code: 401, data: { errors: `cheie ${KEY} invalidă` } }));
    const r = await getVumsiMe({ env, fetch: fetch as never, sleep });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("401 și 403 nu se reîncearcă", async () => {
    for (const status of [401, 403]) {
      resetVumsiClientState();
      const fetch = vi.fn(async () => json(status, { status: "error", code: status, data: { errors: "x" } }));
      const r = await getVumsiMe({ env, fetch: fetch as never, sleep });
      expect(r.ok).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("429: o pauză și o singură reîncercare", async () => {
    const fetch = vi.fn(async () => json(429, { status: "error", code: 429, data: { errors: "slow" } }, { "Retry-After": "3" }));
    const r = await getVumsiMe({ env, fetch: fetch as never, sleep });
    expect(r.ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
    const ok = vi.fn().mockResolvedValueOnce(json(429, {})).mockResolvedValueOnce(json(200, { mode: "approved" }));
    resetVumsiClientState();
    expect((await getVumsiMe({ env, fetch: ok as never, sleep })).ok).toBe(true);
  });

  it("păstrează maximum 2 cereri pe secundă", async () => {
    let t = 1_000;
    const waits: number[] = [];
    const fetch = vi.fn(async () => json(200, {}));
    const deps = { env, fetch: fetch as never, now: () => t, sleep: async (ms: number) => { waits.push(ms); t += ms; } };
    await vumsiGet("/reference/", {}, deps);
    await vumsiGet("/reference/", {}, deps);
    await vumsiGet("/reference/", {}, deps);
    expect(waits).toEqual([500, 500]);
  });
});

describe("registry Vumsi", () => {
  it("activare cu aprobare, cheie de partener, capabilitățile cerute, publicare încă oprită", () => {
    const d = getPortalDefinition("vumsi")!;
    expect(d.display_name).toBe("Vumsi.com");
    expect(d.activation).toBe("approval");
    expect(d.authentication).toEqual(["portal_api_key"]);
    expect(d.capabilities).toEqual(["test_connection", "publish_listing", "update_listing", "withdraw_listing", "sync"]);
    expect(d.publish_coming_soon).toBe(true);
    expect(d.notes).toMatch(/promovări plătite/);
  });

  it("adaptorul afișează contul, mode și publish_behaviour; publicarea nu atinge Vumsi", async () => {
    const fetch = vi.fn(async () => json(200, { company_name: "Habitoo", mode: "trial", publish_behaviour: "pending_review" }));
    const a = createVumsiAdapter({ env, fetch: fetch as never, sleep });
    const r = await a.testConnection({} as never);
    expect(r.ok && r.data.detail).toBe("Vumsi conectat: Habitoo · mod: trial · publicare: pending_review");
    const p = await a.publishListing({} as never, { propertyId: "x", externalId: null });
    expect(p.ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("snapshot nomenclatoare Vumsi", () => {
  const cat = (id: number, name: string, leaf = true, path = `Imobiliare > ${name}`) => ({ id, name, name_with_ancestors: path, is_leaf: leaf ? "True" : "False", parent: 1 });

  it("păstrează doar categoriile imobiliare de ultim nivel", () => {
    const list = parseVumsiCategories({ count: 3, results: [cat(10, "Apartamente de vânzare"), cat(2, "Apartamente", false), cat(99, "Apartament păpuși", true, "Jucării > Apartament păpuși")] }, "apartament");
    expect(list.map((c) => c.id)).toEqual([10]);
  });

  it("citește câmpurile, tipul, obligativitatea și valorile permise", () => {
    const f = parseVumsiAttributes({ fields: [{ name: "rooms", label: "Camere", type: "integer", required: true }, { name: "heating", type: "choice", required: false, choices: [["gas", "Gaz"], ["none", "Fără"]] }] });
    expect(f[0]).toEqual({ name: "rooms", label: "Camere", type: "integer", required: true, choices: [] });
    expect(f[1]!.choices).toEqual([{ value: "gas", label: "Gaz" }, { value: "none", label: "Fără" }]);
  });

  it("construiește snapshot-ul cu reference, categorii unice și atributele fiecăreia, doar prin GET", async () => {
    const calls: string[] = [];
    const get = async (path: string, q?: Record<string, string | number>) => {
      calls.push(`${path}${q?.q ? `?q=${q.q}` : ""}`);
      if (path === "/reference/") return { ok: true as const, data: { listing_types: [] } };
      if (path === "/categories/") return { ok: true as const, data: { count: 1, results: q?.q === "apartament" ? [cat(10, "Apartamente de vânzare"), cat(11, "Apartamente de închiriat")] : q?.q === "case" ? [cat(20, "Case de vânzare"), cat(10, "Apartamente de vânzare")] : [] } };
      return { ok: true as const, data: [{ name: "surface", type: "decimal", required: true }] };
    };
    const s = await buildVumsiSnapshot(get);
    expect(s.categories.map((c) => c.id)).toEqual([10, 11, 20]);
    expect(Object.keys(s.attributes)).toEqual(["10", "11", "20"]);
    expect(s.counts).toEqual({ categories: 3, attributes: 3, required: 3 });
    expect(calls).toContain("/categories/10/attributes/");
  });

  it("despachetează răspunsurile reușite { status: ok, data }", async () => {
    const fetch = vi.fn(async () => json(200, { status: "ok", code: 200, data: { mode: "trial" } }));
    const r = await getVumsiMe({ env, fetch: fetch as never, sleep });
    expect(r.ok && r.data.mode).toBe("trial");
  });

  it("o eroare oprește snapshot-ul (nu se salvează parțial)", async () => {
    await expect(buildVumsiSnapshot(async () => ({ ok: false as const, message: "Cheia de partener Vumsi este invalidă sau lipsește." }))).rejects.toThrow(/Referințe/);
  });
});
