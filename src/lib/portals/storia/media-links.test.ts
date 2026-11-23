import { describe, expect, it } from "vitest";
import { mapPropertyToStoria } from "./mapper";
import { mediaLinkError } from "@/lib/property-media/links";
import type { PropertyImageRow, PropertyRow } from "@/lib/site-feed/mapper";

const images = [{ id: "a", is_primary: true, position: 0, is_confidential: false, include_in_publish: true, url: "https://cdn.test/a.jpg" }] as unknown as PropertyImageRow[];
const prop = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-1111-1111-111111111111", title: "Apartament 3 camere Cotroceni", description: "x".repeat(120),
  property_type: "apartment", transaction_kind: "sale", status: "active", publish_status: "published", deleted_at: null,
  for_sale: true, for_rent: false, sale_price: 129000, sale_currency: "EUR", currency: "EUR", rooms: 3, usable_surface: 78,
  lat: 44.43, lng: 26.06, location_precise: true, county: "București", city: "București", reference: "HBT-7", negotiable: false, ...over,
}) as unknown as PropertyRow;
const opts = { baseUrl: "https://crm.habitoo.ro", images, agent: { full_name: "Ana", email: "ana@test.ro", phone: "0722333444" } as never };
const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const MP = "https://my.matterport.com/show/?m=abc123XYZ";

describe("Storia movie_url / virtual_walk", () => {
  it("trimite ambele linkuri", () => {
    const r = mapPropertyToStoria(prop({ video_url: YT, virtual_tour_url: MP }), opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listings[0]!.advert.movie_url).toBe(YT);
    expect(r.listings[0]!.advert.virtual_walk).toBe(MP);
  });
  it("fără linkuri, cheile lipsesc", () => {
    const r = mapPropertyToStoria(prop(), opts);
    if (!r.ok) throw new Error("blocked");
    expect("movie_url" in r.listings[0]!.advert).toBe(false);
    expect("virtual_walk" in r.listings[0]!.advert).toBe(false);
  });
  it("youtu.be e respins la salvare și omis la Storia cu avertisment", () => {
    expect(mediaLinkError("https://youtu.be/dQw4w9WgXcQ", "video")).toMatch(/link scurt/);
    const r = mapPropertyToStoria(prop({ video_url: "https://youtu.be/dQw4w9WgXcQ" }), opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("movie_url" in r.listings[0]!.advert).toBe(false);
    expect(r.warnings.some((w) => w.includes("Nu se trimite la Storia"))).toBe(true);
  });
  it("Matterport acceptat ca tur virtual, nu ca video", () => {
    expect(mediaLinkError(MP, "virtual_tour")).toBeNull();
    expect(mediaLinkError(MP, "video")).not.toBeNull();
    expect(mediaLinkError("http://my.matterport.com/show/?m=x", "virtual_tour")).toMatch(/https/);
  });
});
