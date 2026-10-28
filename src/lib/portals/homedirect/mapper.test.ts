import { beforeEach, describe, expect, it } from "vitest";
import { resetHomedirectClientState } from "./client.server";
import { mapPropertyToHomedirect, type HomedirectMapContext } from "./mapper";
import { resolveHomedirectLocation, type HomedirectLocation, type HomedirectLocationStore } from "./locations.server";

const verified: HomedirectLocation = {
  status: "verified",
  county: { id: 10, name: "Bucuresti - Ilfov" },
  city: { id: 100, name: "București" },
  district: { id: 1006, name: "Sector 6" },
  warnings: [],
};
const ctx = (over: Partial<HomedirectMapContext> = {}): HomedirectMapContext => ({
  location: verified, images: ["https://crm.habitoo.ro/api/public/sites/v1/media/a.jpg"], ...over,
});
const apt = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-1111-1111-111111111111", reference: "HB-1", property_type: "apartment",
  for_sale: true, for_rent: false, sale_price: 120000, sale_currency: "EUR",
  title: "Apartament 2 camere Drumul Taberei", description: "<p>Luminos, renovat.</p>",
  usable_surface: 54, rooms: 2, bathrooms: 1, floor: 3, floor_label: "Etaj 3", building_floors: 8,
  layout: "Decomandat", build_year: 1985, building_structure: "Beton", windows: ["PVC"],
  building_amenities: ["Lift"], heating_systems: ["Centrală proprie"], cooling_systems: ["Aer condiționat"],
  furnishing: "Complet", parking_spaces: 1, lat: 44.42, lng: 26.03, location_precise: true,
  commission: null, vat_included: null, ...over,
}) as never;

const ok = (r: ReturnType<typeof mapPropertyToHomedirect>) => {
  if (!r.ok) throw new Error(r.reasons.join(" | "));
  return r;
};

