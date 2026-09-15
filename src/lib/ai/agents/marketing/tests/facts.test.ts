/**
 * Stage 16 — verificarea factuală a Marketing Agent.
 * Regula testată: marketingul poate schimba tonul, niciodată faptele.
 */
import { describe, expect, it } from "vitest";
import {
  buildMarketingFactSheet,
  marketingContextHash,
  mergeMarketingValidation,
  missingMarketingData,
  validateMarketingFacts,
  validateMarketingLimits,
} from "../facts";

const row: Record<string, unknown> = {
  id: "11111111-1111-4111-8111-111111111111",
  reference: "HB-100",
  title: "Apartament 3 camere Militari",
  description: "Apartament luminos, bloc reabilitat.",
  property_type: "apartment",
  transaction_kind: "sale",
  status: "active",
  currency: "EUR",
  price: 89000,
  usable_surface: 72,
  rooms: 3,
  bathrooms: 1,
  floor: 4,
  building_floors: 8,
  build_year: 1985,
  city: "București",
  district: "Militari",
  features: ["balcon", "aer condiționat"],
};

const facts = buildMarketingFactSheet(row);

describe("marketing fact sheet", () => {
  it("preia doar datele existente ale proprietății", () => {
    expect(facts.numbers.rooms).toBe(3);
    expect(facts.numbers.usableSurface).toBe(72);
    expect(facts.numbers.price).toBe(89000);
    expect(facts.location.district).toBe("Militari");
    expect(facts.features).toContain("balcon");
  });

  it("amprenta contextului este stabilă și se schimbă cu datele", () => {
    expect(marketingContextHash(facts)).toBe(marketingContextHash(buildMarketingFactSheet(row)));
    expect(marketingContextHash(buildMarketingFactSheet({ ...row, rooms: 4 }))).not.toBe(
      marketingContextHash(facts),
    );
  });
});

describe("validateMarketingFacts", () => {
  it("acceptă un text care folosește doar datele reale", () => {
    const text =
      "Apartament cu 3 camere în Militari, București, 72 mp utili, etaj 4, preț 89000 EUR. Balcon și aer condiționat.";
    const result = validateMarketingFacts(text, facts);
    expect(result.status).toBe("valid");
    expect(result.issues).toHaveLength(0);
  });

  it("respinge suprafața inventată", () => {
    const result = validateMarketingFacts("Apartament de 95 mp utili în Militari.", facts);
    expect(result.status).toBe("invalid");
    expect(result.issues.some((issue) => issue.type === "invented_number")).toBe(true);
  });

  it("respinge numărul de camere inventat", () => {
    const result = validateMarketingFacts("Apartament cu 5 camere, ideal familie.", facts);
    expect(result.status).toBe("invalid");
  });

  it("respinge prețul inventat", () => {
    const result = validateMarketingFacts("Se vinde la doar 75000 EUR.", facts);
    expect(result.status).toBe("invalid");
  });

  it("respinge distanțele și facilitățile de zonă inexistente", () => {
    const metro = validateMarketingFacts("La 5 minute de metrou.", facts);
    expect(metro.status).toBe("invalid");
    expect(metro.issues.some((issue) => issue.type === "unverifiable_claim")).toBe(true);
  });

  it("respinge promisiunile de randament și superlativele garantate", () => {
    const result = validateMarketingFacts(
      "Cea mai bună investiție din zonă, randament garantat.",
      facts,
    );
    expect(result.status).toBe("invalid");
    expect(result.issues.some((issue) => issue.type === "banned_claim")).toBe(true);
  });

  it("limitele canalului sunt avertisment, nu invenție factuală", () => {
    const issues = validateMarketingLimits(
      { title: "T".repeat(100), body: "B".repeat(50) },
      { maxTitle: 70, maxBody: 3000 },
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("warning");
    const merged = mergeMarketingValidation({ status: "valid", issues: [] }, issues);
    expect(merged.status).toBe("warning");
  });
});

describe("missingMarketingData", () => {
  it("datele lipsă devin întrebări, nu presupuneri", () => {
    const sparse = buildMarketingFactSheet({ id: "x", property_type: "apartment" });
    const missing = missingMarketingData(sparse);
    const fields = missing.map((item) => item.field);
    expect(fields).toContain("surface");
    expect(fields).toContain("rooms");
    expect(fields).toContain("price");
    for (const item of missing) expect(item.question.endsWith("?")).toBe(true);
  });

  it("o fișă completă nu cere date esențiale", () => {
    const fields = missingMarketingData(facts).map((item) => item.field);
    expect(fields).not.toContain("rooms");
    expect(fields).not.toContain("price");
  });
});
