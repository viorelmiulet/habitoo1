import { describe, expect, it, vi } from "vitest";
import { mapPropertyToVrexa, VREXA_ALLOWED_KEYS, VREXA_FLOOR_UNSUPPORTED, VREXA_NO_COOLING_REASON, type VrexaMapContext, type VrexaType } from "./mapper";
import { PORTAL_REQUIREMENTS, requirementBlockMessage, type PortalRequirementReport } from "../requirements";
import { createVrexaAdapter } from "../adapters/vrexa.server";
import type { PortalContext } from "../adapter";

const agent = { name: "Ana-Maria Ionescu!", email: "ana@agentie.ro", phone: "0722 123 456" };
const ctx: VrexaMapContext = { agent };
const base = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Apartament luminos cu 2 camere",
  description: "Apartament renovat, aproape de metrou, cu bucătărie separată și balcon închis. Gata de mutare.",
  for_sale: true, sale_price: 120000, sale_currency: "EUR",
  street: "Strada Lalelelor", street_number: "5", district: "Militari", city: "București", county: "București",
  lat: 44.43, lng: 26.02, location_precise: true, commission: "2%",
  utilities: ["Apă", "Gaz", "Curent electric", "Canalizare", "Fibră optică"],
  heating_systems: ["Centrală proprie", "Calorifere"], cooling_systems: ["Aer condiționat"],
  furnishing: "Complet", finish_state: "Renovat", build_year: 1985, bathrooms: 1,
};
const apartment = { ...base, property_type: "apartment", rooms: 2, floor_label: "Etaj 3", floor: 3, building_floors: 8, layout: "Decomandat", comfort: "1", usable_surface: 54, building_type: "Bloc", building_amenities: ["Lift", "Supraveghere video"] };
const house = { ...base, property_type: "house", rooms: 4, category: "Individuală", building_floors: 2, land_surface: 400, usable_surface: 150, has_basement: true, building_amenities: ["Curte", "Grădină"] };
const plot = { ...base, property_type: "land", destination: "Construibil", land_classification: "Intravilan", street_frontage: 20, land_surface: 600, street_arrangement: ["Asfaltate"], views: ["Spre munte"] };
const commercial = { ...base, property_type: "office", floor_label: "Parter", usable_surface: 120 };

function keysOk(type: VrexaType, body: Record<string, unknown>) {
  for (const k of Object.keys(body)) expect(VREXA_ALLOWED_KEYS[type].has(k), k).toBe(true);
}

