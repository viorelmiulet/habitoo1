import { describe, expect, it } from "vitest";

import {
  PORTAL_REQUIREMENTS,
  portalRequirementSpec,
  requirementBlockMessage,
  validatePortalRequirements,
  type PortalRequirementSubject,
} from "../requirements";
import { PORTALS } from "../registry";

const complete: PortalRequirementSubject = {
  title: "Apartament 3 camere Militari, bloc nou",
  description:
    "Apartament spațios cu trei camere, balcon, parcare subterană și finisaje moderne, aproape de metrou și școli.",
  propertyType: "apartament",
  forSale: true,
  forRent: false,
  price: 95000,
  currency: "EUR",
  city: "București Sectorul 6",
  county: "București",
  address: "Strada Apusului 12",
  lat: 44.434727,
  lng: 25.987173,
  imageCount: 8,
  rooms: 3,
  bedrooms: 2,
  bathrooms: 1,
  buildYear: 2020,
  usableSurface: 72,
  landSurface: null,
  builtSurface: 78,
  layout: "Decomandat",
  heatingSystems: ["Centrala proprie"],
  floor: 3,
  floorLabel: null,
  agentName: "MVA Perfect Business",
  agentEmail: "mvaperfectbusiness@gmail.com",
  contactPhone: "0700000001",
};

