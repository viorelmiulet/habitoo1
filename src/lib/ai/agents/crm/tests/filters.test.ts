import { describe, expect, it } from "vitest";
import { parseCrmQuery } from "../filters";

describe("parseCrmQuery", () => {
  it("recunoaște lead-urile fără follow-up", () => {
    const filters = parseCrmQuery("Care clienți nu au primit follow-up?");
    expect(filters.intent).toBe("leads_without_followup");
  });

  it("extrage numărul de zile fără activitate", () => {
    const filters = parseCrmQuery("Ce lead-uri nu au mai fost contactate de 7 zile?");
    expect(filters.intent).toBe("leads_stale");
    expect(filters.days).toBe(7);
  });

  it("extrage camere și zonă", () => {
    const filters = parseCrmQuery(
      "Arată-mi clienții care caută apartament cu 2 camere în Militari",
    );
    expect(filters.roomsMin).toBe(2);
    expect(filters.propertyType).toBe("apartment");
    expect(filters.city).toBe("militari");
  });

  it("extrage bugetul maxim scris cu separatori", () => {
    const filters = parseCrmQuery("Ce clienți sunt interesați de proprietăți sub 100.000 EUR?");
    expect(filters.maxPrice).toBe(100000);
  });

  it("recunoaște prioritățile zilei", () => {
    expect(parseCrmQuery("Care sunt lead-urile mele prioritare azi?").intent).toBe("priorities");
    expect(parseCrmQuery("Care sunt lead-urile mele prioritare azi?").mineOnly).toBe(true);
  });

  it("recunoaște lead-urile din prospectare", () => {
    const filters = parseCrmQuery("Arată-mi lead-urile provenite din prospectare");
    expect(filters.intent).toBe("imported_prospects");
    expect(filters.source).toBe("prospecting");
  });

  it("recunoaște cererea de potrivire", () => {
    expect(parseCrmQuery("Ce proprietăți se potrivesc clientului Ion?").intent).toBe(
      "client_matching",
    );
  });

  it("nu inventează filtre pentru un text fără criterii", () => {
    const filters = parseCrmQuery("Bună ziua");
    expect(filters.days).toBeNull();
    expect(filters.city).toBeNull();
    expect(filters.maxPrice).toBeNull();
    expect(filters.stage).toBeNull();
  });

  it("este determinist: aceeași întrebare → aceleași filtre", () => {
    const question = "Ce lead-uri noi am în Cluj sub 90.000 EUR?";
    expect(parseCrmQuery(question)).toEqual(parseCrmQuery(question));
  });
});
