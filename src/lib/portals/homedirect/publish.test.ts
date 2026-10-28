import { beforeEach, describe, expect, it } from "vitest";
import { createHomedirectAdapter, type HomedirectAdapterDeps } from "../adapters/homedirect.server";
import type { PortalContext } from "../adapter";
import { getPortal } from "../registry";
import { resetHomedirectClientState } from "./client.server";
import type { HomedirectBody } from "./mapper";
import { HOMEDIRECT_AGENCY_LINK_HINT, withAccounts, type HomedirectStored } from "./publish";

const ORG = "org-1";
const USER = "user-1";
const env = { HOMEDIRECT_CRM_API_KEY: "hd_crm_secret_key" };
const ctx = { organizationId: ORG, definition: getPortal("homedirect")!, direction: "habitoo_to_portal", authenticationMode: "portal_api_key", externalAccountId: null, portalCredential: null, settings: {}, allowLiveRequests: true } as unknown as PortalContext;
const ref = { propertyId: "prop-1", externalId: null };

const agency = { name: "Agenția Test", email: "office@test.ro", phone: "0700000000" };
const agent = { first_name: "Ion", last_name: "Pop", email: "ion@test.ro", position: "Agent imobiliar" };
const body = (tx: "buy" | "rent"): HomedirectBody => ({
  transaction: tx,
  externalPostId: `HB-1-${tx === "buy" ? "v" : "i"}`,
  request: { postData: { title: "Apartament", price: 100000, sellerType: "business", hasCommission: true, city: "100", county: "10", type: tx, property: "apartment", latitude: "44.4", longitude: "26.1", images: ["https://x/a.jpg"], externalId: `HB-1-${tx === "buy" ? "v" : "i"}` }, postDetail: { desc: "Desc", size: 50 } },
});
const full = (txs: ("buy" | "rent")[]) => txs.map((t) => withAccounts(body(t), { agency, agent, organizationId: ORG, userId: USER }));

