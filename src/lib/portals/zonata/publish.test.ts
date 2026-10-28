import { beforeEach, describe, expect, it } from "vitest";
import { createZonataAdapter } from "../adapters/zonata.server";
import { resetZonataClientState } from "./client";
import { readZonataListing, ZONATA_PORTAL_STATUS, ZONATA_STATUS_LABEL, zonataStatusCheckDue, aggregateZonataStatus } from "./publish";
import { getPortalDefinition } from "../registry";
import { isManualWithdrawPortal } from "../status-withdraw.server";
import type { ZonataListingBody } from "./mapper";
import type { ZonataStoredListing } from "./load.server";
import type { PortalContext } from "../adapter";

const LIVE = `zt_live_${"a".repeat(32)}`;
const TEST = `zt_test_${"b".repeat(32)}`;
const body = (id: string): ZonataListingBody => ({
  external_id: id, title: "Apartament 2 camere Militari", description: "x".repeat(60), category: "imobiliare",
  subcategory: id.endsWith("-i") ? "apartamente-de-inchiriat" : "apartamente-de-vanzare",
  price_type: "fixed", price: 100000, currency: "EUR", address: "Militari, București", fields: { numar_de_camere: "2" }, images: ["https://crm.habitoo.ro/m/1"],
});
const ctx = (key: string): PortalContext => ({
  organizationId: "org", definition: getPortalDefinition("zonata")!, direction: "habitoo_to_portal",
  authenticationMode: "portal_api_key", externalAccountId: null, portalCredential: key, settings: {}, allowLiveRequests: true,
});
type Call = { method: string; url: string; body: any };
function harness(responses: Array<[number, unknown]>, opts: { bodies?: ZonataListingBody[]; stored?: ZonataStoredListing[] } = {}) {
  const calls: Call[] = [];
  const saved: any[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ method: String(init.method), url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const [status, json] = responses.shift() ?? [200, {}];
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof globalThis.fetch;
  const adapter = createZonataAdapter({
    fetch, sleep: async () => {},
    build: async () => ({ ok: true, bodies: opts.bodies ?? [body("HB-1-v")], warnings: [] }),
    loadStored: async () => opts.stored ?? [],
    save: async (_i, rows) => { saved.push(...rows); },
  });
  return { adapter, calls, saved };
}
const ref = { propertyId: "p1", externalId: null };
const stored = (id: string, status: any): ZonataStoredListing => ({ external_id: id, transaction: id.endsWith("-i") ? "rent" : "sale", status, url: null, expires_at: null, rejected_reason: null, last_checked_at: null });

beforeEach(() => resetZonataClientState());

describe("ZonaTa publicare", () => {
  it("publicarea și actualizarea trimit POST /listings cu același corp și external_id", async () => {
    const h = harness([[201, { data: { id: 9, status: "in_review" } }], [200, { data: { id: 9, status: "active", url: "https://zonata.ro/anunt/9", expires_at: "2026-11-27T00:00:00Z" } }]]);
    const pub = await h.adapter.publishListing(ctx(LIVE), ref);
    const upd = await h.adapter.updateListing(ctx(LIVE), ref);
    expect(h.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST https://zonata.ro/api/v1/listings", "POST https://zonata.ro/api/v1/listings"]);
    expect(h.calls[0].body).toEqual(body("HB-1-v"));
    expect(h.calls[1].body.external_id).toBe("HB-1-v");
    expect(pub.ok && pub.data.portalStatus).toBe("pending");
    expect(upd.ok && upd.data).toMatchObject({ portalStatus: "published", publicUrl: "https://zonata.ro/anunt/9", externalId: "HB-1-v" });
  });
  it("ambele tranzacții → două anunțuri -v / -i", async () => {
    const h = harness([[201, { status: "in_review" }], [201, { status: "in_review" }]], { bodies: [body("HB-1-v"), body("HB-1-i")] });
    const r = await h.adapter.publishListing(ctx(LIVE), ref);
    expect(h.calls.map((c) => c.body.external_id)).toEqual(["HB-1-v", "HB-1-i"]);
    expect(r.ok && r.data.externalId).toBe("HB-1-v,HB-1-i");
    expect(h.saved.map((s) => s.transaction)).toEqual(["sale", "rent"]);
  });
  it("cheia de test: validat, dar nemarcat publicat și fără cod extern", async () => {
    const h = harness([[200, { status: "test" }]]);
    const r = await h.adapter.publishListing(ctx(TEST), ref);
    expect(r.ok && r.data).toMatchObject({ portalStatus: "withdrawn", externalId: null, live: false, message: "Validat în mod test – nimic publicat pe ZonaTa" });
    expect(h.saved[0].state.status).toBe("test");
  });
  it("republicarea după retragere: PATCH status active, apoi POST complet", async () => {
    const h = harness([[200, {}], [200, { status: "in_review" }]], { stored: [stored("HB-1-v", "withdrawn")] });
    await h.adapter.publishListing(ctx(LIVE), ref);
    expect(h.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "PATCH https://zonata.ro/api/v1/listings/ext%3AHB-1-v".replace("ext%3A", "ext:"),
      "POST https://zonata.ro/api/v1/listings",
    ]);
    expect(h.calls[0].body).toEqual({ status: "active" });
    expect(h.calls[1].body).toEqual(body("HB-1-v"));
  });
  it("retragerea: DELETE fără permanent, pentru anunțurile active", async () => {
    const h = harness([[200, {}]], { stored: [stored("HB-1-v", "active"), stored("HB-1-i", "withdrawn")] });
    const r = await h.adapter.withdrawListing(ctx(LIVE), ref);
    expect(h.calls).toEqual([{ method: "DELETE", url: "https://zonata.ro/api/v1/listings/ext:HB-1-v", body: undefined }]);
    expect(r.ok && r.data.portalStatus).toBe("withdrawn");
  });
  it("retragerea automată la Vândut folosește API-ul ZonaTa (nu manual)", () => {
    expect(getPortalDefinition("zonata")!.capabilities).toContain("withdraw_listing");
    expect(isManualWithdrawPortal("zonata")).toBe(false);
  });
  it("402 → „Necesită pachet ZonaTa” cu explicația Enterprise", async () => {
    const h = harness([[402, { error: "package_required" }]]);
    const r = await h.adapter.publishListing(ctx(LIVE), ref);
    expect(r.ok && r.data.portalStatus).toBe("needs_packet");
    expect(r.ok && r.data.message).toMatch(/Enterprise.*650 lei \/ 30 de zile, plătit de agenție/);
  });
  it("422 → câmpurile din details", async () => {
    const h = harness([[422, { error: "validation_error", details: { title: ["prea scurt"], images: "cel puțin o imagine" } }]]);
    const r = await h.adapter.publishListing(ctx(LIVE), ref);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("VALIDATION_ERROR");
      expect(r.message).toContain("title: prea scurt");
      expect(r.message).toContain("images: cel puțin o imagine");
    }
  });
});

