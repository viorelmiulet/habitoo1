import { describe, expect, it, vi } from "vitest";
import { mapPropertyToStoria } from "./mapper";
import { storiaAgentPhotoUrl } from "./agent-photo";
import { agentPhotoRedirect } from "@/lib/site-feed/media-redirect.server";
import type { PropertyImageRow, PropertyRow } from "@/lib/site-feed/mapper";

const PID = "22222222-2222-2222-2222-222222222222";
const images = [{ id: "a", is_primary: true, position: 0, is_confidential: false, include_in_publish: true, url: "https://cdn.test/a.jpg" }] as unknown as PropertyImageRow[];
const prop = {
  id: "11111111-1111-1111-1111-111111111111", title: "Apartament 3 camere Cotroceni", description: "x".repeat(120),
  property_type: "apartment", transaction_kind: "sale", status: "active", publish_status: "published", deleted_at: null,
  for_sale: true, for_rent: false, sale_price: 129000, sale_currency: "EUR", currency: "EUR", rooms: 3, usable_surface: 78,
  lat: 44.43, lng: 26.06, location_precise: true, county: "București", city: "București", reference: "HBT-7", negotiable: false,
} as unknown as PropertyRow;
const agent = { full_name: "Ana", email: "ana@test.ro", phone: "0722333444" } as never;
const base = "https://crm.habitoo.ro";

function fakeDb(profile: Record<string, unknown> | null) {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: profile }) };
  return {
    from: () => q,
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://storage.test/x.jpg" }, error: null }) }) },
  } as never;
}

describe("Storia contact.photo", () => {
  it("agent cu poză → contact.photo", () => {
    const url = storiaAgentPhotoUrl(base, { id: PID, avatar_url: "u/a.jpg", is_active: true, public_profile_hidden: false });
    expect(url).toBe(`${base}/api/public/sites/v1/media/agent/${PID}?w=400&h=400&fit=cover`);
    const r = mapPropertyToStoria(prop, { baseUrl: base, images, agent, agentPhotoUrl: url });
    if (!r.ok) throw new Error("blocked");
    expect(r.listings[0]!.advert.contact?.photo).toBe(url);
  });
  it("agent fără poză → fără cheia photo, publicarea nu e blocată", () => {
    const url = storiaAgentPhotoUrl(base, { id: PID, avatar_url: null });
    expect(url).toBeNull();
    const r = mapPropertyToStoria(prop, { baseUrl: base, images, agent, agentPhotoUrl: url });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("photo" in (r.listings[0]!.advert.contact ?? {})).toBe(false);
    expect(storiaAgentPhotoUrl(base, { id: PID, avatar_url: "a.jpg", public_profile_hidden: true })).toBeNull();
  });
});

describe("ruta media/agent (singura rută pentru poza agentului)", () => {
  it("404 fără poză", async () => {
    const res = await agentPhotoRedirect(PID, fakeDb({ id: PID, avatar_url: null, is_active: true }));
    expect(res.status).toBe(404);
  });
  it("agent cu poză → trimite spre fișierul pozei", async () => {
    const res = await agentPhotoRedirect(PID, fakeDb({ id: PID, avatar_url: "a.jpg", is_active: true }), { width: 400, height: 400, resize: "cover" });
    expect([200, 302]).toContain(res.status);
  });
});
