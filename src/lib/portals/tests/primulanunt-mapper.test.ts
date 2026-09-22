import { describe, expect, it } from "vitest";
import {
  mapPropertyToPrimulAnunt,
  primulAnuntPurpose,
  type PrimulAnuntMapperContext,
  type PrimulAnuntMapperProperty,
} from "../primulanunt/mapper";

const baseProperty: PrimulAnuntMapperProperty = {
  id: "p-1",
  reference: "HB-10042",
  propertyType: "apartament",
  transactionKind: "sale",
  title: "Apartament 2 camere Militari",
  description: "Apartament decomandat, etajul 1, aproape de metrou.",
  price: 55_000,
  currency: "EUR",
  salePrice: null,
  saleCurrency: null,
  rooms: 2,
  bathrooms: 1,
  usableSurface: 52,
  county: "București",
  city: "București Sectorul 6",
  district: "Militari",
  features: ["Balcon", "Aer condiționat"],
  lat: 44.435,
  lng: 26.02,
  postalCode: "060001",
  floor: 1,
  buildingFloors: 10,
  assignedTo: "agent-1",
};

const baseContext: PrimulAnuntMapperContext = {
  agent: { fullName: "Marius Grigore", email: "marius@example.com", phone: "+40727151461" },
  organization: { phone: "0212345678", materialPhone: "0700000001" },
};

describe("mapPropertyToPrimulAnunt", () => {
  it("mapează o ofertă completă într-un DTO corect", async () => {
    const result = await mapPropertyToPrimulAnunt(baseProperty, baseContext);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dto).toEqual({
      external_id: "HB-10042",
      title: "Apartament 2 camere Militari",
      description: "Apartament decomandat, etajul 1, aproape de metrou.",
      purpose: "sale",
      property_type: "apartament",
      price: 55_000,
      currency: "EUR",
      county: "București",
      city: "București Sectorul 6",
      is_private: false,
      rooms: 2,
      bathrooms: 1,
      surface_m2: 52,
      area: "Militari",
      features: ["Balcon", "Aer condiționat"],
      agent_name: "Marius Grigore",
      agent_phone: "+40727151461",
      agent_email: "marius@example.com",
      lat: 44.435,
      lng: 26.02,
      location_precision: "exact",
      postal_code: "060001",
      floor: 1,
      floors_total: 10,
    });
    expect(result.warnings).toEqual([]);
  });

  it("nu transformă orașul în sector, spre deosebire de Romimo", async () => {
    const result = await mapPropertyToPrimulAnunt(baseProperty, baseContext);
    expect(result.ok && result.dto.city).toBe("București Sectorul 6");
  });

  it("generează referința când lipsește, fără respingere", async () => {
    const result = await mapPropertyToPrimulAnunt(
      { ...baseProperty, reference: null },
      { ...baseContext, generateReference: async () => "HB-19999" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dto.external_id).toBe("HB-19999");
  });

  it("respinge lipsa referinței doar când nu există generator", async () => {
    const result = await mapPropertyToPrimulAnunt({ ...baseProperty, reference: null }, baseContext);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toContain("generator de referințe");
  });

  it("adună toate motivele pentru titlu/descriere/preț/județ/oraș lipsă", async () => {
    const result = await mapPropertyToPrimulAnunt(
      {
        ...baseProperty,
        title: "  ",
        description: null,
        price: null,
        salePrice: null,
        county: null,
        city: "",
      },
      baseContext,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toEqual([
      "Oferta nu are titlu.",
      "Oferta nu are descriere.",
      "Oferta nu are un preț valid.",
      "Oferta nu are județ completat.",
      "Oferta nu are oraș completat.",
    ]);
  });

  it("respinge tranzacția necunoscută", async () => {
    const result = await mapPropertyToPrimulAnunt(
      { ...baseProperty, transactionKind: "leasing" },
      baseContext,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain("nu este acceptat de PrimulAnunț.ro");
  });

  it("respinge lipsa tipului de proprietate", async () => {
    const result = await mapPropertyToPrimulAnunt(
      { ...baseProperty, propertyType: null },
      baseContext,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContain("Oferta nu are tipul proprietății completat.");
  });

  it("omite câmpurile opționale lipsă, fără respingere", async () => {
    const result = await mapPropertyToPrimulAnunt(
      {
        ...baseProperty,
        rooms: null,
        bathrooms: null,
        postalCode: null,
        usableSurface: null,
        district: null,
        lat: null,
        lng: null,
        floor: null,
        buildingFloors: null,
        features: null,
      },
      baseContext,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dto).not.toHaveProperty("rooms");
    expect(result.dto).not.toHaveProperty("bathrooms");
    expect(result.dto).not.toHaveProperty("postal_code");
    expect(result.dto).not.toHaveProperty("surface_m2");
    expect(result.dto).not.toHaveProperty("area");
    expect(result.dto).not.toHaveProperty("lat");
    expect(result.dto).not.toHaveProperty("location_precision");
    expect(result.dto).not.toHaveProperty("floor");
    expect(result.dto).not.toHaveProperty("floors_total");
    expect(result.dto).not.toHaveProperty("features");
    expect(result.dto).not.toHaveProperty("video_url");
  });

  it("trimite features exact ca în bază, fără traducere sau filtrare", async () => {
    const features = ["Centrală proprie", "loc de parcare", "Balcon"];
    const result = await mapPropertyToPrimulAnunt({ ...baseProperty, features }, baseContext);
    expect(result.ok && result.dto.features).toEqual(features);
  });

  it("folosește prețul de vânzare cu prioritate", async () => {
    const result = await mapPropertyToPrimulAnunt(
      { ...baseProperty, salePrice: 61_500, saleCurrency: "eur", price: 55_000, currency: "RON" },
      baseContext,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dto.price).toBe(61_500);
    expect(result.dto.currency).toBe("EUR");
  });

  it("cade pe telefonul agenției când agentul nu are telefon", async () => {
    const result = await mapPropertyToPrimulAnunt(baseProperty, {
      ...baseContext,
      agent: { fullName: "Marius Grigore", email: "marius@example.com", phone: null },
    });
    expect(result.ok && result.dto.agent_phone).toBe("0212345678");
  });

  it("cade pe telefonul de materiale când agenția nu are telefon principal", async () => {
    const result = await mapPropertyToPrimulAnunt(baseProperty, {
      agent: null,
      organization: { phone: null, materialPhone: "0700000001" },
    });
    expect(result.ok && result.dto.agent_phone).toBe("0700000001");
  });

  it("avertizează, fără respingere, când nu există niciun contact", async () => {
    const result = await mapPropertyToPrimulAnunt(
      { ...baseProperty, assignedTo: null },
      { agent: null, organization: null },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dto).not.toHaveProperty("agent_phone");
    expect(result.warnings.join(" ")).toContain("date de contact");
  });

  it("trimite mereu is_private false", async () => {
    const result = await mapPropertyToPrimulAnunt(baseProperty, baseContext);
    expect(result.ok && result.dto.is_private).toBe(false);
  });
});

describe("primulAnuntPurpose", () => {
  it("recunoaște doar sale și rent", () => {
    expect(primulAnuntPurpose("sale")).toBe("sale");
    expect(primulAnuntPurpose("RENT")).toBe("rent");
    expect(primulAnuntPurpose(null)).toBeNull();
    expect(primulAnuntPurpose("teren")).toBeNull();
  });
});
