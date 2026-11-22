import { describe, expect, it } from "vitest";
import { checkListing, type ListingCheckInput } from "./rules";
import { runListingChecks } from "./check.server";
import { validatePortalRequirements, type PortalRequirementSubject } from "@/lib/portals/requirements";

const good = {
  id: "11111111-1111-1111-1111-111111111111", organization_id: "org1", assigned_to: "agent1",
  status: "active", publish_status: "published", property_type: "apartment", for_sale: true, for_rent: false,
  sale_price: 100000, sale_currency: "EUR", usable_surface: 60, built_surface: 70, rooms: 2, bathrooms: 1,
  floor: 2, building_floors: 4, build_year: 2010, layout: "Decomandat", heating_systems: ["Centrală proprie"],
  lat: 44.4, lng: 26.1, location_precise: true, district: "Titan", city: "București",
  title: "Apartament 2 camere decomandat Titan", description: "Apartament luminos, ".repeat(20), reference: "HB-1",
};
const imgs = (n: number) => Array.from({ length: n }, (_, i) => ({ isPrimary: i === 0, isConfidential: false, includeInPublish: true, storagePath: `p/${i}.jpg`, sourceUrl: null, url: null }));
const base = (over: Record<string, unknown> = {}, rest: Partial<ListingCheckInput> = {}): ListingCheckInput => ({
  property: { ...good, ...over }, images: imgs(8), publications: [], portalReports: [], zoneMedianPerSqm: null, duplicateDescription: false, ...rest,
});
const codes = (i: ListingCheckInput) => checkListing(i).issues.map((x) => `${x.severity}:${x.code}`);

