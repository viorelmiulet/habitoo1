import { beforeEach, describe, expect, it } from "vitest";
import { createImo24Adapter } from "../adapters/imo24.server";
import type { PortalContext } from "../adapter";
import { resetImo24ClientState } from "./client";
import type { Imo24Anunt } from "./mapper";
import { imo24ImageUrls, resetImo24AgentCache } from "./publish";

const KEY = `i24_${"a".repeat(8)}_${"b".repeat(40)}`;
const ctx = { organizationId: "org", portalCredential: KEY, allowLiveRequests: true, settings: {} } as unknown as PortalContext;
const ref = { propertyId: "p1", externalId: null as string | null, actorId: "u1" };

const body = (tx: "vanzare" | "inchiriere", rooms = 2): Imo24Anunt => ({
  external_id: `HB-1-${tx === "vanzare" ? "v" : "i"}`, tranzactie: tx, categorie: "apartament",
  titlu: "Apartament 2 camere Militari", descriere: "x".repeat(60), pret: 80000, moneda: "EUR",
  negociabil: false, tva: false, comision_zero: false, camere: rooms, etaj: 1,
  locatie: { judet: "București", localitate: "Sector 6", lat: 44.43, lng: 26.02 },
});

type Call = { method: string; path: string; body: any };
function mockFetch(responses: Array<{ status: number; json: unknown }>, calls: Call[]) {
  return (async (url: string, init: RequestInit) => {
    calls.push({ method: String(init.method), path: new URL(url).pathname.replace("/api/v1", ""), body: init.body ? JSON.parse(String(init.body)) : null });
    const r = responses.shift() ?? { status: 500, json: {} };
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "X-RateLimit-Remaining": "500" } });
  }) as unknown as typeof fetch;
}
const agents = { status: 200, json: { ok: true, data: { agenti: [{ email: "ana@ag.ro", activ: true }] } } };
const written = (rezultat: string, extra: Record<string, unknown> = {}) => ({ ok: true, data: { id: 77, url: "https://imo24.ro/anunt/77", stare: "activ", rezultat, avertismente: [], ...extra } });

function adapter(responses: Array<{ status: number; json: unknown }>, calls: Call[], opts: { bodies?: Imo24Anunt[]; retries?: number[] } = {}) {
  const scheduled: number[] = [];
  const a = createImo24Adapter({
    fetch: mockFetch(responses, calls), sleep: async () => {},
    build: async () => ({ ok: true, bodies: opts.bodies ?? [body("vanzare")], warnings: [], images: ["https://crm.habitoo.ro/api/public/sites/v1/media/x.jpg"], agentEmail: "ana@ag.ro" }),
    candidateExternalIds: async () => ["HB-1-v", "HB-1-i"],
    scheduleImageRetry: async () => { const n = (opts.retries ?? [1]).shift() ?? 0; scheduled.push(n); return n; },
    resetImageRetry: async () => {},
  });
  return { a, scheduled };
}

beforeEach(() => { resetImo24ClientState(); resetImo24AgentCache(); });

