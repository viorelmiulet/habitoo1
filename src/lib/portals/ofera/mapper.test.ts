import { describe, expect, it } from "vitest";
import { mapPropertyToOfera, oferaCurrency, type OferaRow, type OferaMapOptions } from "./mapper";
import { resolveOferaLocation } from "./location";
import type { OferaCategory, OferaParameter } from "./nomenclature";
const parameter = (code: string, options?: Record<string, string>): OferaParameter => ({ code, label: code, required: code === "price", type: options ? "dropdown" : "number", options: options ?? null });
const common = [parameter("price"), parameter("negotiable"), parameter("accepts_swap"), parameter("c_suprafata_utila"), parameter("c_an_constructie")];
const floors = parameter("c_etaj", { "100": "Demisol", "101": "Parter", "1": "1", "9": "9", "10": "10 și peste", "200": "Mansardă" });
const layout = parameter("c_compartimentare", { "1": "Decomandat", "2": "Semidecomandat", "3": "Nedecomandat", "4": "Circular" });
const category = (id: number, path_url: string, params: OferaParameter[]): OferaCategory => ({ id, path_url, parameters: params, parent_id: null, name: path_url, code: String(id), depth: 3 });
const categories = [
  category(94, "imobiliare/apartamente-de-vanzare/2-camere", [...common, floors, layout]),
  category(98, "imobiliare/apartamente-de-inchiriat/garsoniere", [...common, floors]),
  category(99, "imobiliare/apartamente-de-inchiriat/2-camere", [...common, floors]),
  category(102, "imobiliare/case-vanzare", [...common, parameter("c_nr_camere", { "1": "1", "2": "2", "3": "3", "4": "4 și peste" }), parameter("c_mobilat_utilat", { "1": "Complet", "2": "Parțial", "3": "Nemobilat" })]),
  category(515, "imobiliare/terenuri/de-vanzare", [...common, parameter("c_extravilan_intravilan", { "1": "Extravilan", "2": "Intravilan" })]),
  category(389, "imobiliare/birouri-spatii/spatii-de-vanzare", [parameter("price"), parameter("c_suprafata_utila")]),
];
const property: OferaRow = { id: "p", reference: "HB-1", property_type: "apartment", rooms: 2, for_sale: true, title: "<b>Apartament</b>", description: "<p>Descriere ofertă</p>", price: 100000, currency: "EUR", usable_surface: 60, build_year: 2000, floor: 0, layout: "decomandat", negotiable: true, lat: 44.43, lng: 26.05, location_precise: true };
const options: OferaMapOptions = { categories, location: { cityId: 179132, reasons: [], warnings: [] }, providerId: 486, images: ["https://crm.habitoo.ro/image1", "https://crm.habitoo.ro/image2"], contact: { tip: "business", name: "Agent test", email: "test@example.com", phone: "0700000000" }, currentYear: 2026 };
const map = (row: Partial<OferaRow> = {}, opts: Partial<OferaMapOptions> = {}) => mapPropertyToOfera({ ...property, ...row }, { ...options, ...opts });
describe("Ofera mapper pur", () => {
  it("apartament 2 camere vânzare: categoria 94 și parametrii declarați", () => {
    const r = map(); expect(r.ok).toBe(true);
    expect(r.bodies[0]).toMatchObject({ category_id: 94, external_id: "HB-1-v", promoted: 0, city_id: 179132, params: { price: 100000, negotiable: 1, c_suprafata_utila: 60, c_an_constructie: 2000, c_etaj: "101", c_compartimentare: "1", latitude: 44.43, longitude: 26.05 } });
    expect(r.bodies[0]?.params).not.toHaveProperty("accepts_swap"); expect(r.bodies[0]).not.toHaveProperty("currency");
    expect(r.bodies[0]?.images.map(i => i.order)).toEqual([0, 1]);
  });
  it("garsonieră închiriere → 98", () => expect(map({ property_type: "studio", rooms: null, for_sale: false, for_rent: true }).bodies[0]?.category_id).toBe(98));
  it("două tranzacții păstrează prețurile și codurile separate", () => {
    const r = map({ for_rent: true, sale_price: 120000, rent_price: 700 });
    expect(r.bodies.map(b => [b.external_id, b.params.price])).toEqual([["HB-1-v", 120000], ["HB-1-i", 700]]);
  });
  it.each([[1, "1"], [4, "4"], [6, "4"]])("casă %s camere și mobilare completă", (rooms, expected) => expect(map({ property_type: "house", rooms, furnishing: "complet" }).bodies[0]?.params).toMatchObject({ c_nr_camere: expected, c_mobilat_utilat: "1" }));
  it.each([["partial", "2"], ["nemobilat", "3"]])("mobilare casă %s", (furnishing, expected) => expect(map({ property_type: "house", furnishing }).bodies[0]?.params.c_mobilat_utilat).toBe(expected));
  it("teren intravilan și suprafață teren", () => expect(map({ property_type: "land", category: "intravilan", land_surface: 500 }).bodies[0]?.params).toMatchObject({ c_extravilan_intravilan: "2", c_suprafata_utila: 500 }));
  it("teren necunoscut nu ghicește clasificarea", () => expect(map({ property_type: "land", category: null }).bodies[0]?.params).not.toHaveProperty("c_extravilan_intravilan"));
  it.each([[0, null, "101"], [12, null, "10"], [null, "Mansardă", "200"], [-1, "Demisol", "100"]])("etaj %s/%s → %s", (floor, floor_label, expected) => expect(map({ floor, floor_label }).bodies[0]?.params.c_etaj).toBe(expected));
  it("dropdown necunoscut omis cu avertisment", () => { const r = map({ floor: 2 }); expect(r.bodies[0]?.params).not.toHaveProperty("c_etaj"); expect(r.warnings.some(w => w.includes("c_etaj"))).toBe(true); });
  it("parametri nedeclarați omiși, coordonate permise", () => { const r = map({ property_type: "office" }); expect(r.bodies[0]?.params).toEqual({ price: 100000, c_suprafata_utila: 60, latitude: 44.43, longitude: 26.05 }); });
  it("RON → EUR la cursul primit", () => expect(map({ price: 500000, currency: "RON" }, { eurRonRate: 5 }).bodies[0]?.params.price).toBe(100000));
  it("EUR → RON la setarea globală", () => expect(map({}, { currency: "RON", eurRonRate: 5 }).bodies[0]?.params.price).toBe(500000));
  it("moneda implicită EUR, numai RON explicit", () => { expect(oferaCurrency(null)).toBe("EUR"); expect(oferaCurrency("EUR")).toBe("EUR"); expect(oferaCurrency("RON")).toBe("RON"); });
  it("curs lipsă blochează conversia", () => expect(map({ currency: "RON" }).ok).toBe(false));
  it.each([0, -1, null])("preț %s blochează", price => expect(map({ price }).ok).toBe(false));
  it("camere lipsă blochează apartamentul", () => expect(map({ rooms: null }).reasons.some(r => r.includes("camere"))).toBe(true));
  it("categorie goală sau inactivă blochează", () => { expect(map({}, { categories: [] }).reasons).toContain("Nomenclatorul Ofera nu e sincronizat."); expect(map({}, { categories: categories.map(c => ({ ...c, active: false })) }).ok).toBe(false); });
  it.each([1799, 2030])("an %s omis", build_year => expect(map({ build_year }).bodies[0]?.params).not.toHaveProperty("c_an_constructie"));
  it("fără coordonate avertizează fără blocare", () => { const r = map({ lat: null, lng: null }); expect(r.ok).toBe(true); expect(r.warnings.length).toBe(1); expect(r.bodies[0]?.params).not.toHaveProperty("latitude"); });
  it("id furnizor lipsă blochează sans valeur inventée dans la prévisualisation", () => { const r = map({}, { providerId: null }); expect(r.ok).toBe(false); expect(r.reasons.some(r => r.includes("ID-ul furnizor"))).toBe(true); expect(r.bodies[0]).not.toHaveProperty("id_furnizor"); });
  it("imagini lipsă blochează", () => expect(map({}, { images: [] }).ok).toBe(false));
  it("telefon lipsă blochează", () => expect(map({}, { contact: { ...options.contact, tip: "business", name: "", email: "", phone: "" } }).ok).toBe(false));
});
const geography = {
  counties: [{ id: 40, name: "București", name_normalized: "bucuresti" }, { id: 23, name: "Ilfov", name_normalized: "ilfov" }],
  cities: [{ id: 179132, name: "București", name_normalized: "bucuresti", county_id: 40 }, { id: 179258, name: "Chiajna", name_normalized: "chiajna", county_id: 23 }],
  zones: [{ id: 11138, name: "Militari", name_normalized: "militari", city_id: 179132 }, { id: 11, name: "Sectorul 6", name_normalized: "sectorul 6", city_id: 179132 }],
};
describe("Ofera localizare", () => {
  it("București Militari → 11138", () => { const l = resolveOferaLocation({ county: "București", city: "București", district: "Militari" }, geography); expect(l).toMatchObject({ cityId: 179132, regionId: 11138, reasons: [] }); expect(map({}, { location: l }).bodies[0]?.params.region_id).toBe(11138); });
  it("cartier negăsit → Sectorul 6 (11)", () => expect(resolveOferaLocation({ county: "București", city: "București Sector 6", district: "Necunoscut" }, geography).regionId).toBe(11));
  it("Chiajna fără zone, fără avertisment", () => expect(resolveOferaLocation({ county: "Ilfov", city: "Chiajna", district: "Necunoscut" }, geography)).toEqual({ cityId: 179258, reasons: [], warnings: [] }));
  it("localitate negăsită blochează", () => expect(resolveOferaLocation({ county: "Ilfov", city: "Absent" }, geography).reasons.length).toBe(1));
  it("localitate ambiguă blochează", () => expect(resolveOferaLocation({ county: "Ilfov", city: "Chiajna" }, { ...geography, cities: [...geography.cities, { ...geography.cities[1], id: 2, name: "Chiajna", name_normalized: "chiajna", county_id: 23 }] }).cityId).toBeNull());
  it("zone duplicate omise cu avertisment", () => { const l = resolveOferaLocation({ county: "București", city: "București Sector 6", district: "Militari" }, { ...geography, zones: [...geography.zones, { id: 12, name: "Militari", name_normalized: "militari", city_id: 179132 }] }); expect(l.regionId).toBeUndefined(); expect(l.warnings.length).toBe(1); });
  it("zone inactivate excluse", () => expect(resolveOferaLocation({ county: "București", city: "București", district: "Militari" }, { ...geography, zones: geography.zones.map(z => ({ ...z, active: false })) }).regionId).toBeUndefined());
});