import { describe, expect, it } from "vitest";
import { mapPropertyToStoria } from "./mapper";
import { floorPlanChanges } from "@/lib/property-images/floor-plan";
import type { PropertyImageRow, PropertyRow } from "@/lib/site-feed/mapper";

const img = (id: string, over: Partial<PropertyImageRow> = {}) =>
  ({ id, is_primary: false, is_floor_plan: false, position: 1, is_confidential: false, include_in_publish: true, url: `https://cdn.test/${id}.jpg`, ...over }) as unknown as PropertyImageRow;
const p = {
  id: "11111111-1111-1111-1111-111111111111", title: "Apartament 3 camere Cotroceni", description: "x".repeat(120),
  property_type: "apartment", transaction_kind: "sale", status: "active", publish_status: "published", deleted_at: null,
  for_sale: true, for_rent: false, sale_price: 129000, sale_currency: "EUR", currency: "EUR", rooms: 3, usable_surface: 78,
  lat: 44.43, lng: 26.06, location_precise: true, county: "București", city: "București", reference: "HBT-7", negotiable: false,
} as unknown as PropertyRow;
const agent = { full_name: "Ana Popescu", email: "ana@test.ro", phone: "0722333444" } as never;
const base = "https://crm.habitoo.ro";

describe("Storia floor_plan", () => {
  it("trimite releveul în floor_plan și nu în images", () => {
    const r = mapPropertyToStoria(p, { baseUrl: base, agent, images: [img("a", { is_primary: true, position: 0 }), img("plan", { is_floor_plan: true })] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ad = r.listings[0]!.advert;
    expect(ad.floor_plan).toContain("plan");
    expect(ad.images.map((i) => i.url).some((u) => u.includes("plan"))).toBe(false);
    expect(ad.images).toHaveLength(1);
  });
  it("fără releveu nu există floor_plan", () => {
    const r = mapPropertyToStoria(p, { baseUrl: base, agent, images: [img("a", { is_primary: true }), img("b")] });
    expect(r.ok && "floor_plan" in r.listings[0]!.advert).toBe(false);
    expect(r.ok && r.listings[0]!.advert.images.length).toBe(2);
  });
  it("releveul singur blochează cu mesajul existent", () => {
    const r = mapPropertyToStoria(p, { baseUrl: base, agent, images: [img("plan", { is_floor_plan: true })] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain("Oferta nu are nicio imagine publicabilă (Storia cere minimum una).");
  });
});

describe("marcarea releveului", () => {
  const imgs = [{ id: "cover", is_primary: true, is_floor_plan: false }, { id: "a", is_primary: false, is_floor_plan: true }, { id: "b", is_primary: false, is_floor_plan: false }];
  it("a doua marcare o înlocuiește pe prima", () => {
    expect(floorPlanChanges(imgs, "b", true)).toEqual([{ id: "a", is_floor_plan: false }, { id: "b", is_floor_plan: true }]);
  });
  it("poza de copertă nu poate fi marcată", () => {
    expect(() => floorPlanChanges(imgs, "cover", true)).toThrow(/copertă/);
  });
});
