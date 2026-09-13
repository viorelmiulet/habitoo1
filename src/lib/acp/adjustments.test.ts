import { describe, expect, it } from "vitest";
import { calculateAdjustments } from "./adjustments";
import type { AcpSubject } from "./scoring";

const base: AcpSubject = {
  propertyType: "apartament",
  transactionType: "sale",
  city: "Bucuresti",
  district: "Titan",
  rooms: 3,
  usableArea: 70,
  floor: 3,
  totalFloors: 8,
  constructionYear: 2010,
  condition: "buna",
  parking: true,
  balcony: true,
  furnished: false,
  price: 140_000,
  currency: "EUR",
  pricePerSqm: 2000,
};

describe("calculateAdjustments", () => {
  it("nu ajustează nimic pentru un comparabil identic", () => {
    const result = calculateAdjustments(base, { ...base });
    expect(result.adjustments).toHaveLength(0);
    expect(result.totalAmount).toBe(0);
    expect(result.adjustedPrice).toBe(140_000);
  });

  it("ajustează suprafața cu prețul pe mp al comparabilului", () => {
    const candidate: AcpSubject = { ...base, usableArea: 60, price: 120_000, pricePerSqm: 2000 };
    const result = calculateAdjustments(base, candidate);
    const area = result.adjustments.find((a) => a.factor === "area");
    // ținta are 10 mp mai mult × 2000 EUR/mp
    expect(area?.amount).toBe(20_000);
    expect(result.adjustedPrice).toBe(140_000);
  });

  it("nu ajustează camerele când suprafața este disponibilă (evită dubla numărare)", () => {
    const candidate: AcpSubject = { ...base, rooms: 2 };
    const result = calculateAdjustments(base, candidate);
    expect(result.adjustments.some((a) => a.factor === "rooms")).toBe(false);
  });

  it("ajustează camerele când suprafața lipsește la ambele", () => {
    const target = { ...base, usableArea: null, pricePerSqm: null };
    const candidate = { ...base, usableArea: null, pricePerSqm: null, rooms: 2 };
    const result = calculateAdjustments(target, candidate);
    const rooms = result.adjustments.find((a) => a.factor === "rooms");
    expect(rooms?.percent).toBe(4);
    expect(rooms?.amount).toBe(5600);
  });

  it("nu aplică ajustări pentru factori fără date", () => {
    const candidate: AcpSubject = { ...base, constructionYear: null, condition: null };
    const result = calculateAdjustments(base, candidate);
    expect(result.skipped).toContain("year");
    expect(result.skipped).toContain("condition");
    expect(result.adjustments.some((a) => a.factor === "year")).toBe(false);
  });

  it("penalizează comparabilul care are parcare când ținta nu are", () => {
    const target = { ...base, parking: false };
    const result = calculateAdjustments(target, base);
    const parking = result.adjustments.find((a) => a.factor === "parking");
    expect(parking?.amount).toBeLessThan(0);
    expect(result.adjustedPrice).toBeLessThan(140_000);
  });

  it("returnează null când comparabilul nu are preț", () => {
    const result = calculateAdjustments(base, { ...base, price: null });
    expect(result.adjustedPrice).toBeNull();
    expect(result.adjustments).toHaveLength(0);
  });

  it("plafonează ajustarea de vechime", () => {
    const candidate: AcpSubject = { ...base, constructionYear: 1900 };
    const result = calculateAdjustments(base, candidate);
    const year = result.adjustments.find((a) => a.factor === "year");
    expect(year?.percent).toBe(8);
  });

  it("ignoră ajustările nesemnificative", () => {
    const candidate: AcpSubject = { ...base, usableArea: 69.99, price: 139_980 };
    const result = calculateAdjustments(base, candidate);
    expect(result.adjustments.some((a) => a.factor === "area")).toBe(false);
    expect(result.skipped).toContain("area");
  });
});