describe("verificarea anunțului", () => {
  it("anunț complet: nota 100, fără probleme", () => {
    expect(checkListing(base())).toEqual({ score: 100, issues: [] });
  });
  it("activ dar nepublicat cu portal bifat → Obligatoriu", () => {
    const r = checkListing(base({ publish_status: "draft" }, { publications: [{ portal: "storia", portalName: "Storia", enabled: true, lastError: null }] }));
    expect(r.issues[0]).toMatchObject({ severity: "required", message: "Anunțul nu e publicat; portalurile bifate nu îl vor prelua", tab: "publishing" });
    expect(codes(base({ publish_status: "draft" }))).not.toContain("required:unpublished_with_portals");
  });
  it("erorile de publicare existente apar", () => {
    expect(codes(base({}, { publications: [{ portal: "storia", portalName: "Storia", enabled: true, lastError: "Taxonomie invalidă" }] }))).toContain("required:portal_error:storia");
  });
  it("câmpuri lipsă după tip", () => {
    const c = codes(base({ usable_surface: null, built_surface: null, floor: null, building_floors: null, build_year: null, layout: null, heating_systems: [], rooms: null, bathrooms: null, lat: null, lng: null, district: null }));
    for (const k of ["required:missing_usable_surface", "recommended:missing_built_surface", "required:missing_floor", "recommended:missing_building_floors", "recommended:missing_build_year", "recommended:missing_layout", "recommended:missing_heating", "required:missing_rooms", "recommended:missing_bathrooms", "required:missing_coords", "recommended:missing_zone"]) expect(c).toContain(k);
    expect(codes(base({ location_precise: false }))).toContain("optional:imprecise_location");
    const land = codes(base({ property_type: "land", land_surface: null, usable_surface: null, rooms: null, floor: null }));
    expect(land).toContain("required:missing_land_surface");
    expect(land).not.toContain("required:missing_rooms");
    expect(land).not.toContain("required:missing_floor");
  });
  it("coerență", () => {
    expect(codes(base({ built_surface: 50 }))).toContain("required:built_lt_usable");
    expect(codes(base({ floor: 6 }))).toContain("required:floor_gt_floors");
    expect(codes(base({ rooms: 9 }))).toContain("recommended:rooms_vs_surface");
    expect(codes(base({ sale_price: null }))).toContain("required:sale_without_price");
    expect(codes(base({ for_rent: true, rent_price: null }))).toContain("required:rent_without_price");
    expect(codes(base({}, { zoneMedianPerSqm: 500 }))).toContain("recommended:price_vs_zone");
    expect(codes(base({}, { zoneMedianPerSqm: 1600 }))).not.toContain("recommended:price_vs_zone");
    expect(codes(base())).not.toContain("recommended:price_vs_zone");
  });
  it("titlu", () => {
    expect(codes(base({ title: "Apartament" }))).toContain("required:title_short");
    expect(codes(base({ title: "A".repeat(71) }))).toContain("recommended:title_long");
    expect(codes(base({ title: "APARTAMENT SUPERB TITAN 2 CAMERE" }))).toContain("recommended:title_caps");
    expect(codes(base({ title: "Apartament 2 camere Titan!!!" }))).toContain("recommended:title_marks");
  });
  it("descriere", () => {
    expect(codes(base({ description: "Scurt" }))).toContain("recommended:description_short");
    const d = good.description;
    expect(codes(base({ description: `${d} Sunați la 0722 123 456` }))).toContain("recommended:description_phone");
    expect(codes(base({ description: `${d} scrieți la a@b.ro` }))).toContain("recommended:description_email");
    expect(codes(base({ description: `${d} vezi www.exemplu.ro` }))).toContain("recommended:description_link");
    expect(codes(base({ description: d.toUpperCase() }))).toContain("recommended:description_caps");
    expect(codes(base({}, { duplicateDescription: true }))).toContain("recommended:description_duplicate");
  });
  it("poze", () => {
    expect(codes(base({}, { images: [] }))).toContain("required:photos_none");
    expect(codes(base({}, { images: imgs(3) }))).toContain("recommended:photos_few");
    expect(codes(base({}, { images: imgs(6).map((i) => ({ ...i, isPrimary: false })) }))).toContain("recommended:photos_no_primary");
    expect(codes(base({}, { images: imgs(6).map((i, k) => ({ ...i, isConfidential: k === 1 })) }))).toContain("optional:photos_hidden");
    expect(codes(base({}, { images: imgs(6).map((i, k) => ({ ...i, includeInPublish: k !== 2 })) }))).toContain("optional:photos_hidden");
    expect(codes(base({}, { images: [...imgs(6), { ...imgs(1)[0]!, isPrimary: false }] }))).toContain("recommended:photos_duplicate");
    const src = imgs(6).map((i, k) => ({ ...i, sourceUrl: k < 2 ? "https://x/a.jpg" : `https://x/${k}.jpg` }));
    expect(codes(base({}, { images: src }))).toContain("recommended:photos_duplicate");
  });
  it("dotări menționate dar nebifate", () => {
    const d = `${good.description} Are balcon, loc de parcare, lift și este mobilat complet.`;
    const c = codes(base({ description: d, heating_systems: ["Termoficare"] }));
    for (const k of ["feature_balcony", "feature_parking", "feature_elevator", "feature_furnished"]) expect(c).toContain(`optional:${k}`);
    expect(c).not.toContain("optional:feature_heating");
    const ok = codes(base({ description: `${d} centrală`, balcony: true, parking: "Loc de parcare", building_amenities: ["Lift"], furnishing: "Complet" }));
    expect(ok.filter((x) => x.includes("feature_"))).toEqual([]);
    expect(codes(base({ description: `${good.description} Apartament nemobilat.` }))).not.toContain("optional:feature_furnished");
  });
  it("cerințele portalurilor vin din validatorii existenți (HomePitch)", () => {
    const subject = { title: good.title, description: good.description, propertyType: "apartment", forSale: true, forRent: false, price: 100000, currency: "RON", city: "București", county: "București", address: null, lat: null, lng: null, imageCount: 8, rooms: 2, bedrooms: 1, bathrooms: 1, buildYear: 2010, usableSurface: 60, landSurface: null, builtSurface: 70, layout: "Decomandat", heatingSystems: [], floor: 2, floorLabel: null, agentName: "A", agentEmail: null, contactPhone: "0722123456" } as PortalRequirementSubject;
    const rep = validatePortalRequirements("homepitch", subject);
    expect(rep.ok).toBe(false);
    const r = checkListing(base({}, { portalReports: [{ portal: "homepitch", portalName: "HomePitch", missing: rep.missing }] }));
    const msgs = r.issues.filter((i) => i.code.startsWith("portal_req:homepitch")).map((i) => i.message).join("|");
    expect(msgs).toMatch(/HomePitch/);
    expect(r.issues.filter((i) => i.code.startsWith("portal_req:homepitch")).length).toBe(rep.missing.length);
    expect(r.issues.every((i) => i.severity === "required")).toBe(true);
  });
  it("nota scade după gravitate", () => {
    expect(checkListing(base({ title: "Scurt" })).score).toBe(85);
  });
});

