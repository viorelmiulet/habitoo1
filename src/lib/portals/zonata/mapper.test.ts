import { describe, expect, it } from "vitest";
import { mapPropertyToZonata, zonataTitle, zonataDescription, zonataImages, ZONATA_IMAGES_MAX } from "./mapper";
import { diffZonataNomenclature, parseZonataCategories, parseZonataFields, type ZonataSubcategory } from "./nomenclature";

const sel = (slug: string, label: string, options: string[], required = false) => ({
  slug, label, type: "select", required, options: options.map((o) => ({ value: o, label: o })),
});
const txt = (slug: string, label: string, required = false) => ({ slug, label, type: "text", required, options: [] });

const residential = [
  sel("numar_camere", "Număr camere", ["1", "2", "3", "4", "5+"], true),
  txt("suprafata_utila_num", "Suprafață utilă"),
  sel("etaj", "Etaj", ["parter", "1", "2", "3", "4", "5"]),
  txt("an_constructie", "An construcție"),
  sel("compartimentare", "Compartimentare", ["decomandat", "semidecomandat"]),
  sel("confort", "Confort", ["Confort 1", "Confort 2", "Lux"]),
  sel("stare", "Stare", ["Nou", "Renovat"]),
  { slug: "dotari", label: "Dotări", type: "checkbox", required: false, options: [{ value: "ac", label: "Aer condiționat" }, { value: "lift", label: "Lift" }] },
];
const sub = (slug: string, label: string, fields: any[] = residential): ZonataSubcategory => ({
  category_slug: "imobiliare", category_label: "Imobiliare", subcategory_slug: slug, subcategory_label: label, fields,
});
const NOMENCLATURE: ZonataSubcategory[] = [
  sub("apartamente-de-vanzare", "Apartamente de vânzare"),
  sub("apartamente-de-inchiriat", "Apartamente de închiriat"),
  sub("case-vile-de-vanzare", "Case / vile de vânzare"),
  sub("case-vile-de-inchiriat", "Case / vile de închiriat"),
  sub("terenuri-de-vanzare", "Terenuri de vânzare", [txt("suprafata_teren", "Suprafață teren", true)]),
  sub("spatii-comerciale-de-vanzare", "Spații comerciale de vânzare", [txt("suprafata_utila_num", "Suprafață utilă")]),
  sub("spatii-comerciale-de-inchiriat", "Spații comerciale de închiriat", [txt("suprafata_utila_num", "Suprafață utilă")]),
];
const IMAGES = [{ url: "https://crm.habitoo.ro/m/1", path: "a/1.jpg" }, { url: "https://crm.habitoo.ro/m/2", path: "a/2.webp" }];
const DESC = "Apartament luminos, renovat recent, aproape de metrou, cu vedere spre parc și bucătărie separată.";

const base = {
  id: "11111111-1111-1111-1111-111111111111",
  reference: "HB-1009",
  title: "Apartament 3 camere Militari, renovat",
  description: DESC,
  property_type: "apartment",
  for_sale: true,
  for_rent: false,
  sale_price: 120000,
  sale_currency: "EUR",
  rent_price: 600,
  rent_currency: "EUR",
  rooms: 3,
  usable_surface: 72,
  floor: 2,
  build_year: 1985,
  layout: "Decomandat",
  comfort: "1",
  finish_state: "Renovat",
  features: ["Aer condiționat", "Piscină"],
  street: "Strada Exemplu",
  district: "Militari",
  city: "București",
  county: "București",
  lat: 44.43,
  lng: 26.0,
  location_precise: true,
} as any;
const map = (p: any, images = IMAGES) => mapPropertyToZonata(p, { nomenclature: NOMENCLATURE, images });

