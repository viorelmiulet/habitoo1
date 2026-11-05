import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHouseraAdapter } from "./housera.server";
import { createHouseraClient, resetHouseraRateState } from "../housera/client.server";
import type { PortalContext } from "../adapter";
import type { HouseraMapResult } from "../housera/mapper";
import type { PortalOffer } from "../imobiliare/offer-links";

const env = { HOUSERA_CLIENT_ID: "id", HOUSERA_CLIENT_SECRET: "secret", HOUSERA_ENV: "staging" };
const ctx = (live = true): PortalContext => ({
  organizationId: "org", definition: {} as never, direction: "habitoo_to_portal" as never, authenticationMode: "oauth" as never,
  externalAccountId: null, portalCredential: "12|hsr_test_abc", settings: {}, allowLiveRequests: live,
});
const draft = (tx: "sale" | "rent") => ({ transaction: tx, externalRef: `HB-p1-${tx}`, payload: { title: "T", price: 1, type: "apartment", transaction: tx }, errors: [], warnings: [] });
const mapping = (txs: Array<"sale" | "rent">, errors: string[] = []): HouseraMapResult => ({ listings: txs.map(draft), errors, warnings: [] });

type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };
function setup(handler: (c: Call, n: number) => Response, opts: { map?: HouseraMapResult; stored?: PortalOffer[]; photos?: string[] } = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const c = { url, method: String(init.method), headers: init.headers as Record<string, string>, body: init.body as string | undefined };
    calls.push(c);
    return handler(c, calls.length);
  });
  const adapter = createHouseraAdapter({
    env,
    mapping: async () => opts.map ?? mapping(["sale"]),
    photos: async () => ({ urls: opts.photos ?? ["https://crm.habitoo.ro/media/a.jpg"], warnings: [] }),
    stored: async () => opts.stored ?? [],
    client: (key) => createHouseraClient({ key, baseUrl: "https://staging.housera.ro/api/v1/", fetch: fetchMock as never, sleep: async () => {} }),
  });
  return { adapter, calls };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const written = (code: string, status = "pending", etag = `"v1"`) => ({ data: { code, etag, status, url: `https://staging.housera.ro/a/${code}` }, warnings: [] });

beforeEach(() => resetHouseraRateState());