function fakeDb(opts: { admin: boolean; properties: any[] }) {
  const writes: string[] = [];
  const make = (table: string) => {
    const filters: [string, string, unknown][] = [];
    const b: any = {
      select: () => b, order: () => b, limit: () => b, neq: (c: string, v: unknown) => (filters.push(["neq", c, v]), b), not: () => b,
      is: () => b, eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), b), in: (c: string, v: unknown) => (filters.push(["in", c, v]), b),
      insert: () => { writes.push(`insert:${table}`); return b; }, update: () => { writes.push(`update:${table}`); return b; },
      upsert: () => { writes.push(`upsert:${table}`); return b; }, delete: () => { writes.push(`delete:${table}`); return b; },
      then: (res: (v: unknown) => void) => {
        let data: any[] = [];
        if (table === "properties") data = opts.properties.filter((p) => filters.every(([op, c, v]) => op === "in" ? (v as unknown[]).includes(p[c]) : op === "eq" ? p[c] === v : op === "neq" ? p[c] !== v : true));
        return Promise.resolve({ data, error: null }).then(res);
      },
    };
    return b;
  };
  return { writes, db: { from: make, rpc: (name: string) => { writes.length; return Promise.resolve({ data: name === "is_org_admin" ? opts.admin : false, error: null }); } } as any };
}

describe("verificarea pe server", () => {
  const other = { ...good, id: "22222222-2222-2222-2222-222222222222", assigned_to: "agent2" };
  const deps = { requirementReports: async () => new Map(), orgReader: async () => undefined as any };
  it("agentul nu poate verifica anunțul altcuiva", async () => {
    const { db } = fakeDb({ admin: false, properties: [good, other] });
    await expect(runListingChecks(db, "agent1", [other.id], { ...deps, orgReader: async () => db })).rejects.toThrow(/acces/);
    const ok = await runListingChecks(db, "agent1", [good.id], { ...deps, orgReader: async () => db });
    expect(ok.map((r) => r.propertyId)).toEqual([good.id]);
  });
  it("administratorul verifică mai multe anunțuri și nu se modifică nimic", async () => {
    const { db, writes } = fakeDb({ admin: true, properties: [good, other] });
    const rows = await runListingChecks(db, "admin", [other.id, good.id], { ...deps, orgReader: async () => db });
    expect(rows.map((r) => r.propertyId)).toEqual([other.id, good.id]);
    expect(rows.every((r) => typeof r.score === "number")).toBe(true);
    expect(writes).toEqual([]);
  });
  it("descrierea identică cu alt anunț din agenție e detectată", async () => {
    const { db } = fakeDb({ admin: true, properties: [good, other] });
    const [r] = await runListingChecks(db, "admin", [good.id], { ...deps, orgReader: async () => db });
    expect(r!.issues.map((i) => i.code)).toContain("description_duplicate");
  });
});
