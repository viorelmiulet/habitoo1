import { describe, expect, it } from "vitest";
import { clearDeselectedPortalError, deselectedErrorHidden, type CleanupDb } from "./deselect-cleanup";
import { deriveState, matchesPortalFilter } from "./portal-state";

function fakeDb() {
  const calls: { table: string; op: string; patch?: unknown; filters: [string, string, unknown][] }[] = [];
  const db: CleanupDb = {
    from(table) {
      const call = { table, op: "", patch: undefined as unknown, filters: [] as [string, string, unknown][] };
      calls.push(call);
      const q: any = {
        update(patch: unknown) { call.op = "update"; call.patch = patch; return q; },
        delete() { call.op = "delete"; return q; },
        eq(c: string, v: unknown) { call.filters.push(["eq", c, v]); return q; },
        in(c: string, v: unknown) { call.filters.push(["in", c, v]); return q; },
        then(res: (v: { error: null }) => unknown) { return Promise.resolve({ error: null }).then(res); },
      };
      return q;
    },
  };
  return { db, calls };
}

describe("debifare cu eroare", () => {
  it("șterge eroarea din publicări și listări, status disabled/withdrawn", async () => {
    const { db, calls } = fakeDb();
    await clearDeselectedPortalError(db, { organizationId: "o", propertyId: "p", portalId: "imobiliare_ro" });
    const pub = calls.find((c) => c.table === "portal_publications")!;
    expect(pub.patch).toEqual({ last_error: null, status: "disabled" });
    expect(pub.filters).toContainEqual(["eq", "enabled", false]);
    const listings = calls.filter((c) => c.table === "portal_listings");
    expect(listings.map((c) => c.patch)).toEqual([{ last_error: null }, { status: "withdrawn" }]);
    expect(listings[1].filters).toContainEqual(["in", "status", ["error", "pending"]]);
    expect(listings[0].filters).toContainEqual(["eq", "portal", "imobiliare_ro"]);
  });

  it("imo24: șterge și pozele programate pentru retrimitere", async () => {
    const { db, calls } = fakeDb();
    await clearDeselectedPortalError(db, { organizationId: "o", propertyId: "p", portalId: "imo24" });
    expect(calls.some((c) => c.table === "imo24_image_retries" && c.op === "delete")).toBe(true);
  });
});

describe("cardul portalului debifat", () => {
  it("nu arată eroarea veche de publicare", () => {
    expect(deselectedErrorHidden({ selected: false, checked: false, lastError: "Oferta nu este publicabilă", externalId: null })).toBe(true);
  });
  it("retragerea eșuată cu anunț online păstrează eroarea", () => {
    expect(deselectedErrorHidden({ selected: false, checked: false, lastError: "Portalul a refuzat retragerea", externalId: "X1" })).toBe(false);
  });
  it("portalul bifat arată eroarea", () => {
    expect(deselectedErrorHidden({ selected: true, checked: true, lastError: "err", externalId: null })).toBe(false);
  });
});

describe("filtrul „Cu erori”", () => {
  it("după curățare, portalul debifat nu mai e în Cu erori", () => {
    const state = deriveState({ availability: "available", configured: true, selected: false, listingStatus: "withdrawn", publicationStatus: "disabled", pushSupported: true, feedEligible: true });
    expect(matchesPortalFilter([{ portalId: "imospot", state }], { portal: "imospot", state: "error" })).toBe(false);
    expect(matchesPortalFilter([{ portalId: "imospot", state }], { portal: "any", state: "error" })).toBe(false);
  });
});
