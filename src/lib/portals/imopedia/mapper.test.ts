import { describe, expect, it } from "vitest";
import { IMOPEDIA_FORBIDDEN_FIELDS, mapPropertyToImopedia, type ImopediaMapContext } from "./mapper";
import type { ImopediaLocationResult } from "./location";

const EXACT: ImopediaLocationResult = { regionId: 1, zonaId: 171, zonaText: "Militari", status: "exact", reason: "ok" };
const DESC = "Apartament luminos, aproape de metrou. Bloc reabilitat termic, centrală proprie și parcare.";

function prop(extra: Record<string, unknown> = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Apartament 2 camere Militari",
    description: DESC,
    property_type: "apartment",
    for_sale: true,
    for_rent: false,
    sale_price: 76500,
    sale_currency: "EUR",
    commission: "2%",
    rooms: 2,
    bedrooms: 1,
    floor: 3,
    building_floors: 8,
    bathrooms: 1,
    balconies: 1,
    usable_surface: 55,
    built_surface: 62,
    build_year: 2018,
    layout: "Decomandat",
    furnishing: "Complet",
    building_type: "Bloc",
    lat: 44.44,
    lng: 26.01,
    location_precise: true,
    street: "Strada Exemplu",
    street_number: "1",
    is_exclusive: true,
    features: ["Aer condiționat", "Lift", "Piscină"],
    created_at: "2026-01-05T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    ...extra,
  } as any;
}
const ctx = (extra: Partial<ImopediaMapContext> = {}): ImopediaMapContext => ({
  agencyId: 123,
  location: EXACT,
  collaboration: { active: false, commissionPercent: null },
  currentYear: 2026,
  ...extra,
});
const run = (extra = {}, c = {}) => mapPropertyToImopedia(prop(extra), ctx(c));
const fieldMap = (extra = {}, c = {}) => {
  const r = run(extra, c);
  if (!r.ok) throw new Error(r.reasons.join(" | "));
  return Object.fromEntries(r.fields.map((f) => [f.name, f]));
};
const reasons = (extra = {}, c = {}) => {
  const r = run(extra, c);
  if (r.ok) throw new Error("expected blocked");
  return r.reasons;
};