describe("validare pre-publicare portaluri", () => {
  it("acceptă o ofertă completă pe toate portalurile cu reguli declarate", () => {
    for (const portalId of Object.keys(PORTAL_REQUIREMENTS)) {
      const report = validatePortalRequirements(portalId, complete);
      expect(report.ok, `${portalId}: ${JSON.stringify(report.missing)}`).toBe(true);
    }
  });

  it("fiecare portal disponibil are cerințe declarate", () => {
    for (const portal of PORTALS.filter((p) => p.status === "available")) {
      expect(portalRequirementSpec(portal.id), portal.id).not.toBeNull();
    }
  });

  it("blochează coordonatele 0/0 la portalurile care le cer", () => {
    const subject = { ...complete, lat: 0, lng: 0 };
    for (const portalId of ["imobiliare_ro", "storia", "homepitch"]) {
      const report = validatePortalRequirements(portalId, subject);
      expect(report.ok).toBe(false);
      expect(report.missing.map((m) => m.key)).toContain("coordinates");
    }
  });

  it("blochează lipsa telefonului la Imobiliare.ro și La Cheie", () => {
    const subject = { ...complete, contactPhone: null };
    for (const portalId of ["imobiliare_ro", "lacheie"]) {
      const report = validatePortalRequirements(portalId, subject);
      expect(report.missing.map((m) => m.key)).toContain("phone");
    }
  });

  it("respectă monedele acceptate", () => {
    expect(validatePortalRequirements("homepitch", { ...complete, currency: "RON" }).ok).toBe(false);
    expect(validatePortalRequirements("storia", { ...complete, currency: "USD" }).ok).toBe(false);
    expect(validatePortalRequirements("lacheie", { ...complete, currency: "USD" }).ok).toBe(true);
  });

  it("blochează titlul prea lung la Imobiliare.ro și Storia", () => {
    const subject = { ...complete, title: "A".repeat(120) };
    expect(validatePortalRequirements("imobiliare_ro", subject).ok).toBe(false);
    expect(validatePortalRequirements("storia", subject).ok).toBe(false);
  });

  it("blochează descrierea scurtă și oferta fără imagini sau tranzacție", () => {
    expect(validatePortalRequirements("imobiliare_ro", { ...complete, description: "Scurt" }).ok).toBe(
      false,
    );
    expect(validatePortalRequirements("storia", { ...complete, imageCount: 0 }).ok).toBe(false);
    expect(
      validatePortalRequirements("lacheie", { ...complete, forSale: false, forRent: false }).ok,
    ).toBe(false);
  });

  it("cere date suplimentare la La Cheie", () => {
    const report = validatePortalRequirements("lacheie", {
      ...complete,
      bedrooms: null,
      bathrooms: null,
      buildYear: null,
      usableSurface: null,
    });
    expect(report.missing.map((m) => m.key).sort()).toEqual([
      "bathrooms",
      "bedrooms",
      "build_year",
      "surface",
    ]);
  });

  it("nu blochează portalurile fără reguli declarate", () => {
    const report = validatePortalRequirements("necunoscut", { ...complete, title: null });
    expect(report.known).toBe(false);
    expect(report.ok).toBe(true);
  });

  it("mesajul blocant enumeră câmpurile lipsă", () => {
    const report = validatePortalRequirements("imobiliare_ro", {
      ...complete,
      contactPhone: null,
    });
    const message = requirementBlockMessage("Imobiliare.ro", report);
    expect(message).toContain("Imobiliare.ro");
    expect(message).toContain("Telefon și WhatsApp");
  });

  it("Romimo cere exact ce cere mapper-ul: titlu, descriere, suprafață, camere, an", () => {
    const report = validatePortalRequirements("romimo", {
      ...complete,
      title: "abc",
      description: "scurt",
      usableSurface: null,
      rooms: null,
      buildYear: null,
    });
    expect(report.missing.map((m) => m.key).sort()).toEqual([
      "build_year",
      "description",
      "rooms",
      "surface",
      "title",
    ]);
  });

  it("Romimo respinge o compartimentare neacceptată, dar acceptă lipsa ei", () => {
    expect(
      validatePortalRequirements("romimo", { ...complete, layout: "Open space" }).missing.map(
        (m) => m.key,
      ),
    ).toEqual(["layout"]);
    expect(validatePortalRequirements("romimo", { ...complete, layout: null }).ok).toBe(true);
  });

  it("Romimo cere suprafață și încălzire doar pentru case", () => {
    const house = {
      ...complete,
      propertyType: "house",
      builtSurface: null,
      landSurface: null,
      usableSurface: null,
      heatingSystems: [],
    };
    expect(validatePortalRequirements("romimo", house).missing.map((m) => m.key).sort()).toEqual([
      "house_heating",
      "house_space",
      "surface",
    ]);
    const apartment = { ...house, propertyType: "apartment" };
    expect(
      validatePortalRequirements("romimo", apartment).missing.map((m) => m.key).sort(),
    ).toEqual(["surface"]);
  });

  it("Imobiliare.ro: apartamentul fără etaj este blocat, cu mesajul „Etaj”", () => {
    const report = validatePortalRequirements("imobiliare_ro", { ...complete, floor: null });
    expect(report.ok).toBe(false);
    const floor = report.missing.find((m) => m.key === "floor");
    expect(floor?.label).toBe("Etaj");
    // După completarea etajului, portalul devine selectabil.
    expect(validatePortalRequirements("imobiliare_ro", { ...complete, floor: 2 }).ok).toBe(true);
    // Casele nu se blochează pe etaj.
    expect(
      validatePortalRequirements("imobiliare_ro", {
        ...complete,
        propertyType: "house",
        floor: null,
        landSurface: 400,
      }).missing.map((m) => m.key),
    ).not.toContain("floor");
  });

  it("Imobiliare.ro: mansarda fără numărul real al etajului este blocată", () => {
    const report = validatePortalRequirements("imobiliare_ro", {
      ...complete,
      floor: null,
      floorLabel: "Mansardă",
    });
    expect(report.missing.map((m) => m.key)).toContain("floor");
    // Cu etajul real completat, mansarda trece.
    expect(
      validatePortalRequirements("imobiliare_ro", { ...complete, floor: 8, floorLabel: "Mansardă" }).ok,
    ).toBe(true);
  });

  it("Imobiliare.ro: camerele sunt obligatorii la apartamente și case, cu dormitoarele ca rezervă", () => {
    const noRooms = validatePortalRequirements("imobiliare_ro", {
      ...complete,
      rooms: null,
      bedrooms: null,
    });
    expect(noRooms.missing.map((m) => m.key)).toContain("rooms");
    // Dormitoarele acoperă lipsa camerelor (mapperul trimite rooms, fallback bedrooms).
    expect(
      validatePortalRequirements("imobiliare_ro", { ...complete, rooms: null, bedrooms: 2 }).ok,
    ).toBe(true);
    // Terenurile nu cer camere.
    expect(
      validatePortalRequirements("imobiliare_ro", {
        ...complete,
        propertyType: "land",
        rooms: null,
        bedrooms: null,
        landSurface: 500,
      }).missing.map((m) => m.key),
    ).not.toContain("rooms");
  });

  it("Imobiliare.ro: suprafața terenului este obligatorie la case și terenuri", () => {
    const house = validatePortalRequirements("imobiliare_ro", {
      ...complete,
      propertyType: "house",
      floor: null,
      landSurface: null,
    });
    expect(house.missing.map((m) => m.key)).toContain("land_surface");
    // Terenul poate folosi suprafața utilă ca rezervă.
    expect(
      validatePortalRequirements("imobiliare_ro", {
        ...complete,
        propertyType: "land",
        floor: null,
        landSurface: null,
        usableSurface: 600,
      }).missing.map((m) => m.key),
    ).not.toContain("land_surface");
  });

  it("Catalogul Facebook cere preț, coordonate, cel puțin o poză și localitate", () => {
    const report = validatePortalRequirements("facebook_catalog", {
      ...complete,
      price: null,
      lat: 0,
      lng: 0,
      imageCount: 0,
      city: null,
    });
    expect(report.missing.map((m) => m.key).sort()).toEqual([
      "city",
      "coordinates",
      "images",
      "price",
    ]);
    expect(validatePortalRequirements("facebook_catalog", complete).ok).toBe(true);
  });

  it("un portal fără cerințe suplimentare rămâne selectabil", () => {
    // PrimulAnunț cere doar setul minim; o ofertă completă trece fără blocaje.
    expect(validatePortalRequirements("primulanunt", complete).ok).toBe(true);
    expect(validatePortalRequirements("vdi", complete).ok).toBe(true);
  });
});
