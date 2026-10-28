import { describe, expect, it, vi } from "vitest";
import { getImo24Features, resetImo24DictionaryCache } from "./dictionaries";
import { mapPropertyToImo24, type Imo24Anunt } from "./mapper";
import { validatePortalRequirements, type PortalRequirementSubject } from "../requirements";

const DESC =
  "Apartament luminos, aproape de metrou. Bloc reabilitat termic, centrală proprie și parcare. Ideal pentru familie.";

function prop(extra: Record<string, unknown> = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    reference: "HB-1171",
    title: "Apartament 2 camere Militari Residence",
    description: DESC,
    property_type: "apartment",
    for_sale: true,
    for_rent: false,
    transaction_kind: "sale",
    sale_price: 76500,
    sale_currency: "EUR",
    currency: "EUR",
    rooms: 2,
    floor: 3,
    building_floors: 10,
    bathrooms: 1,
    balconies: 1,
    parking_spaces: 1,
    usable_surface: 55,
    build_year: 2018,
    layout: "Decomandat",
    comfort: "1",
    building_type: "Bloc",
    finish_state: "Finisat",
    county: "Ilfov",
    city: "Chiajna",
    district: "Militari Residence",
    lat: 44.44,
    lng: 25.98,
    location_precise: true,
    street: "Strada Rezervelor",
    negotiable: true,
    vat_included: false,
    commission: null,
    features: [],
    ...extra,
  } as any;
}

function ok(extra: Record<string, unknown> = {}, options = {}): Imo24Anunt[] {
  const r = mapPropertyToImo24(prop(extra), { currentYear: 2026, ...options });
  if (!r.ok) throw new Error(r.reasons.join(" | "));
  return r.bodies;
}
function reasons(extra: Record<string, unknown> = {}, options = {}): string[] {
  const r = mapPropertyToImo24(prop(extra), { currentYear: 2026, ...options });
  if (r.ok) throw new Error("expected not publishable");
  return r.reasons;
}

describe("imo24 mapper — tranzacție și external_id", () => {
  it("vânzare + închiriere produce două corpuri, fiecare cu prețul lui", () => {
    const bodies = ok({ for_rent: true, rent_price: 450, rent_currency: "EUR" });
    expect(bodies.map((b) => [b.tranzactie, b.pret, b.external_id])).toEqual([
      ["vanzare", 76500, "HB-1171-v"],
      ["inchiriere", 450, "HB-1171-i"],
    ]);
  });
  it("external_id păstrează doar caracterele permise", () => {
    expect(ok({ reference: "HB 11/71#" })[0].external_id).toBe("HB-11-71-v");
  });
});

describe("imo24 mapper — categorie", () => {
  it("garsoniera devine apartament cu 1 cameră, fără băi", () => {
    const [b] = ok({ property_type: "studio", rooms: null, bathrooms: 1 });
    expect(b.categorie).toBe("apartament");
    expect(b.camere).toBe(1);
    expect(b.bai).toBeUndefined();
  });
  it("casă/vilă → casa, teren → teren, spațiu comercial → spatiu_comercial", () => {
    expect(ok({ property_type: "villa" })[0].categorie).toBe("casa");
    expect(ok({ property_type: "land" })[0].categorie).toBe("teren");
    expect(ok({ property_type: "commercial" })[0].categorie).toBe("spatiu_comercial");
  });
  it("birou și hală sunt nepublicabile, cu motiv", () => {
    expect(reasons({ property_type: "office" })[0]).toMatch(/Birou/);
    expect(reasons({ property_type: "industrial" })[0]).toMatch(/Hală/);
  });
});

describe("imo24 mapper — apartamente", () => {
  it("peste 4 camere → 4; limitări băi/balcoane/parcare la 5", () => {
    const [b] = ok({ rooms: 6, bathrooms: 7, balconies: 9, parking_spaces: 8 });
    expect([b.camere, b.bai, b.balcoane, b.locuri_parcare]).toEqual([4, 5, 5, 5]);
  });
  it("etajul lipsă sau peste 15 blochează publicarea", () => {
    expect(reasons({ floor: null, floor_label: null }).join()).toMatch(/etajul/i);
    expect(reasons({ floor: 16 }).join()).toMatch(/Etajul 16/);
  });
  it("demisol = -1, parter = 0 din eticheta etajului", () => {
    expect(ok({ floor: null, floor_label: "Demisol" })[0].etaj).toBe(-1);
    expect(ok({ floor: null, floor_label: "Parter" })[0].etaj).toBe(0);
  });
  it("etaje_imobil peste 15 nu se trimite", () => {
    expect(ok({ building_floors: 20 })[0].etaje_imobil).toBeUndefined();
  });
});

describe("imo24 mapper — enumerări", () => {
  it("mapează valorile cunoscute și deduce intervalul din an", () => {
    const [b] = ok();
    expect([b.compartimentare, b.confort, b.tip_imobil, b.stare_proprietate, b.interval_constructie]).toEqual([
      "decomandat", "confort_1", "bloc", "finisat", "dupa_2000",
    ]);
    expect(ok({ build_year: 1975 })[0].interval_constructie).toBe("inainte_1977");
  });
  it("fără corespondent → null, nu se ghicește", () => {
    const [b] = ok({ layout: "Nedecomandat", finish_state: "Renovat", building_type: "Ansamblu rezidențial" });
    expect([b.compartimentare, b.stare_proprietate, b.tip_imobil]).toEqual([null, null, null]);
  });
  it("cod absent din GET /enumerari → null", () => {
    const [b] = ok({}, { enumerations: { compartimentare: [{ cod: "semidecomandat" }] } });
    expect(b.compartimentare).toBeNull();
  });
});

