import { describe, expect, it } from "vitest";
import { acpAgeWeight, runAcpAnalysis, type AcpCandidate } from "./engine";
import { inactiveOfferLabel } from "./analyses.functions";

const now = "2026-10-27T12:00:00Z";
const target = { propertyType: "apartment", transactionType: "sale", city: "Chiajna", county: "Ilfov", rooms: 2, usableArea: 55, price: 80000, currency: "EUR" };
const cand = (key: string, ppsm: number, status: string, lastSeenAt: string): AcpCandidate => ({
  key, sourceType: "portal", sourceName: "Storia", title: key,
  subject: { ...target, price: ppsm * 55, pricePerSqm: ppsm },
  meta: { status, lastSeenAt, firstSeenAt: lastSeenAt, currentPrice: ppsm * 55 },
});

describe("ACP v5: inactive market offers", () => {
  it("weights active 1, inactive less with age, excludes older than 12 months", () => {
    expect(acpAgeWeight({ status: "active", lastSeenAt: "2025-01-01T00:00:00Z" }, now)).toBe(1);
    expect(acpAgeWeight({ status: "inactive", lastSeenAt: "2026-10-27T12:00:00Z" }, now)).toBe(0.9);
    expect(acpAgeWeight({ status: "inactive", lastSeenAt: "2026-04-27T12:00:00Z" }, now)).toBeCloseTo(0.65, 1);
    expect(acpAgeWeight({ status: "inactive", lastSeenAt: "2025-10-01T00:00:00Z" }, now)).toBeNull();
  });

  it("uses an inactive comparable, ranks it after active ones and excludes a 13-month-old one", () => {
    const r = runAcpAnalysis(target, [
      cand("old", 1300, "inactive", "2026-04-15T00:00:00Z"),
      cand("a1", 1500, "active", "2026-10-26T00:00:00Z"),
      cand("a2", 1520, "active", "2026-10-26T00:00:00Z"),
      cand("ancient", 900, "inactive", "2025-09-01T00:00:00Z"),
    ], {}, { now, engineVersion: 5 });
    const old = r.comparables.find((c) => c.key === "old")!;
    expect(old.isSelected).toBe(true);
    expect(old.ageWeight).toBeLessThan(1);
    expect(r.comparables.find((c) => c.key === "ancient")!.isSelected).toBe(false);
    expect(r.comparables.slice(0, 2).map((c) => c.key).sort()).toEqual(["a1", "a2"]);
  });

  it("labels the offer with its month", () => {
    expect(inactiveOfferLabel("2026-04-15T00:00:00Z")).toBe("ofertă din aprilie 2026, nu mai e activă");
  });
});