describe("Housera adapter", () => {
  it("creare 201: salvează code/etag/status și stare în moderare", async () => {
    const { adapter, calls } = setup((c) => (c.url.includes("/photos") ? json(202, { queued: 1 }) : json(201, written("ABCD1234"))));
    const r = await adapter.publishListing(ctx(), { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.portalStatus).toBe("pending");
    expect(r.data.offers?.[0]).toMatchObject({ transaction: "sale", reference: "HB-p1-sale", id: "ABCD1234", etag: `"v1"`, status: "pending", url: "https://staging.housera.ro/a/ABCD1234" });
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain("listings/ref/HB-p1-sale");
    expect(calls[0].body).toBe(JSON.stringify({ price: 1, title: "T", transaction: "sale", type: "apartment" }));
    expect(calls[0].headers["If-Match"]).toBeUndefined();
    expect(calls[1].url).toContain("listings/ABCD1234/photos");
  });

  it("corp identic: X-Housera-Unchanged = reușită", async () => {
    const stored: PortalOffer[] = [{ transaction: "sale", reference: "HB-p1-sale", id: "ABCD1234", url: "u", etag: `"v1"` }];
    const { adapter, calls } = setup(() => json(200, written("ABCD1234", "active"), { "X-Housera-Unchanged": "true" }), { stored, photos: [] });
    const r = await adapter.updateListing(ctx(), { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(true);
    expect(calls[0].headers["If-Match"]).toBe(`"v1"`);
    expect(r.ok && r.data.detail).toContain("unchanged=1");
  });

  it("412: recitește etag și retrimite o singură dată", async () => {
    const stored: PortalOffer[] = [{ transaction: "sale", reference: "HB-p1-sale", id: "ABCD1234", url: "u", etag: `"old"`, photos_hash: "x" }];
    const { adapter, calls } = setup((c, n) => {
      if (n === 1) return json(412, { code: "listing_changed_meanwhile" });
      if (c.method === "GET") return json(200, { data: { code: "ABCD1234", etag: `"fresh"` } });
      if (c.url.includes("/photos")) return json(202, { queued: 1 });
      return json(200, written("ABCD1234", "active", `"v3"`));
    }, { stored });
    const r = await adapter.updateListing(ctx(), { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(true);
    const puts = calls.filter((c) => c.method === "PUT" && c.url.includes("/ref/"));
    expect(puts).toHaveLength(2);
    expect(calls[1]).toMatchObject({ method: "GET" });
    expect(calls[1].url).toContain("account/listings/ABCD1234");
    expect(puts[1].headers["If-Match"]).toBe(`"fresh"`);
    expect(r.ok && r.data.offers?.[0].etag).toBe(`"v3"`);
  });

  it("409 duplicate_listing: fără reîncercare, mesaj cu anunțul existent", async () => {
    const { adapter, calls } = setup(() => json(409, { code: "duplicate_listing", existing: { code: "ZZZZ9999", external_ref: null } }));
    const r = await adapter.publishListing(ctx(), { propertyId: "p1", externalId: null });
    expect(calls).toHaveLength(1);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("ZZZZ9999");
  });

  it("vânzare + închiriere: două PUT-uri cu ref-uri diferite", async () => {
    let i = 0;
    const { adapter, calls } = setup((c) => (c.url.includes("/photos") ? json(202, { queued: 1 }) : json(201, written(`CODE000${++i}`))), { map: mapping(["sale", "rent"]) });
    const r = await adapter.publishListing(ctx(), { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(true);
    const puts = calls.filter((c) => c.url.includes("/ref/")).map((c) => c.url.split("/ref/")[1]);
    expect(puts).toEqual(["HB-p1-sale", "HB-p1-rent"]);
    expect(r.ok && r.data.offers?.map((o) => o.reference)).toEqual(["HB-p1-sale", "HB-p1-rent"]);
  });

  it("erori de mapare: zero apeluri", async () => {
    const { adapter, calls } = setup(() => json(201, {}), { map: { listings: [], errors: ["Lipsesc coordonatele."], warnings: [] } });
    const r = await adapter.publishListing(ctx(), { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("Lipsesc coordonatele.");
    expect(calls).toHaveLength(0);
  });

  it("dry-run: nu trimite nimic", async () => {
    const { adapter, calls } = setup(() => json(201, {}));
    const r = await adapter.publishListing(ctx(false), { propertyId: "p1", externalId: null });
    expect(r.ok && r.data.live).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("poze: retrimise doar când lista s-a schimbat", async () => {
    const first = setup((c) => (c.url.includes("/photos") ? json(202, { queued: 1 }) : json(201, written("ABCD1234"))));
    const r1 = await first.adapter.publishListing(ctx(), { propertyId: "p1", externalId: null });
    const saved = r1.ok ? r1.data.offers! : [];
    expect(saved[0].photos_hash).toBeTruthy();
    const same = setup((c) => (c.url.includes("/photos") ? json(202, { queued: 1 }) : json(200, written("ABCD1234", "active"))), { stored: saved });
    await same.adapter.updateListing(ctx(), { propertyId: "p1", externalId: null });
    expect(same.calls.some((c) => c.url.includes("/photos"))).toBe(false);
    const changed = setup((c) => (c.url.includes("/photos") ? json(202, { queued: 2 }) : json(200, written("ABCD1234", "active"))), { stored: saved, photos: ["https://crm.habitoo.ro/media/a.jpg", "https://crm.habitoo.ro/media/b.jpg"] });
    await changed.adapter.updateListing(ctx(), { propertyId: "p1", externalId: null });
    const photoCall = changed.calls.find((c) => c.url.includes("/photos"))!;
    expect(JSON.parse(photoCall.body!)).toEqual({ photos: [{ url: "https://crm.habitoo.ro/media/a.jpg" }, { url: "https://crm.habitoo.ro/media/b.jpg" }] });
  });

  it("retragerea nu este încă suportată", async () => {
    const { adapter } = setup(() => json(200, {}));
    const r = await adapter.withdrawListing(ctx(), { propertyId: "p1", externalId: null });
    expect(!r.ok && r.code).toBe("NOT_SUPPORTED");
    expect(!r.ok && r.message).toBe("Retragerea de pe Housera vine în pasul următor.");
  });
});
