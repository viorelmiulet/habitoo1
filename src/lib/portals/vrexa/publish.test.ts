import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVrexaAdapter } from "../adapters/vrexa.server";
import { clearVrexaTokenCache } from "./client";
import { parseVrexaOffers, vrexaImages, type VrexaOffer } from "./publish";
import { pollVrexaStatuses, resetVrexaReadThrottle, vrexaDueOffers, handleVrexaRejections } from "./status.server";
import type { PortalContext } from "../adapter";
import type { VrexaListingData } from "./listing.server";

const SECRET = "secret-xyz-0987654";
const TOKEN = "tok-vrexa-123456";
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const body = (n = 1) => ({ type: "apartment", title: `Apartament ${n} camere`, price: 100000 });
const IMG = vrexaImages(["https://crm.habitoo.ro/api/public/sites/v1/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg"]);

type Call = { method: string; url: string; body: any };
function transport(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const t = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/oauth/token")) return json(200, { access_token: TOKEN });
    const c = { method: String(init.method), url, body: init.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    return handler(c);
  });
  return { t, calls };
}
const ok = (c: Call) => json(200, { externalId: c.url.split("/").pop(), id: 77, status: "pending", url: null });
const ctx = (): PortalContext => ({
  organizationId: "org1", definition: {} as PortalContext["definition"], direction: "habitoo_to_portal" as PortalContext["direction"],
  authenticationMode: "portal_api_key" as PortalContext["authenticationMode"], externalAccountId: "cid", portalCredential: SECRET, settings: {}, allowLiveRequests: true,
});
const data = (over: Partial<VrexaListingData> = {}): VrexaListingData => ({
  mapping: { ok: true, listings: [{ transaction: "sale", body: body() }], warnings: [] }, reference: "HB-1376", stored: [], images: IMG, imageWarnings: [], ...over,
});
const adapter = (t: any, d: VrexaListingData, onRejected: (o: string, p: string, offers: VrexaOffer[]) => Promise<void> = async () => undefined) =>
  createVrexaAdapter({ transport: t, env: () => ({}), load: async () => d, onRejected });
const ref = { propertyId: "p1", externalId: null };
const offersOf = (r: any): VrexaOffer[] => (r.ok ? r.data.offers : []);

beforeEach(() => { clearVrexaTokenCache(); resetVrexaReadThrottle(); });

