import { describe, expect, it } from "vitest";
import { imobiliareFloorReasons } from "../mapper";
import { syncFloor } from "@/lib/property-floor";

const apt = (floor: number | null, floorLabel: string | null) =>
  imobiliareFloorReasons({ propertyType: "apartment", floor, floorLabel });

describe("etaj Imobiliare.ro", () => {
  it("demisol (-1) nu mai cere „Completează etajul”, ci valoarea neconfirmată", () => {
    const r = apt(-1, "Demisol");
    expect(r).not.toContain("Completează etajul");
    expect(r).toEqual(["Imobiliare.ro: valoarea pentru Demisol nu e confirmată"]);
  });
  it("parter și parter înalt → 0, acceptat", () => {
    expect(apt(syncFloor("Parter", null).floor, "Parter")).toEqual([]);
    expect(apt(syncFloor("Parter înalt", null).floor, "Parter înalt")).toEqual([]);
  });
  it("mansardă fără etaj → mesaj clar", () => {
    expect(apt(null, "Mansardă")).toEqual(["Imobiliare.ro: valoarea pentru Mansardă nu e confirmată"]);
  });
  it("fără etaj → Completează etajul", () => {
    expect(apt(null, null)).toEqual(["Completează etajul"]);
  });
});