describe("mapPropertyToVrexa", () => {
  it.each([["apartment", apartment], ["house", house], ["plot", plot], ["commercial", commercial]] as const)("caz valid: %s, fără câmpuri în afara schemei", (type, row) => {
    const r = mapPropertyToVrexa(row as never, ctx);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.listings).toHaveLength(1);
    const body = r.listings[0]!.body;
    expect(body.type).toBe(type);
    expect(body.currency).toBe("eur");
    expect(body.price).toBe(120000);
    keysOk(type, body);
  });

  it("apartament: valori obligatorii mapate", () => {
    const r = mapPropertyToVrexa(apartment as never, ctx);
    if (!r.ok) throw new Error("blocat");
    const b = r.listings[0]!.body;
    expect(b).toMatchObject({ totalRooms: 2, floor: 3, partitioning: "partitioned", comfort: "one", buildingType: "block", heatingType: "ownCentralHeating", heatDistribution: "radiators", airConditioning: "airConditioning", furnishing: "fullyFurnished", refurbishStatus: "refurbished", elevator: true, commonYard: false, totalParkingSpaces: 0, balconies: 0, noCommission: false });
    expect(b.utilities).toEqual(["water", "gas", "electricity", "sewer"]);
    expect(b.buildingServices).toEqual(["videoSurveillance"]);
    expect(b).not.toHaveProperty("vatIncluded");
  });

  it("garsoniera → apartment cu 1 cameră", () => {
    const r = mapPropertyToVrexa({ ...apartment, property_type: "studio", rooms: null } as never, ctx);
    if (!r.ok) throw new Error(r.reasons.join());
    expect(r.listings[0]!.body).toMatchObject({ type: "apartment", totalRooms: 1 });
  });

  it("vânzare + închiriere → două anunțuri", () => {
    const r = mapPropertyToVrexa({ ...apartment, for_rent: true, rent_price: 600, rent_currency: "EUR" } as never, ctx);
    if (!r.ok) throw new Error("blocat");
    expect(r.listings.map((l) => [l.transaction, l.body.transaction, l.body.price])).toEqual([["sale", "sale", 120000], ["rent", "rent", 600]]);
  });

  it("preț în lei convertit în EUR cu avertisment; altă monedă blocată", () => {
    const r = mapPropertyToVrexa({ ...apartment, sale_price: 497500, sale_currency: "RON" } as never, { agent, eurRonRate: 4.975 });
    if (!r.ok) throw new Error("blocat");
    expect(r.listings[0]!.body.price).toBe(100000);
    expect(r.warnings.some((w) => w.includes("convertit din lei"))).toBe(true);
    const usd = mapPropertyToVrexa({ ...apartment, sale_currency: "USD" } as never, ctx);
    expect(usd.ok).toBe(false);
  });

  it("demisol și mansardă blocate cu motivul cerut; parter înalt → 0", () => {
    for (const floor_label of ["Demisol", "Mansardă"]) {
      const r = mapPropertyToVrexa({ ...apartment, floor_label } as never, ctx);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reasons).toContain(VREXA_FLOOR_UNSUPPORTED);
    }
    const r = mapPropertyToVrexa({ ...apartment, floor_label: "Parter înalt" } as never, ctx);
    if (!r.ok) throw new Error("blocat");
    expect(r.listings[0]!.body.floor).toBe(0);
  });

  it.each([["apartament", apartment], ["casă", house]])("%s fără climatizare → blocat, fără valoare implicită", (_n, prop) => {
    const r = mapPropertyToVrexa({ ...prop, cooling_systems: [] } as never, ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain(VREXA_NO_COOLING_REASON);
    expect(VREXA_NO_COOLING_REASON).toBe("Vrexa cere obligatoriu tipul de climatizare (aer condiționat, ventiloconvectoare sau aeroterme) și nu are opțiunea «fără». Completează «Sisteme de răcire» în fișă dacă proprietatea are; altfel anunțul nu poate fi publicat pe Vrexa până primim răspunsul echipei Vrexa.");
  });

  it.each([["apartament", apartment], ["casă", house]])("%s cu „Aer condiționat” → trece", (_n, prop) => {
    const r = mapPropertyToVrexa(prop as never, ctx);
    if (!r.ok) throw new Error(r.reasons.join(" "));
    expect(r.listings[0]!.body.airConditioning).toBe("airConditioning");
  });

  it("spațiu comercial fără climatizare → trece, câmp omis", () => {
    const r = mapPropertyToVrexa({ ...commercial, cooling_systems: [] } as never, ctx);
    if (!r.ok) throw new Error(r.reasons.join(" "));
    expect(r.listings[0]!.body).not.toHaveProperty("airConditioning");
  });

  it.each([["apartament", apartment], ["casă", house]])("%s fără climatizare → zero apeluri de transport", async (_n, prop) => {
    const mapping = mapPropertyToVrexa({ ...prop, cooling_systems: [] } as never, ctx);
    const t = vi.fn(async () => new Response("{}", { status: 200 }));
    const a = createVrexaAdapter({ transport: t as never, env: () => ({}), load: async () => ({ mapping, reference: "HB-1", stored: [], images: [], imageWarnings: [] }) as never });
    const pc = { organizationId: "o", definition: {}, direction: "habitoo_to_portal", authenticationMode: "portal_api_key", externalAccountId: "cid", portalCredential: "s", settings: {}, allowLiveRequests: true } as unknown as PortalContext;
    const r = await a.publishListing(pc, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
    expect(t).not.toHaveBeenCalled();
  });

  it("mesajul de blocare Vrexa (demisol) fără „completează:” și fără „..”", () => {
    const r = mapPropertyToVrexa({ ...apartment, floor_label: "Demisol", floor: -1 } as never, ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const report: PortalRequirementReport = { portalId: "vrexa", known: true, ok: false, missing: r.reasons.map((x, i) => ({ key: `vrexa_${i}`, label: x, requirement: "" })), required: [], allowed: [] } as never;
    const msg = requirementBlockMessage("Vrexa.ro", report);
    expect(msg.startsWith("Vrexa.ro: publicarea este blocată. ")).toBe(true);
    expect(msg).toContain(VREXA_FLOOR_UNSUPPORTED);
    expect(msg).not.toContain("completează:");
    expect(msg).not.toContain("..");
  });

  it("adresă curățată; număr doar la locație exactă", () => {
    const r = mapPropertyToVrexa({ ...apartment, street: "Str. Lalelelor; [bl] *A*", location_precise: false } as never, ctx);
    if (!r.ok) throw new Error("blocat");
    const loc = r.listings[0]!.body.location as { address: string };
    expect(loc.address).toBe("Str. Lalelelor bl A, Militari, București, București");
    expect(/^[\p{L}\p{N} ,.\-()+/#'"&:°]+$/u.test(loc.address)).toBe(true);
  });

  it("nume de contact curățat; telefon păstrat cu caracterele permise", () => {
    const r = mapPropertyToVrexa(apartment as never, { agent: { ...agent, name: "Ștefan_Popescu 2 (Agent)" } });
    if (!r.ok) throw new Error("blocat");
    expect(r.listings[0]!.body.contact).toEqual({ name: "ȘtefanPopescu Agent", email: "ana@agentie.ro", phone: "0722 123 456" });
  });

  it.each([
    ["rooms", null, "numărul de camere"], ["bathrooms", null, "numărul de băi"], ["build_year", null, "anul construcției"],
    ["usable_surface", null, "suprafața utilă"], ["floor_label", "", "etajul"], ["building_floors", null, "niveluri"],
    ["comfort", null, "confortul"], ["layout", null, "compartimentarea"], ["building_type", null, "tipul clădirii"],
    ["furnishing", null, "mobilarea"], ["heating_systems", [], "tipul de încălzire"], ["finish_state", null, "starea finisajelor"],
  ])("apartament fără %s → blocat", (field, value, text) => {
    const row: Record<string, unknown> = { ...apartment, [field]: value };
    if (field === "floor_label") row.floor = null;
    const r = mapPropertyToVrexa(row as never, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.some((x) => x.includes(text) && x.endsWith("pentru Vrexa."))).toBe(true);
  });

  it.each([["category", "tipul casei"], ["land_surface", "suprafața terenului"]])("casă fără %s → blocat", (field, text) => {
    const r = mapPropertyToVrexa({ ...house, [field]: null } as never, ctx);
    expect(!r.ok && r.reasons.some((x) => x.includes(text))).toBe(true);
  });

  it.each([["destination", "tipul terenului"], ["land_classification", "clasificarea"]])("teren fără %s → blocat", (field, text) => {
    const r = mapPropertyToVrexa({ ...plot, [field]: null } as never, ctx);
    expect(!r.ok && r.reasons.some((x) => x.includes(text))).toBe(true);
  });

  it("tip fără corespondent, text scurt, fără coordonate sau contact → blocat", () => {
    expect(mapPropertyToVrexa({ ...apartment, property_type: "garage" } as never, ctx).ok).toBe(false);
    const r = mapPropertyToVrexa({ ...apartment, title: "Scurt", description: "Prea scurtă", lat: null, lng: null } as never, { agent: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it("vrexa are cerințe din mapper", () => {
    const req = (PORTAL_REQUIREMENTS as Record<string, { mapperReasons?: (s: never) => string[] }>)["vrexa"];
    expect(req?.mapperReasons?.({ vrexaReasons: ["x"] } as never)).toEqual(["x"]);
  });
});