describe("mapPropertyToHomedirect", () => {
  it("apartament vânzare EUR complet", () => {
    const r = ok(mapPropertyToHomedirect(apt(), ctx()));
    expect(r.bodies).toHaveLength(1);
    const b = r.bodies[0]!;
    expect(b.externalPostId).toBe("HB-1-v");
    expect(b.request.postDetail).toEqual({ desc: "Luminos, renovat.", size: 54 });
    expect(b.request.postData).toMatchObject({
      type: "buy", price: 120000, sellerType: "business", hasCommission: true, property: "apartment",
      county: "10", city: "100", district: "1006", bedroom: 2, bathroom: 1, floor: "floor3", totalFloors: "8",
      layout: "separated", constructionYear: "1977-1990", constructionMaterial: "concrete", windowType: "pvc",
      hasElevator: true, hasCentralHeating: true, hasAirConditioning: true, furnishingStatus: "furnished",
      hasParking: true, parkingSpots: 1, latitude: "44.42", longitude: "26.03", externalId: "HB-1-v",
    });
    expect(b.request.postData).not.toHaveProperty("priceIncludesTva");
    expect(b.request.postData).not.toHaveProperty("address");
  });

  it("vânzare + închiriere → două corpuri -v / -i", () => {
    const r = ok(mapPropertyToHomedirect(apt({ for_rent: true, rent_price: 600, rent_currency: "EUR" }), ctx()));
    expect(r.bodies.map((b) => [b.externalPostId, b.request.postData.type, b.request.postData.price]))
      .toEqual([["HB-1-v", "buy", 120000], ["HB-1-i", "rent", 600]]);
  });

  it("RON → conversie BNR, USD → blocare", () => {
    const r = ok(mapPropertyToHomedirect(apt({ sale_price: 497000, sale_currency: "RON" }), ctx({ eurRonRate: 4.97 })));
    expect(r.bodies[0]!.request.postData.price).toBe(100000);
    const usd = mapPropertyToHomedirect(apt({ sale_currency: "USD" }), ctx());
    expect(usd.ok).toBe(false);
    expect(!usd.ok && usd.reasons.join(" ")).toMatch(/USD/);
  });

  it("hasCommission true implicit, false la 0%", () => {
    expect(ok(mapPropertyToHomedirect(apt({ commission: "2%" }), ctx())).bodies[0]!.request.postData.hasCommission).toBe(true);
    expect(ok(mapPropertyToHomedirect(apt({ commission: "0%" }), ctx())).bodies[0]!.request.postData.hasCommission).toBe(false);
    expect(ok(mapPropertyToHomedirect(apt({ commission: "fără comision" }), ctx())).bodies[0]!.request.postData.hasCommission).toBe(false);
  });

  it("TVA doar când e setat explicit", () => {
    expect(ok(mapPropertyToHomedirect(apt({ vat_included: false }), ctx())).bodies[0]!.request.postData.priceIncludesTva).toBe(false);
  });

  it("teren fără subtip → blocare; cu subtip → construction + urban", () => {
    const land = { property_type: "land", land_surface: 500, usable_surface: null };
    const r = mapPropertyToHomedirect(apt({ ...land, category: null }), ctx());
    expect(!r.ok && r.reasons).toContain("Completează tipul terenului (construcții, agricol, pădure sau livadă).");
    const r2 = ok(mapPropertyToHomedirect(apt({ ...land, category: "Construcții intravilan" }), ctx()));
    expect(r2.bodies[0]!.request.postData).toMatchObject({ property: "land", landSubtype: "construction", landClassification: "urban" });
    expect(r2.bodies[0]!.request.postDetail.size).toBe(500);
  });

  it("birou → office + officeSubtype; industrial → industrial", () => {
    expect(ok(mapPropertyToHomedirect(apt({ property_type: "office" }), ctx())).bodies[0]!.request.postData)
      .toMatchObject({ property: "office", officeSubtype: "office" });
    expect(ok(mapPropertyToHomedirect(apt({ property_type: "industrial" }), ctx())).bodies[0]!.request.postData)
      .toMatchObject({ property: "office", officeSubtype: "industrial" });
  });

  it("etaj 0 / 6 / mansardă", () => {
    const f = (o: Record<string, unknown>) => ok(mapPropertyToHomedirect(apt(o), ctx())).bodies[0]!.request.postData.floor;
    expect(f({ floor: 0, floor_label: "Parter" })).toBe("ground");
    expect(f({ floor: 6, floor_label: "Etaj 6" })).toBe("floor6");
    expect(f({ floor: null, floor_label: "Mansardă" })).toBe("attic");
    expect(f({ floor: null, floor_label: "Demisol" })).toBe("basement");
  });

  it("totalFloors mai mic decât etajul → omis", () => {
    const d = ok(mapPropertyToHomedirect(apt({ floor: 6, building_floors: 4 }), ctx())).bodies[0]!.request.postData;
    expect(d).not.toHaveProperty("totalFloors");
    expect(d.floor).toBe("floor6");
  });

  it("fără imagini sau coordonate → blocare", () => {
    const r = mapPropertyToHomedirect(apt({ lat: null, lng: null }), ctx({ images: [] }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reasons).toEqual(expect.arrayContaining([
      "Adaugă cel puțin o poză publicabilă.",
      "Setează poziția pe hartă: HomeDirect cere coordonatele proprietății.",
    ]));
  });

  it("locație neverificată nu blochează previzualizarea", () => {
    const r = ok(mapPropertyToHomedirect(apt(), ctx({
      location: { status: "unverified", reason: "Locație neverificată: x", input: { county: "Bucuresti - Ilfov", city: "București", district: "Sector 6" } },
    })));
    expect(r.locationVerified).toBe(false);
    expect(r.bodies[0]!.request.postData.city).toBe("București");
  });
});

// ------------------------------------------------------------------ locații
const env = { HOMEDIRECT_CRM_API_KEY: "hd_test_key" };
function memStore(): HomedirectLocationStore & { map: Map<string, { payload: unknown; fetched_at: string }> } {
  const map = new Map<string, { payload: unknown; fetched_at: string }>();
  return {
    map,
    async get(k) { return map.get(k) ?? null; },
    async put(k, _kind, payload) { map.set(k, { payload, fetched_at: new Date().toISOString() }); },
  };
}
function fakeFetch(districts: { id: number; name: string }[], opts: { cityMissing?: boolean } = {}) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    const u = new URL(url);
    calls.push(u.pathname.replace(/.*\/locations/, "") + u.search);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (u.pathname.endsWith("/counties")) return json({ success: true, data: [{ id: 10, name: "Bucuresti - Ilfov" }, { id: 11, name: "Cluj" }] });
    if (u.pathname.endsWith("/cities")) return json({ success: true, data: opts.cityMissing ? [{ id: 7, name: "Bucium", region_id: 10 }] : [{ id: 100, name: "Bucuresti", region_id: 10 }] });
    if (u.pathname.endsWith("/districts")) return json({ success: true, data: districts.map((d) => ({ ...d, city_id: 100 })) });
    if (u.pathname.endsWith("/validate")) return json({ success: true, data: {} });
    return json({}, 404);
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const deps = (f: typeof fetch) => ({ env, fetch: f, sleep: async () => {} });

describe("resolveHomedirectLocation", () => {
  beforeEach(() => resetHomedirectClientState());

  it("București cu cartier găsit", async () => {
    const { fn } = fakeFetch([{ id: 501, name: "Drumul Taberei" }, { id: 1006, name: "Sector 6" }]);
    const r = await resolveHomedirectLocation({ county: "București", city: "București", district: "Drumul Taberei" }, memStore(), deps(fn));
    expect(r).toMatchObject({ status: "verified", county: { id: 10 }, city: { id: 100 }, district: { id: 501 }, warnings: [] });
  });

  it("București: doar sectorul se potrivește", async () => {
    const { fn } = fakeFetch([{ id: 1006, name: "Sector 6" }]);
    const r = await resolveHomedirectLocation({ county: "București", city: "Sector 6", district: "Sector 6" }, memStore(), deps(fn));
    expect(r).toMatchObject({ status: "verified", district: { id: 1006, name: "Sector 6" } });
  });

  it("fără potrivire de cartier → fără district + avertisment", async () => {
    const { fn, calls } = fakeFetch([{ id: 1001, name: "Sector 1" }]);
    const r = await resolveHomedirectLocation({ county: "București", city: "București", district: "Militari" }, memStore(), deps(fn));
    expect(r.status).toBe("verified");
    if (r.status !== "verified") return;
    expect(r.district).toBeNull();
    expect(r.warnings[0]).toMatch(/Militari/);
    expect(calls.find((c) => c.startsWith("/validate"))).not.toMatch(/district/);
  });

  it("oraș negăsit → blocare cu sugestii", async () => {
    const { fn } = fakeFetch([], { cityMissing: true });
    const r = await resolveHomedirectLocation({ county: "București", city: "București", district: null }, memStore(), deps(fn));
    expect(r.status).toBe("invalid");
    expect(r.status === "invalid" && r.reasons[0]).toMatch(/Sugestii HomeDirect: Bucium/);
  });

  it("a doua rezolvare folosește cache-ul", async () => {
    const store = memStore();
    const { fn, calls } = fakeFetch([{ id: 501, name: "Drumul Taberei" }]);
    const input = { county: "București", city: "București", district: "Drumul Taberei" };
    await resolveHomedirectLocation(input, store, deps(fn));
    const n = calls.length;
    const again = await resolveHomedirectLocation(input, store, deps(fn));
    expect(calls.length).toBe(n);
    expect(again.status).toBe("verified");
  });

  it("fără cheie CRM → neverificată, fără apeluri", async () => {
    const { fn, calls } = fakeFetch([]);
    const r = await resolveHomedirectLocation({ county: "Cluj", city: "Cluj-Napoca", district: null }, memStore(), { env: {}, fetch: fn });
    expect(r.status).toBe("unverified");
    expect(calls).toHaveLength(0);
  });
});
