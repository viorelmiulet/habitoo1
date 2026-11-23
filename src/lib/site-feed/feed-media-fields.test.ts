import { describe, expect, it } from "vitest";
import { mapPropertyToFeed, type PropertyImageRow, type PropertyRow } from "./mapper";
import { mapDevelopmentToFeed, type DevelopmentRow } from "./developments";

const base = "https://crm.habitoo.ro";
const img = (id: string, over: Partial<PropertyImageRow> = {}) =>
  ({ id, property_id: "p", is_primary: false, position: 1, include_in_publish: true, is_confidential: false, is_floor_plan: false, ...over }) as PropertyImageRow;
const prop = (over: Partial<PropertyRow> = {}) =>
  ({ id: "p", title: "Apartament", property_type: "apartment", transaction_kind: "sale", status: "active", development_id: null, video_url: null, virtual_tour_url: null, ...over }) as PropertyRow;

describe("feed: video, tur virtual, releveu, preț la cerere", () => {
  it("proprietate cu video, tur și releveu → câmpurile apar, releveul e și în images", () => {
    const images = [img("a", { is_primary: true, position: 0 }), img("plan", { is_floor_plan: true })];
    const f = mapPropertyToFeed(prop({ video_url: "https://www.youtube.com/watch?v=abcdefghijk", virtual_tour_url: "https://my.matterport.com/show/?m=AbCdEf12345" }), { baseUrl: base, images });
    expect(f.video_url).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(f.tur_virtual_url).toBe("https://my.matterport.com/show/?m=AbCdEf12345");
    expect(f.releveu).toBe(`${base}/api/public/sites/v1/media/plan`);
    expect(f.images.map((i) => i.src)).toContain(f.releveu);
    expect(f.images.find((i) => i.src === f.releveu)?.tip).toBe("galerie");
  });
  it("shortlink → null", () => {
    expect(mapPropertyToFeed(prop({ video_url: "https://youtu.be/abc" }), { baseUrl: base }).video_url).toBeNull();
  });
  it("unitate dintr-un ansamblu cu preț ascuns → pret_la_cerere true", () => {
    expect(mapPropertyToFeed(prop({ development_id: "d" }), { baseUrl: base, developmentHidePrice: true }).pret_la_cerere).toBe(true);
  });
  it("proprietate simplă → pret_la_cerere false", () => {
    const f = mapPropertyToFeed(prop(), { baseUrl: base, developmentHidePrice: true });
    expect(f.pret_la_cerere).toBe(false);
    expect(f.releveu).toBeNull();
  });
  it("ansamblu → site_dezvoltator și pret_la_cerere", () => {
    const d = { id: "d", name: "A", amenities: [], storia_hide_price: true, developer_website: "https://dev.ro", price_from: null, price_to: null, currency: "EUR", lat: null, lng: null, location_precise: false, created_at: "x", updated_at: "x" } as unknown as DevelopmentRow;
    const f = mapDevelopmentToFeed(d, [], [], base);
    expect(f.pret_la_cerere).toBe(true);
    expect(f.site_dezvoltator).toBe("https://dev.ro");
    expect(mapDevelopmentToFeed({ ...d, storia_hide_price: false, developer_website: null }, [], [], base)).toMatchObject({ pret_la_cerere: false, site_dezvoltator: null });
  });
});
