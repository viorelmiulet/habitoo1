import { describe, expect, it } from "vitest";
import { buildImospotOffers, safePortalUrl } from "../public-links";

describe("safePortalUrl", () => {
  it("acceptă doar https pe domeniul portalului", () => {
    expect(safePortalUrl("https://www.homepitch.ro/p/1", "homepitch.ro")).toBe("https://www.homepitch.ro/p/1");
    expect(safePortalUrl("http://homepitch.ro/p/1", "homepitch.ro")).toBeNull();
    expect(safePortalUrl("https://evilhomepitch.ro/p", "homepitch.ro")).toBeNull();
    expect(safePortalUrl("https://homepitch.ro.evil.com/p", "homepitch.ro")).toBeNull();
    expect(safePortalUrl(null, "homepitch.ro")).toBeNull();
  });
});

describe("buildImospotOffers", () => {
  it("salvează ambele anunțuri, cu tranzacția fiecăruia", () => {
    const r = buildImospotOffers([
      { externalId: "HBT-x-SALE", transaction: "sale", id: "11", url: "https://imospot.ro/a/11" },
      { externalId: "HBT-x-RENT", transaction: "rent", id: "12", url: "https://www.imospot.ro/a/12" },
    ]);
    expect(r.publicUrl).toBe("https://imospot.ro/a/11");
    expect(r.offers.map((o) => [o.transaction, o.url])).toEqual([
      ["sale", "https://imospot.ro/a/11"],
      ["rent", "https://www.imospot.ro/a/12"],
    ]);
  });
  it("ignoră linkurile străine sau lipsă", () => {
    const r = buildImospotOffers([
      { externalId: "a", transaction: "sale", id: null, url: "https://example.com/x" },
      { externalId: "b", transaction: "rent", id: null, url: null },
    ]);
    expect(r).toEqual({ publicUrl: null, offers: [] });
  });
});