type Call = { method: string; path: string; body: any };
function server(handler: (c: Call, n: number) => { status: number; body?: unknown } | "timeout") {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const c = { method: init.method!, path: new URL(url).pathname.replace(/^.*\/v1/, "") + new URL(url).search, body: init.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    const r = handler(c, calls.length);
    if (r === "timeout") { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

function harness(opts: { txs?: ("buy" | "rent")[]; stored?: HomedirectStored[]; property?: { status: string; deleted_at: string | null }; prints?: { agency: string | null; agent: string | null }; agentFp?: string; build?: HomedirectAdapterDeps["build"] }, s: ReturnType<typeof server>) {
  const saved: HomedirectStored[] = [];
  let stored = opts.stored ?? [];
  const adapter = createHomedirectAdapter({
    env, fetch: s.fetch, sleep: async () => {},
    build: opts.build ?? (async () => ({ ok: true, bodies: full(opts.txs ?? ["buy"]), warnings: [], agency: { payload: agency, fingerprint: "A1" }, agent: { userId: USER, payload: agent, fingerprint: opts.agentFp ?? "G1" } })),
    loadStored: async () => stored,
    save: async (_i, st) => { saved.push(...st); stored = [...stored.filter((x) => !st.some((y) => y.external_id === x.external_id)), ...st]; },
    propertyState: async () => opts.property ?? { status: "active", deleted_at: null },
    loadFingerprints: async () => opts.prints ?? { agency: null, agent: null },
    saveFingerprints: async () => {},
  });
  return { adapter, saved };
}
const row = (o: Partial<HomedirectStored>): HomedirectStored => ({ external_id: "HB-1-v", transaction: "sale", homedirect_id: "hd1", short_id: "A7bC9x", slug: "apt-a7bc9x", url: "https://www.homedirect.ro/apt-a7bc9x", status: "active", ...o });

beforeEach(() => resetHomedirectClientState());

describe("HomeDirect publicare", () => {
  it("201 → ID, shortId, slug și link salvate; corp complet cu agency/agent/externalIds", async () => {
    const s = server(() => ({ status: 201, body: { success: true, property: { id: "507f", shortId: "A7bC9x", slug: "apartament-a7bc9x" } } }));
    const { adapter, saved } = harness({}, s);
    const r = await adapter.publishListing(ctx, ref);
    expect(r.ok).toBe(true);
    expect(s.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /properties"]);
    expect(s.calls[0]!.body.externalIds).toEqual({ agency: ORG, agent: USER, post: "HB-1-v" });
    expect(s.calls[0]!.body.agency.email).toBe("office@test.ro");
    expect(s.calls[0]!.body.agent.position).toBe("Agent imobiliar");
    expect(saved[0]).toMatchObject({ homedirect_id: "507f", short_id: "A7bC9x", slug: "apartament-a7bc9x", url: "https://www.homedirect.ro/apartament-a7bc9x", status: "active" });
    expect(r.ok && r.data.publicUrl).toBe("https://www.homedirect.ro/apartament-a7bc9x");
    expect(r.ok && r.data.externalId).toBe("HB-1-v");
  });

  it("fără slug în răspuns → fără link", async () => {
    const s = server(() => ({ status: 201, body: { property: { id: "507f", shortId: "A7bC9x" } } }));
    const { adapter, saved } = harness({}, s);
    const r = await adapter.publishListing(ctx, ref);
    expect(saved[0]!.url).toBeNull();
    expect(r.ok && r.data.publicUrl).toBeUndefined();
  });

  it("200 alreadyExisted → PUT pe ID-ul primit", async () => {
    const s = server((c) => c.method === "POST" ? { status: 200, body: { alreadyExisted: true, property: { id: "old1", shortId: "Old111", slug: "old-old111" } } } : { status: 200, body: { property: { id: "old1" } } });
    const { adapter, saved } = harness({}, s);
    await adapter.publishListing(ctx, ref);
    expect(s.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /properties", "PUT /properties/old1"]);
    expect(saved[0]).toMatchObject({ homedirect_id: "old1", slug: "old-old111" });
  });

  it("409 DUPLICATE_EXTERNAL_ID → PUT pe existing.id", async () => {
    const s = server((c) => c.method === "POST" ? { status: 409, body: { error: "DUPLICATE_EXTERNAL_ID", existing: { id: "dup1", shortId: "Dup111" } } } : { status: 200, body: { success: true } });
    const { adapter } = harness({}, s);
    const r = await adapter.publishListing(ctx, ref);
    expect(r.ok).toBe(true);
    expect(s.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /properties", "PUT /properties/dup1"]);
  });

  it("vânzare + închiriere → două POST", async () => {
    let n = 0;
    const s = server(() => ({ status: 201, body: { property: { id: `id${++n}`, slug: `s-${n}` } } }));
    const { adapter, saved } = harness({ txs: ["buy", "rent"] }, s);
    await adapter.publishListing(ctx, ref);
    expect(s.calls.map((c) => `${c.method} ${c.body.externalIds.post}`)).toEqual(["POST HB-1-v", "POST HB-1-i"]);
    expect(saved.map((x) => [x.external_id, x.transaction])).toEqual([["HB-1-v", "sale"], ["HB-1-i", "rent"]]);
  });

  it("PUT cu 404 → POST (recreare)", async () => {
    const s = server((c) => c.method === "PUT" ? { status: 404, body: { error: "NOT_FOUND" } } : { status: 201, body: { property: { id: "new1", slug: "n-1" } } });
    const { adapter, saved } = harness({ stored: [row({})] }, s);
    await adapter.updateListing(ctx, ref);
    expect(s.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["PUT /properties/hd1", "POST /properties"]);
    expect(saved.at(-1)!.homedirect_id).toBe("new1");
  });

  it("republicare după inactive → PATCH active + PUT", async () => {
    const s = server(() => ({ status: 200, body: { success: true } }));
    const { adapter } = harness({ stored: [row({ status: "inactive" })] }, s);
    await adapter.publishListing(ctx, ref);
    expect(s.calls.map((c) => `${c.method} ${c.path} ${c.body?.status ?? ""}`.trim())).toEqual(["PATCH /properties/hd1/status active", "PUT /properties/hd1"]);
  });

  it("tranzacție dezactivată → inactive pe codul ei", async () => {
    const s = server(() => ({ status: 200, body: {} }));
    const { adapter } = harness({ txs: ["buy"], stored: [row({}), row({ external_id: "HB-1-i", transaction: "rent", homedirect_id: "hd2" })] }, s);
    await adapter.updateListing(ctx, ref);
    expect(s.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["PUT /properties/hd1", "PATCH /properties/hd2/status"]);
    expect(s.calls[1]!.body).toEqual({ status: "inactive" });
  });

  it("agenție fără email → blocare fără apel", async () => {
    const s = server(() => ({ status: 201, body: {} }));
    const { adapter } = harness({ build: async () => ({ ok: false, reasons: ["Completează emailul agenției în Setări."] }) }, s);
    const r = await adapter.publishListing(ctx, ref);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("VALIDATION_ERROR");
    expect(s.calls).toHaveLength(0);
  });

  it("eroare la legarea agenției → mesajul HomeDirect + indicația", async () => {
    const s = server(() => ({ status: 409, body: { error: "AGENCY_EMAIL_EXISTS", details: "Agency email already registered" } }));
    const { adapter } = harness({}, s);
    const r = await adapter.publishListing(ctx, ref);
    expect(!r.ok && r.message).toContain(HOMEDIRECT_AGENCY_LINK_HINT);
  });

  it("timeout la POST → reîncercarea nu creează duplicat", async () => {
    const s = server((c, n) => (n === 1 ? "timeout" : c.method === "POST" ? { status: 200, body: { alreadyExisted: true, property: { id: "p1", slug: "x-1" } } } : { status: 200, body: {} }));
    const { adapter } = harness({}, s);
    const first = await adapter.publishListing(ctx, ref);
    expect(!first.ok && first.code).toBe("TIMEOUT");
    const second = await adapter.publishListing(ctx, ref);
    expect(second.ok).toBe(true);
    expect(s.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /properties", "POST /properties", "PUT /properties/p1"]);
  });
});

describe("HomeDirect agenție / agent", () => {
  it("agent modificat → PUT /agents cu agencyExternalId", async () => {
    const s = server(() => ({ status: 200, body: {} }));
    const { adapter } = harness({ stored: [row({})], prints: { agency: "A1", agent: "OLD" } }, s);
    await adapter.updateListing(ctx, ref);
    expect(s.calls[0]).toMatchObject({ method: "PUT", path: `/agents/${USER}`, body: { agencyExternalId: ORG, agent } });
    expect(s.calls.some((c) => c.path.startsWith("/agencies"))).toBe(false);
  });
  it("nemodificat → fără apel", async () => {
    const s = server(() => ({ status: 200, body: {} }));
    const { adapter } = harness({ stored: [row({})], prints: { agency: "A1", agent: "G1" } }, s);
    await adapter.updateListing(ctx, ref);
    expect(s.calls.map((c) => c.path)).toEqual(["/properties/hd1"]);
  });
});

describe("HomeDirect status și ștergere", () => {
  it("debifare → inactive", async () => {
    const s = server(() => ({ status: 200, body: {} }));
    const { adapter } = harness({ stored: [row({})] }, s);
    await adapter.withdrawListing(ctx, ref);
    expect(s.calls).toEqual([{ method: "PATCH", path: "/properties/hd1/status", body: { status: "inactive" } }]);
  });
  it("vândut → sold pe vânzare, inactive pe închiriere", async () => {
    const s = server(() => ({ status: 200, body: {} }));
    const { adapter } = harness({ property: { status: "sold", deleted_at: null }, stored: [row({}), row({ external_id: "HB-1-i", transaction: "rent", homedirect_id: "hd2" })] }, s);
    await adapter.withdrawListing(ctx, ref);
    expect(s.calls.map((c) => `${c.path} ${c.body.status}`)).toEqual(["/properties/hd1/status sold", "/properties/hd2/status inactive"]);
  });
  it("închiriat → rented pe închiriere", async () => {
    const s = server(() => ({ status: 200, body: {} }));
    const { adapter } = harness({ property: { status: "rented", deleted_at: null }, stored: [row({ external_id: "HB-1-i", transaction: "rent", homedirect_id: "hd2" })] }, s);
    await adapter.withdrawListing(ctx, ref);
    expect(s.calls[0]!.body).toEqual({ status: "rented" });
  });
  it("ștergere → DELETE; 404 la ștergere = succes", async () => {
    const s = server(() => ({ status: 404, body: { error: "NOT_FOUND" } }));
    const { adapter, saved } = harness({ property: { status: "active", deleted_at: "2026-10-28T00:00:00Z" }, stored: [row({})] }, s);
    const r = await adapter.withdrawListing(ctx, ref);
    expect(s.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["DELETE /properties/hd1"]);
    expect(r.ok).toBe(true);
    expect(saved[0]!.status).toBe("deleted");
  });
  it("cheia nu apare în corpurile trimise", async () => {
    const s = server(() => ({ status: 201, body: { property: { id: "1" } } }));
    const { adapter } = harness({}, s);
    await adapter.publishListing(ctx, ref);
    expect(JSON.stringify(s.calls)).not.toContain(env.HOMEDIRECT_CRM_API_KEY);
  });
});