describe("categoria ZonaTa", () => {
  it("apartament la vânzare", () => {
    const r = map(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bodies).toHaveLength(1);
    const b = r.bodies[0]!;
    expect([b.category, b.subcategory]).toEqual(["imobiliare", "apartamente-de-vanzare"]);
    expect(b.external_id).toBe("HB-1009-v");
    expect(b).toMatchObject({ price: 120000, currency: "EUR", price_type: "fixed", address: "Strada Exemplu, Militari, București", lat: 44.43, lng: 26 });
    expect(b.fields).toEqual({
      numar_camere: "3", suprafata_utila_num: "72", etaj: "2", an_constructie: "1985",
      compartimentare: "decomandat", confort: "Confort 1", stare: "Renovat", dotari: ["ac"],
    });
  });
  it("ambele tranzacții → două anunțuri cu external_id diferit", () => {
    const r = map({ ...base, for_rent: true, rent_currency: "RON", rent_price: 3000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bodies.map((b) => [b.subcategory, b.external_id, b.price, b.currency])).toEqual([
      ["apartamente-de-vanzare", "HB-1009-v", 120000, "EUR"],
      ["apartamente-de-inchiriat", "HB-1009-i", 3000, "RON"],
    ]);
  });
  it("casă la închiriere", () => {
    const r = map({ ...base, property_type: "house", for_sale: false, for_rent: true });
    expect(r.ok && r.bodies[0]!.subcategory).toBe("case-vile-de-inchiriat");
  });
  it("teren la vânzare, cu câmpul obligatoriu din suprafața terenului", () => {
    const r = map({ ...base, property_type: "land", land_surface: 500 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bodies[0]).toMatchObject({ subcategory: "terenuri-de-vanzare", fields: { suprafata_teren: "500" } });
  });
  it("spațiu comercial cu ambele tranzacții", () => {
    const r = map({ ...base, property_type: "commercial", for_rent: true });
    expect(r.ok && r.bodies.map((b) => b.subcategory)).toEqual(["spatii-comerciale-de-vanzare", "spatii-comerciale-de-inchiriat"]);
  });
  it("teren la închiriere fără subcategorie → categorie nemapată", () => {
    const r = map({ ...base, property_type: "land", for_sale: false, for_rent: true, land_surface: 500 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain("Tipul „Teren” la închiriere nu are categorie ZonaTa.");
  });
});

describe("valori fără corespondent", () => {
  it("nu se trimit", () => {
    const r = map({ ...base, layout: "Circular", comfort: "3", finish_state: "De demolat", features: ["Piscină"], floor: 9 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = r.bodies[0]!.fields;
    for (const k of ["compartimentare", "confort", "stare", "dotari", "etaj"]) expect(f[k]).toBeUndefined();
  });
  it("„5+” acceptă 7 camere; parterul se mapează", () => {
    const r = map({ ...base, rooms: 7, floor: 0 });
    expect(r.ok && r.bodies[0]!.fields).toMatchObject({ numar_camere: "5+", etaj: "parter" });
  });
});

describe("limite", () => {
  it("titlu scurt completat din tip, camere și zonă", () => {
    expect(zonataTitle({ ...base, title: "Ofertă" })).toBe("Ofertă – Apartament 3 camere Militari");
  });
  it("titlu lung tăiat la cuvânt, max 150", () => {
    const t = zonataTitle({ ...base, title: "cuvânt ".repeat(40) });
    expect(t.length).toBeLessThanOrEqual(150);
    expect(t.endsWith("cuvânt")).toBe(true);
  });
  it("descriere peste 4000 tăiată la cuvânt; sub 40 blocată", () => {
    const d = zonataDescription({ ...base, description: "abcdefgh ".repeat(600) });
    expect(d.length).toBeLessThanOrEqual(4000);
    expect(d.endsWith("abcdefgh")).toBe(true);
    const r = map({ ...base, description: "Scurt." });
    expect(!r.ok && r.reasons).toContain("Descrierea trebuie să aibă cel puțin 40 de caractere (text simplu).");
  });
  it("poze: primele 10, doar JPEG/PNG/WebP, în ordine", () => {
    const imgs = [{ url: "u0", path: "x.gif" }, ...Array.from({ length: 12 }, (_, i) => ({ url: `u${i + 1}`, path: `p${i + 1}.${i % 2 ? "png" : "jpeg"}` }))];
    const { urls, skipped } = zonataImages(imgs);
    expect(urls).toEqual(Array.from({ length: ZONATA_IMAGES_MAX }, (_, i) => `u${i + 1}`));
    expect(skipped).toBe(1);
  });
  it("nicio poză → blocat", () => {
    const r = map(base, []);
    expect(!r.ok && r.reasons).toContain("ZonaTa cere cel puțin o poză JPEG, PNG sau WebP inclusă la publicare.");
  });
  it("adresă lipsă → blocat", () => {
    const r = map({ ...base, street: null, district: null, city: null, county: null });
    expect(!r.ok && r.reasons).toContain("Lipsește adresa: completează cel puțin localitatea.");
  });
});

describe("câmpuri obligatorii", () => {
  it("lipsa camerelor blochează apartamentul", () => {
    const r = map({ ...base, rooms: null });
    expect(!r.ok && r.reasons).toContain("Câmpul obligatoriu ZonaTa „Număr camere” (Apartamente de vânzare) lipsește sau nu are o valoare acceptată.");
  });
  it("nomenclator lipsă → blocat", () => {
    const r = mapPropertyToZonata(base, { nomenclature: [], images: IMAGES });
    expect(!r.ok && r.reasons[0]).toMatch(/nu a fost sincronizat/);
  });
});

describe("nomenclatorul ZonaTa", () => {
  it("citește tolerant categoriile și păstrează doar imobiliarele", () => {
    const refs = parseZonataCategories({
      data: [
        { slug: "imobiliare", name: "Imobiliare", subcategories: [{ slug: "apartamente-de-vanzare", name: "Apartamente de vânzare" }] },
        { slug: "auto-moto", name: "Auto", subcategories: [{ slug: "autoturisme" }] },
      ],
    });
    expect(refs).toEqual([{ category_slug: "imobiliare", category_label: "Imobiliare", subcategory_slug: "apartamente-de-vanzare", subcategory_label: "Apartamente de vânzare" }]);
    expect(parseZonataCategories({ categories: { imobiliare: { name: "Imobiliare", subcategories: { "case-de-vanzare": "Case" } } } })).toHaveLength(1);
  });
  it("citește câmpurile și calculează diferențele", () => {
    const fields = parseZonataFields({ fields: [{ slug: "etaj", label: "Etaj", type: "select", required: 1, options: ["1", { value: "p", label: "Parter" }] }] });
    expect(fields).toEqual([{ slug: "etaj", label: "Etaj", type: "select", required: true, options: [{ value: "1", label: "1" }, { value: "p", label: "Parter" }] }]);
    const next = [sub("a", "A", fields), sub("b", "B", [])];
    const d = diffZonataNomenclature(next, [{ category_slug: "imobiliare", subcategory_slug: "a", fields: [] }, { category_slug: "imobiliare", subcategory_slug: "c", fields: [] }]);
    expect(d.counts).toEqual({ subcategories: 2, fields: 1 });
    expect(d.changes).toEqual({ added: ["imobiliare/b"], removed: ["imobiliare/c"], fieldsChanged: ["imobiliare/a"] });
  });
});