describe("publicare Vrexa", () => {
  it("vânzare + închiriere → două PUT cu -V și -I", async () => {
    const { t, calls } = transport(ok);
    const d = data({ mapping: { ok: true, listings: [{ transaction: "sale", body: body() }, { transaction: "rent", body: body(2) }], warnings: [] } });
    const r = await adapter(t, d).publishListing(ctx(), ref);
    expect(r.ok).toBe(true);
    expect(calls.map((c) => `${c.method} ${c.url.split("/").pop()}`)).toEqual(["PUT HB-1376-V", "PUT HB-1376-I"]);
    expect(calls[0]!.body.images).toEqual(IMG);
    if (r.ok) { expect(r.data.portalStatus).toBe("pending"); expect(offersOf(r).map((o) => o.vrexa_id)).toEqual(["77", "77"]); }
  });

  it("retrimitere neschimbată → niciun apel; poze neschimbate → fără images", async () => {
    const first = transport(ok);
    const r1 = await adapter(first.t, data()).publishListing(ctx(), ref);
    const stored = offersOf(r1);
    const again = transport(ok);
    await adapter(again.t, data({ stored })).updateListing(ctx(), ref);
    expect(again.calls).toHaveLength(0);
    const changed = transport(ok);
    await adapter(changed.t, data({ stored, mapping: { ok: true, listings: [{ transaction: "sale", body: body(3) }], warnings: [] } })).updateListing(ctx(), ref);
    expect(changed.calls).toHaveLength(1);
    expect(changed.calls[0]!.body).not.toHaveProperty("images");
  });

  it("poze schimbate → URL-uri noi; toate șterse → []", async () => {
    const r1 = await adapter(transport(ok).t, data()).publishListing(ctx(), ref);
    const stored = offersOf(r1);
    const newImg = vrexaImages(["https://crm.habitoo.ro/api/public/sites/v1/media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg"]);
    const a = transport(ok);
    await adapter(a.t, data({ stored, images: newImg })).updateListing(ctx(), ref);
    expect(a.calls[0]!.body.images).toEqual(newImg);
    expect(newImg[0]).not.toEqual(IMG[0]);
    const b = transport(ok);
    await adapter(b.t, data({ stored, images: [] })).updateListing(ctx(), ref);
    expect(b.calls[0]!.body.images).toEqual([]);
  });

  it("type_mismatch → DELETE apoi PUT, o singură dată", async () => {
    let n = 0;
    const { t, calls } = transport((c) => c.method === "DELETE" ? new Response(null, { status: 204 }) : ++n === 1 ? json(409, { code: "type_mismatch" }) : ok(c));
    const r = await adapter(t, data()).publishListing(ctx(), ref);
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["PUT", "DELETE", "PUT"]);
  });

  it("retragere: 404 contează ca succes", async () => {
    const stored = offersOf(await adapter(transport(ok).t, data()).publishListing(ctx(), ref));
    const { t, calls } = transport(() => json(404, { code: "not_found" }));
    const r = await adapter(t, data({ stored })).withdrawListing(ctx(), ref);
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["DELETE"]);
    if (r.ok) expect(offersOf(r)[0]!.status).toBe("deleted");
  });

  it("tranzacție renunțată → DELETE pe externalId-ul ei", async () => {
    const d2 = data({ mapping: { ok: true, listings: [{ transaction: "sale", body: body() }, { transaction: "rent", body: body(2) }], warnings: [] } });
    const stored = offersOf(await adapter(transport(ok).t, d2).publishListing(ctx(), ref));
    const { t, calls } = transport(() => new Response(null, { status: 204 }));
    await adapter(t, data({ stored })).updateListing(ctx(), ref);
    expect(calls.map((c) => `${c.method} ${c.url.split("/").pop()}`)).toEqual(["DELETE HB-1376-I"]);
  });

  it("validation_failed afișat pe câmpuri, cu eticheta românească și textul original", async () => {
    const { t } = transport(() => json(400, { code: "validation_failed", errors: { usableArea: ["must be >= 1"], foo: ["bad"] } }));
    const r = await adapter(t, data()).publishListing(ctx(), ref);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe("VALIDATION_ERROR"); expect(r.message).toContain("Suprafață utilă (usableArea): must be >= 1"); expect(r.message).toContain("foo: bad"); }
  });

  it("rejected → eroare + o singură notificare; active → link salvat", async () => {
    const onRejected = vi.fn(async (_o: string, _p: string, offers: VrexaOffer[]) => {
      const admin = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { title: "T", assigned_to: "u1" } }) }) }) }), upsert: upsert }) };
      await handleVrexaRejections(admin, "org1", "p1", offers);
    });
    const upsert = vi.fn(async () => ({ error: null }));
    const rej = transport(() => json(200, { id: 5, status: "rejected", rejectionReason: "Poze neclare" }));
    const r = await adapter(rej.t, data(), onRejected).publishListing(ctx(), ref);
    expect(r.ok && r.data.portalStatus).toBe("error");
    if (r.ok) expect(r.data.message).toContain("Poze neclare");
    // Aceeași respingere citită din nou → nicio notificare nouă.
    await handleVrexaRejections({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { title: "T", assigned_to: "u1" } }) }) }) }), upsert }) }, "org1", "p1", offersOf(r));
    expect(upsert).toHaveBeenCalledTimes(1);
    const act = transport(() => json(200, { id: 5, status: "active", url: "https://test.vrexa.ro/anunt/5" }));
    const r2 = await adapter(act.t, data()).publishListing(ctx(), ref);
    expect(r2.ok && r2.data.publicUrl).toBe("https://test.vrexa.ro/anunt/5");
    expect(r2.ok && r2.data.portalStatus).toBe("published");
  });

  it("imageImport.failed → avertisment, nu blochează", async () => {
    const { t } = transport(() => json(200, { id: 1, status: "processing", imageImport: { status: "partial", failed: [{ url: "https://x/1.jpg", reason: "too big" }] } }));
    const r = await adapter(t, data()).publishListing(ctx(), ref);
    expect(r.ok && r.data.mediaWarning).toContain("too big");
  });

  it("secretul și token-ul nu apar în rezultate", async () => {
    const { t } = transport(() => json(500, { code: "x", detail: `oops ${TOKEN} ${SECRET}` }));
    const r = await adapter(t, data()).publishListing(ctx(), ref);
    const out = JSON.stringify(r);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain(SECRET);
  });
});

describe("programarea Vrexa", () => {
  const offer = (id: string, status: string, checked_at: string | null, env = "test"): VrexaOffer => ({
    transaction: "sale", reference: id, id, url: "", external_id: id, vrexa_id: null, status, rejection_reason: null, body_hash: null, photos_hash: null, env: env as never, checked_at,
  });
  it("citește doar ofertele în verificare (și active vechi de 24h), cele mai vechi întâi, din mediul curent", () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    const rows = [{ id: "r1", organization_id: "o", property_id: "p", status: "pending", portal_offers: [
      offer("A", "pending", "2026-11-24T11:00:00Z"), offer("B", "processing", "2026-11-24T10:00:00Z"), offer("C", "active", "2026-11-24T11:00:00Z"),
      offer("D", "active", "2026-11-22T11:00:00Z"), offer("E", "rejected", null), offer("F", "pending", null, "production"),
    ] }];
    expect(vrexaDueOffers(rows, "test", now).map((d) => d.externalId)).toEqual(["D", "B", "A"]);
  });
  it("fără oferte de citit → niciun apel", async () => {
    const clientFor = vi.fn();
    const admin = { from: () => ({ select: () => ({ eq: () => ({ neq: async () => ({ data: [] }) }) }) }) };
    expect(await pollVrexaStatuses({ admin, clientFor })).toEqual({ reads: 0, due: 0 });
    expect(clientFor).not.toHaveBeenCalled();
    expect(parseVrexaOffers(null)).toEqual([]);
  });
});
