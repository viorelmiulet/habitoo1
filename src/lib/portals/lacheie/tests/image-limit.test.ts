import { describe, expect, it } from "vitest";
import { buildLaCheieOffer, type LaCheiePropertyInput } from "../mapper";
import { orderLaCheieImages } from "../images";
import { checkListing, type ListingCheckInput } from "@/lib/listing-check/rules";

const property: LaCheiePropertyInput = {
  id: "property-1", title: "Apartament luminos cu trei camere", description: "Apartament luminos situat aproape de parc și mijloace de transport.",
  price: 100000, currency: "EUR", transaction: "sale", category: "apartment", propertyTypeId: "1", countyId: "2", cityId: "3",
  area: 70, bedrooms: 2, bathrooms: 1, yearBuilt: 2010,
};
const agent = { external_id: "agent-1", full_name: "Ana Pop", phone: "0722123456" };
const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(3, "0"), position: i, is_primary: i === n - 1 }));
const urls = (n: number) => orderLaCheieImages(photos(n)).map((p) => `https://crm.habitoo.ro/media/${p.id}`);

describe("La Cheie: galerie limitată fără blocare", () => {
  it("45 poze: exact 30, principala prima și celelalte în ordinea Habitoo", () => {
    const result = buildLaCheieOffer({ ...property, images: urls(45) }, agent);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("ofertă blocată");
    expect(result.offer.images).toHaveLength(30);
    expect(result.offer.images).toEqual(["https://crm.habitoo.ro/media/044", ...Array.from({ length: 29 }, (_, i) => `https://crm.habitoo.ro/media/${String(i).padStart(3, "0")}`)]);
  });
  it("20 poze: toate 20", () => {
    const result = buildLaCheieOffer({ ...property, images: urls(20) }, agent);
    if (!result.ok) throw new Error("ofertă blocată");
    expect(result.offer.images).toEqual(urls(20));
    expect(result.offer.images).toHaveLength(20);
    expect(result.warnings).toEqual([]);
  });
  it("avertismentul este separat de validarea blocantă", () => {
    const result = buildLaCheieOffer({ ...property, images: urls(45) }, agent);
    if (!result.ok) throw new Error("ofertă blocată");
    expect(result.warnings).toEqual(["La Cheie: se trimit primele 30 din 45 poze."]);
  });
  it("actualizarea/republicarea păstrează aceeași ordine inclusiv la poziții egale", () => {
    const input = photos(45).map((p) => ({ ...p, position: 0 }));
    const ordered = orderLaCheieImages(input);
    expect(orderLaCheieImages([...input].reverse())).toEqual(ordered);
    const build = () => buildLaCheieOffer({ ...property, images: ordered.map((p) => `https://a.ro/${p.id}.jpg`) }, agent);
    const a = build(), b = build();
    if (!a.ok || !b.ok) throw new Error("ofertă blocată");
    expect(a.offer.images).toEqual(b.offer.images);
    expect(a.offer.images).toHaveLength(30);
  });
});

function checkInput(n: number): ListingCheckInput {
  return {
    property: { status: "active", publish_status: "published" },
    images: photos(n).map((p) => ({ isPrimary: p.is_primary, isConfidential: false, includeInPublish: true, storagePath: p.id, sourceUrl: null, url: null })),
    publications: [{ portal: "lacheie", portalName: "La Cheie", enabled: true, lastError: "Oferta are 45 imagini publicabile, iar La Cheie acceptă maximum 30." }],
    portalReports: [], duplicateDescription: false, zoneMedianPerSqm: null,
  };
}
describe("Verifică anunțul: La Cheie", () => {
  it("nu ascunde alte erori care însoțeau limita veche", () => {
    const input = checkInput(45);
    input.publications = [{ portal: "lacheie", portalName: "La Cheie", enabled: true, lastError: "Oferta nu poate fi trimisă la La Cheie: Lipsește prețul. Oferta are 45 imagini publicabile, iar La Cheie acceptă maximum 30. Reduce numărul înainte de publicare." }];
    expect(checkListing(input).issues.find((i) => i.code === "portal_error:lacheie")).toMatchObject({ severity: "required", message: "La Cheie: Oferta nu poate fi trimisă la La Cheie: Lipsește prețul." });
  });
  it("avertizează fără eroare obligatorie pentru limita veche", () => {
    const r = checkListing(checkInput(45));
    expect(r.issues.find((i) => i.code === "lacheie_images_limit")).toMatchObject({ severity: "optional", message: "La Cheie: se trimit primele 30 din 45 poze." });
    expect(r.issues.some((i) => i.code === "portal_error:lacheie")).toBe(false);
  });
  it("numără doar pozele publicabile și numai dacă La Cheie este bifat", () => {
    const input = checkInput(45);
    input.images.forEach((p, i) => { if (i >= 20) p.isConfidential = true; });
    expect(checkListing(input).issues.some((i) => i.code === "lacheie_images_limit")).toBe(false);
    input.publications = [{ portal: "homepitch", portalName: "HomePitch", enabled: true, lastError: "acceptă maximum 30" }];
    expect(checkListing(input).issues.some((i) => i.code === "portal_error:homepitch")).toBe(true);
  });
});