describe("imo24 mapper — dotări", () => {
  it("doar potrivirile exacte pe eticheta normalizată", () => {
    const features = [{ grup: "Clădire", dotari: [{ id: 7, nume: "Lift" }, { id: 9, nume: "Aer conditionat" }, { id: 3, nume: "Interfon video" }] }];
    const [b] = ok({ building_amenities: ["Lift", "Videointerfon"], cooling_systems: ["Aer condiționat"] }, { features });
    expect(b.dotari).toEqual([7, 9]);
  });
  it("dicționarul de dotări se păstrează 24 h în cache", async () => {
    resetImo24DictionaryCache();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ succes: true, data: [{ grup: "G", dotari: [{ id: 1, nume: "Lift" }] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    let t = 1_000_000;
    const deps = { fetch: fetchMock as unknown as typeof fetch, now: () => t, sleep: async () => {} };
    const key = "i24_" + "a".repeat(8) + "_" + "b".repeat(40);
    await getImo24Features(key, "apartament", deps);
    t += 23 * 3600_000;
    await getImo24Features(key, "apartament", deps);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    t += 2 * 3600_000;
    await getImo24Features(key, "apartament", deps);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("imo24 mapper — locație", () => {
  it("București pe sector, din sectorul proprietății", () => {
    const [b] = ok({ county: "Bucureşti", city: "Bucureşti Sectorul 6", lat: 44.43, lng: 26.0 });
    expect(b.locatie).toMatchObject({ judet: "București", localitate: "Sector 6" });
  });
  it("județul fără prefix, localitatea și strada", () => {
    const [b] = ok({ county: "Județul Ilfov" });
    expect(b.locatie).toMatchObject({ judet: "Ilfov", localitate: "Chiajna", strada: "Strada Rezervelor", lat: 44.44, lng: 25.98 });
  });
  it("fără coordonate sau în afara României → nepublicabil", () => {
    expect(reasons({ lat: null, lng: null }).join()).toMatch(/coordonatele/);
    expect(reasons({ lat: 52.5, lng: 13.4 }).join()).toMatch(/afara României/);
  });
});

describe("imo24 mapper — text", () => {
  it("titlul prea lung se taie la cuvânt întreg, fără „...”", () => {
    const [b] = ok({ title: "Apartament superb cu două camere decomandat în ansamblul Militari Residence lângă parc" });
    expect(b.titlu.length).toBeLessThanOrEqual(60);
    expect(b.titlu).toBe("Apartament superb cu două camere decomandat în ansamblul");
    expect(b.titlu).not.toMatch(/\.\.\.|…$/);
  });
  it("titlul prea scurt se completează cu tip, camere și zonă", () => {
    const [b] = ok({ title: "Ofertă" });
    expect(b.titlu).toBe("Ofertă – Apartament 2 camere – Militari Residence");
    expect(b.titlu.length).toBeGreaterThanOrEqual(10);
  });
  it("descrierea HTML devine text și se taie la final de propoziție", () => {
    const long = "<p>" + "Propoziție lungă despre apartament. ".repeat(80) + "</p>";
    const [b] = ok({ description: long });
    expect(b.descriere).not.toMatch(/<|>/);
    expect(b.descriere.length).toBeLessThanOrEqual(2000);
    expect(b.descriere.endsWith(".")).toBe(true);
  });
  it("descrierea sub 50 de caractere blochează", () => {
    expect(reasons({ description: "<b>Scurt</b>" }).join()).toMatch(/Descrierea/);
  });
});

describe("imo24 mapper — preț", () => {
  it("RON se convertește la cursul BNR și se rotunjește", () => {
    const [b] = ok({ sale_price: 400000, sale_currency: "RON" }, { eurRonRate: 4.9737 });
    expect(b.pret).toBe(80424);
    expect(b.moneda).toBe("EUR");
  });
  it("sub minim după conversie → nepublicabil", () => {
    expect(reasons({ sale_price: 45000, sale_currency: "RON" }, { eurRonRate: 4.97 }).join()).toMatch(/sub minimul/);
    expect(reasons({ for_sale: false, transaction_kind: "rent", for_rent: true, rent_price: 80, rent_currency: "EUR" }).join()).toMatch(/100 €/);
  });
  it("altă monedă decât EUR/RON → nepublicabil", () => {
    expect(reasons({ sale_currency: "USD" }).join()).toMatch(/USD/);
  });
  it("negociabil, TVA și comision zero din câmpurile Habitoo", () => {
    const [b] = ok({ negotiable: true, vat_included: true, commission: "0%" });
    expect([b.negociabil, b.tva, b.comision_zero]).toEqual([true, true, true]);
    expect(ok({ commission: "2%" })[0].comision_zero).toBe(false);
  });
});

describe("imo24 — motive în cardul Publicare", () => {
  it("raportul imo24 listează motivele mapper-ului", () => {
    const report = validatePortalRequirements("imo24", { imo24Reasons: ["Setează poziția pe hartă."] } as PortalRequirementSubject);
    expect(report.ok).toBe(false);
    expect(report.missing.map((m) => m.label)).toEqual(["Setează poziția pe hartă."]);
  });
});