describe("mapPropertyToImopedia", () => {
  it("apartament vânzare EUR complet: câmpuri și tipuri", () => {
    const f = fieldMap();
    expect(f.AGENTIA).toEqual({ name: "AGENTIA", type: "xsd:int", value: 123 });
    expect(f.TIP_IMOBIL_REAL.value).toBe(1);
    expect(f.T_V_TRANZ).toMatchObject({ type: "xsd:int", value: 1 });
    expect(f.T_V_PRET).toMatchObject({ type: "xsd:float", value: 76500 });
    expect(f.T_V_MONEDA).toMatchObject({ type: "xsd:string", value: "EUR" });
    expect(f.T_I_TRANZ.value).toBe(0);
    expect(f.T_I_PRET).toBeUndefined();
    expect(f.COMISION).toMatchObject({ type: "xsd:string", value: "2" });
    expect(f.REGION_ID.value).toBe(1);
    expect(f.ZONA_ID.value).toBe(171);
    expect(f.ZONA.value).toBe("Militari");
    expect(f.GEO_LAT).toMatchObject({ type: "xsd:string", value: "44.44" });
    expect(f.GEO_ACCURACY.value).toBe(1);
    expect(f.ADDRESS.value).toBe("Strada Exemplu 1");
    expect(f.SUPR_UTILA).toMatchObject({ type: "xsd:float", value: 55 });
    expect(f.SUPR_CONSTR.value).toBe(62);
    expect(f.NRCAM.value).toBe(2);
    expect(f.ETAJ.value).toBe(3);
    expect(f.NRETAJE.value).toBe(8);
    expect(f.AN_CONSTRUCTIE).toMatchObject({ type: "xsd:string", value: "2018" });
    expect(f.A_IMPARTIRE.value).toBe(1);
    expect(f.MOBILAT.value).toBe(1);
    expect(f.AMPLASAMENT).toMatchObject({ type: "xsd:string", value: "1" });
    expect(f.EXCLUSIVITATE.value).toBe(1);
    expect(f.COLLAB_AGENT_ACTIVE.value).toBe(0);
    expect(f.DATA_APARITIE.value).toBe("2026-01-05");
    expect(f.DATA_MODIFICARE.value).toBe("2026-02-01");
    expect(f.PLATA_TVA).toBeUndefined();
    expect(f.STARE_IMOBIL).toBeUndefined();
  });

  it("vânzare + închiriere: ambele tranzacții în aceeași ofertă", () => {
    const f = fieldMap({ for_rent: true, rent_price: 450, rent_currency: "RON" });
    expect([f.T_V_TRANZ.value, f.T_I_TRANZ.value, f.T_I_PRET.value, f.T_I_MONEDA.value]).toEqual([1, 1, 450, "RON"]);
    expect([f.COMISION.value, f.COMISION_I.value]).toEqual(["2", "2"]);
  });

  it("monedă neacceptată sau preț lipsă → blocare", () => {
    expect(reasons({ sale_currency: "GBP" })[0]).toMatch(/GBP/);
    expect(reasons({ sale_price: 0, price: null })[0]).toMatch(/prețul de vânzare/);
  });

  it("comision: 2,5% → \"2.5\"; negociabil → COMISION_TEXT; gol → blocare", () => {
    expect(fieldMap({ commission: "2,5 %" }).COMISION.value).toBe("2.5");
    const neg = fieldMap({ commission: "negociabil" });
    expect(neg.COMISION_TEXT.value).toBe("negociabil");
    expect(neg.COMISION).toBeUndefined();
    expect(reasons({ commission: "  " })).toContain(
      "Completează comisionul: Imopedia cere procentul sau o descriere a comisionului.",
    );
  });

  it("localizare missing → blocare; region_only → fără ZONA_ID, cu ZONA", () => {
    expect(reasons({}, { location: { regionId: null, zonaId: null, zonaText: "X", status: "missing", reason: "Județ necunoscut." } })).toContain("Județ necunoscut.");
    const f = fieldMap({}, { location: { regionId: 14, zonaId: null, zonaText: "Cluj-Napoca", status: "region_only", reason: "fără cartier" } });
    expect(f.ZONA_ID).toBeUndefined();
    expect(f.ZONA.value).toBe("Cluj-Napoca");
    expect(f.REGION_ID.value).toBe(14);
  });

  it("descriere cu telefon, email și URL: curățată, fără placeholdere, cu avertisment", () => {
    const r = run({
      description: `${DESC} Sunați la 0722 123 456 sau scrieți la ana@exemplu.ro. Mai multe poze pe www.agentia.ro, cu plan inclus.`,
    });
    if (!r.ok) throw new Error(r.reasons.join());
    const obs = String(r.fields.find((f) => f.name === "OBSERVATII")!.value);
    expect(obs).not.toMatch(/0722|@|www|\[|telefon/);
    expect(obs.startsWith(DESC)).toBe(true);
    expect(obs).toContain("Mai multe poze pe, cu plan inclus.".replace("pe,", "pe,"));
    expect(r.warnings.some((w) => /telefon/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /email/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /URL/.test(w))).toBe(true);
  });

  it("descriere doar cu date de contact → blocare", () => {
    expect(reasons({ description: "Sunați la 0722123456." })[0]).toMatch(/Descrierea este goală/);
  });

  it("titlu cu telefon → regenerat", () => {
    const r = run({ title: "Apartament 0722123456" });
    if (!r.ok) throw new Error();
    const t = String(r.fields.find((f) => f.name === "TITLU")!.value);
    expect(t).not.toMatch(/\d{6}/);
    expect(t).toMatch(/Apartament/);
    expect(r.warnings.some((w) => /Titlul/.test(w))).toBe(true);
  });

  it("dotări: doar potrivirile exacte din nomenclatorul tipului; tip fără listă → absent", () => {
    expect(fieldMap().DOTARI.value).toBe("aer conditionat; lift");
    // Birourile (tip 2) nu au listă de dotări în nomenclator.
    expect(fieldMap({ property_type: "office" }).DOTARI).toBeUndefined();
  });

  it("colaborare activă → 1, procent și detalii", () => {
    const f = fieldMap({}, { collaboration: { active: true, commissionPercent: 50 } });
    expect(f.COLLAB_AGENT_ACTIVE.value).toBe(1);
    expect(f.COLLAB_COMMISSION_SHARE.value).toBe("50%");
    expect(f.COLLAB_DETAILS.value).toBe("Se oferă agentului colaborator 50% din comisionul încasat de agenția ofertantă.");
  });

  it("tip necunoscut → blocare", () => {
    expect(reasons({ property_type: "boat" })[0]).toMatch(/boat/);
  });

  it("GOLD=0 și IMOPEDIA=1 mereu; niciun câmp legacy", () => {
    for (const r of [run(), run({ commission: "" })]) {
      const names = r.fields.map((f) => f.name);
      expect(r.fields.find((f) => f.name === "GOLD")?.value).toBe(0);
      expect(r.fields.find((f) => f.name === "IMOPEDIA")?.value).toBe(1);
      for (const legacy of IMOPEDIA_FORBIDDEN_FIELDS) expect(names).not.toContain(legacy);
    }
  });
});
