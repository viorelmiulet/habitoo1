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
});