describe("imo24 publicare", () => {
  it("creare: PUT by-external cu poze și agent, 201 = publicat, link salvat", async () => {
    const calls: Call[] = [];
    const { a } = adapter([agents, { status: 201, json: written("creat") }], calls);
    const res = await a.publishListing(ctx, ref);
    expect(res.ok).toBe(true);
    expect(calls[1]).toMatchObject({ method: "PUT", path: "/anunturi/by-external/HB-1-v" });
    expect(calls[1].body.agent).toBe("ana@ag.ro");
    expect(calls[1].body.imagini).toHaveLength(1);
    if (res.ok) {
      expect(res.data.externalId).toBe("HB-1-v");
      expect(res.data.publicUrl).toBe("https://imo24.ro/anunt/77");
      expect(res.data.portalStatus).toBe("published");
      expect(res.data.message).toContain("publicat");
    }
    expect(calls.some((c) => c.path.includes("credite"))).toBe(false);
  });

  it("agent fără cont imo24 → agent null", async () => {
    const calls: Call[] = [];
    const { a } = adapter([{ status: 200, json: { ok: true, data: { agenti: [] } } }, { status: 201, json: written("creat") }], calls);
    await a.publishListing(ctx, ref);
    expect(calls[1].body.agent).toBeNull();
  });

  it("neschimbat: niciun retry de imagini, mesaj „neschimbat”", async () => {
    const calls: Call[] = [];
    const { a, scheduled } = adapter([agents, { status: 200, json: written("neschimbat") }], calls);
    const res = await a.updateListing(ctx, { ...ref, externalId: "HB-1-v" });
    expect(res.ok && res.data.message).toContain("neschimbat");
    expect(scheduled).toEqual([]);
  });

  it("imagini amânate: reprogramează PUT, apoi raportează limita de 3", async () => {
    const deferred = written("actualizat", { avertismente: [{ code: "imagini_amanate", message: "", camp: "imagini" }, { code: "strada_negasita", message: "", camp: "strada" }] });
    const calls: Call[] = [];
    const { a, scheduled } = adapter([agents, { status: 200, json: deferred }, { status: 200, json: deferred }], calls, { retries: [1, 0] });
    const first = await a.updateListing(ctx, ref);
    expect(first.ok && first.data.message).toContain("încercarea 1 din 3");
    expect(first.ok && first.data.message).toContain("strada");
    const second = await a.updateListing(ctx, ref);
    expect(second.ok && second.data.message).toContain("după 3 retrimiteri");
    expect(scheduled).toEqual([1, 0]);
  });

  it("câmp imutabil: DELETE pe codul vechi, apoi PUT din nou, cu notă", async () => {
    const calls: Call[] = [];
    const { a } = adapter([
      agents,
      { status: 409, json: { ok: false, error: { code: "camp_imutabil", message: "camere" } } },
      { status: 200, json: { ok: true, data: { stare: "inactiv" } } },
      { status: 201, json: written("creat") },
    ], calls, { bodies: [body("vanzare", 3)] });
    const res = await a.updateListing(ctx, { ...ref, externalId: "HB-1-v" });
    expect(calls.slice(1).map((c) => c.method)).toEqual(["PUT", "DELETE", "PUT"]);
    expect(res.ok && res.data.message).toContain("anunțul vechi a fost dezactivat");
  });

  it("limită pachet: eroare clară în română, fără reîncercare", async () => {
    const calls: Call[] = [];
    const { a } = adapter([agents, { status: 403, json: { ok: false, error: { code: "limita_pachet", message: "x" } } }], calls);
    const res = await a.publishListing(ctx, ref);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("nu mai are sloturi libere");
    expect(calls).toHaveLength(2);
  });

  it("anunț duplicat și validare cu câmpuri", async () => {
    const calls: Call[] = [];
    const { a } = adapter([agents, { status: 409, json: { ok: false, error: { code: "anunt_duplicat" } } }], calls);
    const dup = await a.publishListing(ctx, ref);
    expect(!dup.ok && dup.message).toContain("titlu");
    const calls2: Call[] = [];
    resetImo24AgentCache();
    const { a: b } = adapter([agents, { status: 422, json: { ok: false, error: { code: "validare", fields: { titlu: { code: "x", message: "prea scurt" } } } } }], calls2);
    const val = await b.publishListing(ctx, ref);
    expect(!val.ok && val.message).toContain("titlu: prea scurt");
  });

  it("schimbare de tranzacție: codul vechi se dezactivează", async () => {
    const calls: Call[] = [];
    const { a } = adapter([agents, { status: 201, json: written("creat") }, { status: 200, json: { ok: true, data: { stare: "inactiv" } } }], calls, { bodies: [body("inchiriere")] });
    await a.updateListing(ctx, { ...ref, externalId: "HB-1-v" });
    expect(calls[2]).toMatchObject({ method: "DELETE", path: "/anunturi/by-external/HB-1-v" });
  });

  it("retragere la vândut: DELETE pe ambele coduri, 404 acceptat", async () => {
    const calls: Call[] = [];
    const { a } = adapter([{ status: 200, json: { ok: true, data: { stare: "inactiv" } } }, { status: 404, json: { ok: false, error: { code: "anunt_negasit" } } }], calls);
    const res = await a.withdrawListing(ctx, { ...ref, externalId: "HB-1-v" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["DELETE /anunturi/by-external/HB-1-v", "DELETE /anunturi/by-external/HB-1-i"]);
    expect(res.ok && res.data.message).toContain("dezactivat");
  });
});

describe("imo24 imagini", () => {
  it("ordinea Habitoo, PNG omis fără watermark, max 30", () => {
    const imgs = [
      { id: "b", storage_path: "x/b.webp", position: 2, include_in_publish: true },
      { id: "a", storage_path: "x/a.jpg", position: 1, include_in_publish: true, is_primary: true },
      { id: "c", storage_path: "x/c.png", position: 3, include_in_publish: true },
      ...Array.from({ length: 35 }, (_, i) => ({ id: `z${i}`, storage_path: `z${i}.jpg`, position: 10 + i, include_in_publish: true })),
    ];
    const r = imo24ImageUrls(imgs, { baseUrl: "https://crm.habitoo.ro", watermark: false });
    expect(r.urls[0]).toMatch(/media\/a\.jpg$/);
    expect(r.urls[1]).toMatch(/media\/b\.webp$/);
    expect(r.urls.some((u) => u.includes("/c."))).toBe(false);
    expect(r.urls).toHaveLength(30);
    expect(r.warnings.join(" ")).toContain("PNG");
    const wm = imo24ImageUrls([imgs[2]], { baseUrl: "https://crm.habitoo.ro", watermark: true });
    expect(wm.urls[0]).toMatch(/media\/c\.jpg$/);
  });
});