describe("ZonaTa status", () => {
  it("maparea statusurilor", () => {
    expect(ZONATA_STATUS_LABEL).toMatchObject({ in_review: "În verificare", active: "Publicat", rejected: "Respins", withdrawn: "Retras", sold: "Vândut", expired: "Expirat" });
    expect(ZONATA_PORTAL_STATUS).toMatchObject({ in_review: "pending", active: "published", rejected: "error", withdrawn: "withdrawn", sold: "withdrawn", expired: "withdrawn", test: "withdrawn" });
    const st = readZonataListing({ data: { status: "rejected", rejected_reason: "Poze neclare" } });
    expect(st).toMatchObject({ status: "rejected", rejectedReason: "Poze neclare" });
    expect(readZonataListing({ data: { status: "active", url: "https://evil.example/x" } }).url).toBeNull();
    expect(aggregateZonataStatus(["active", "in_review"])).toBe("in_review");
  });
  it("verificare cel mult o dată pe minut", () => {
    const now = Date.parse("2026-10-28T12:00:00Z");
    expect(zonataStatusCheckDue("2026-10-28T11:59:30Z", now)).toBe(false);
    expect(zonataStatusCheckDue("2026-10-28T11:58:59Z", now)).toBe(true);
    expect(zonataStatusCheckDue(null, now)).toBe(true);
  });
});
