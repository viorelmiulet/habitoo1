import { describe, expect, it } from "vitest";
import { matchingPropertyIds, parsePromotionSelection, promotionFilterGroups, type PropertyPromotionInfo } from "@/lib/portals/promotion-filter";
import { promotionFilterLabel, togglePromotionValue } from "@/lib/portals/promotion-filter";

const plain: PropertyPromotionInfo = { imobiliarePublished: false, imobiliareActiveServices: [], flagPromotions: [] };
const infos = new Map<string, PropertyPromotionInfo>([
  ["a", { ...plain, imobiliarePublished: true, imobiliareActiveServices: ["tl"] }],
  ["b", { ...plain, imobiliarePublished: true, imobiliareActiveServices: ["bonus"] }],
  ["c", plain],
]);
const autoRenew = new Map([["a", true], ["b", false], ["c", true]]);
const errors = [
  { property_id: "a", portal_key: "imospot", enabled: true, status: "error" },
  { property_id: "b", portal_key: "vdi", enabled: true, status: "error" },
  { property_id: "c", portal_key: "storia", enabled: true, status: "error" },
  { property_id: "disabled", portal_key: "imospot", enabled: false, status: "error" },
  { property_id: "published", portal_key: "imospot", enabled: true, status: "published" },
  { property_id: "c", portal_key: "olx_direct", enabled: true, status: "error" },
];
const match = (raw: string) => matchingPropertyIds(parsePromotionSelection(raw), infos, autoRenew, errors, ["a", "b", "c", "plain"]);

describe("erori în filtrul Promovare", () => {
  it("include toate portalurile activate, fără Facebook, în ordinea cerută", () => {
    const groups = promotionFilterGroups(new Set(["vdi", "storia", "imospot", "clickimob", "lacheie", "romimo", "imobiliare_ro", "facebook_catalog"]));
    expect(groups.map((g) => g.portalId)).toEqual(["imobiliare_ro", "romimo", "storia", "clickimob", "imospot", "lacheie", "vdi"]);
    expect(groups.every((g) => g.options.some((o) => o.value === `${g.portalId}:error`))).toBe(true);
  });
  it("deduplică erorile și nu interpretează eroarea Imobiliare ca serviciu", () => {
    const selection = parsePromotionSelection("imobiliare_ro:error,imobiliare_ro:error,facebook_catalog:error,unknown:error");
    expect(selection.errorPortals).toEqual(["imobiliare_ro"]);
    expect(selection.imobiliareServices).toEqual([]);
  });
  it("cere enabled și status error", () => { expect(match("imospot:error")).toEqual(["a"]); });
  it("combină erorile cu SAU", () => { expect(match("imospot:error,vdi:error")).toEqual(["a", "b"]); });
  it("Storia + OLX folosește doar erorile Storia", () => {
    expect(match("storia:error")).toEqual(["c"]);
    expect(matchingPropertyIds(parsePromotionSelection("storia:error"), infos, autoRenew, errors.filter((e) => e.portal_key === "olx_direct"))).toEqual([]);
  });
  it("combină promovări și prelungire cu ȘI, nu SAU", () => { expect(match("imobiliare_ro:tl,imobiliare_ro:bonus,storia:auto_renew_on")).toEqual(["a"]); });
  it("combină prelungire și erori cu ȘI", () => { expect(match("storia:auto_renew_on,imospot:error,vdi:error")).toEqual(["a"]); });
  it("intersectează toate cele trei tipuri", () => { expect(match("imobiliare_ro:tl,storia:auto_renew_on,vdi:error")).toEqual([]); });
  it("Orice promovare păstrează intersecția cu erori", () => { expect(match("any,storia:error")).toEqual([]); });
  it("Fără promovare se intersectează cu prelungirea și erorile", () => { expect(match("none,storia:auto_renew_on,storia:error")).toEqual(["c"]); });
  it("ambele valori de prelungire se combină cu SAU", () => { expect(match("storia:auto_renew_on,storia:auto_renew_off")).toEqual(["a", "b", "c"]); });
  it("Orice/Fără înlocuiesc numai promovările", () => {
    expect(togglePromotionValue(["imobiliare_ro:tl", "imospot:error", "storia:auto_renew_on"], "none")).toEqual(["imospot:error", "storia:auto_renew_on", "none"]);
    expect(togglePromotionValue(["any", "imospot:error"], "storia:auto_renew_on")).toEqual(["any", "imospot:error", "storia:auto_renew_on"]);
    expect(togglePromotionValue(["none", "storia:auto_renew_on"], "imospot:error")).toEqual(["none", "storia:auto_renew_on", "imospot:error"]);
  });
  it("serviciile înlocuiesc numai Orice/Fără", () => {
    expect(togglePromotionValue(["none", "storia:auto_renew_on", "imospot:error"], "imobiliare_ro:tl")).toEqual(["storia:auto_renew_on", "imospot:error", "imobiliare_ro:tl"]);
  });
});