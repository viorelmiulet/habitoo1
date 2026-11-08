import { describe, expect, it } from "vitest";
import { generateExtensionToken, serveExtension, sha256Hex, type ExtensionStore } from "./core";
import { composePostText, facebookPostHandler, myListingsHandler, type ExtListingRow, type ExtListingsStore } from "./listings";

const ORG = "22222222-2222-4222-8222-222222222222";
const AGENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const row = (o: Partial<ExtListingRow>): ExtListingRow => ({
  id: P1, reference: "HB-1", title: "Apartament 2 camere", description: "Luminos, renovat.", transaction_kind: "sale", property_type: "apartment",
  price: 95000, currency: "EUR", rooms: 2, usable_surface: 54, surface: null, floor: 3, floor_label: null, building_floors: 8, build_year: 2010,
  city: "Cluj-Napoca", district: "Mănăștur", county: "Cluj", address: "Str. Primăverii 12", street: "Primăverii", street_number: "12",
  location_precise: false, lat: 46.76, lng: 23.56, assigned_to: AGENT, created_at: "2026-11-01T10:00:00Z", ...o,
});
// Proprietăți publicate ale agenției (P3 e nepublicată — store-ul real filtrează publish_status/status).
const published = [row({ id: P1 }), row({ id: P2, assigned_to: OTHER, title: "Casă", created_at: "2026-10-30T10:00:00Z" })];
const unpublished = [row({ id: P3 })];
const agents = {
  [AGENT]: { full_name: "Ana Agent", phone: "0722 111 222", listing_phone: null, whatsapp: "0733 444 555" },
  [OTHER]: { full_name: "Bogdan Fără", phone: null, listing_phone: null, whatsapp: null },
};
const posts: { property_id: string; group_key: string; posted_at: string }[] = [];
const store: ExtListingsStore = {
  listings: async ({ org, user, all }) => (org === ORG ? published.filter((p) => all || p.assigned_to === user) : []),
  images: async () => ({}), agents: async (ids) => Object.fromEntries(ids.map((i) => [i, agents[i as keyof typeof agents]])),
  posts: async () => ({}),
  listingAccess: async ({ propertyId, user, all }) => published.some((p) => p.id === propertyId && (all || p.assigned_to === user)),
  lastPost: async (pid, key, since) => posts.filter((p) => p.property_id === pid && p.group_key === key && p.posted_at >= since).map((p) => p.posted_at).sort().pop() ?? null,
  insertPost: async (r) => { posts.push(r); },
};

const token = generateExtensionToken();
const auth = (role: string): ExtensionStore => ({
  token: async (h) => (h === (await sha256Hex(token)) ? { id: "t", user_id: AGENT, organization_id: ORG, token_hash: h, revoked_at: null } : null),
  account: async () => ({ is_active: true, full_name: "Ana Agent", role, profile_org_id: ORG, org: { id: ORG, name: "Agenția Exemplu", logo_url: null, status: "active", archived_at: null, suspended_reason: null } }),
  rate: async () => ({ limit: 60, remaining: 59, reset: 9e9, allowed: true }), touch: async () => {}, revoke: async () => {},
});
const get = async (role: string) => {
  const r = new Request("https://crm.habitoo.ro/api/public/extension/v1/my-listings", { headers: { authorization: `Bearer ${token}` } });
  return (await serveExtension(r, auth(role), myListingsHandler(r, store))).json();
};
const post = async (id: string, b: unknown, now: Date) => {
  const mk = () => new Request(`https://crm.habitoo.ro/api/public/extension/v1/listings/${id}/facebook-posts`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(b) });
  const res = await serveExtension(mk(), auth("agent"), facebookPostHandler(mk(), store, id, () => now));
  return { status: res.status, body: await res.json() };
};

describe("extension /my-listings", () => {
  it("agentul vede doar anunțurile lui publicate, adminul toate", async () => {
    expect((await get("agent")).data.map((d: { id: string }) => d.id)).toEqual([P1]);
    expect((await get("agency_admin")).data.map((d: { id: string }) => d.id)).toEqual([P1, P2]);
    expect((await get("agency_admin")).data.some((d: { id: string }) => d.id === unpublished[0].id)).toBe(false);
  });

  it("textul conține numele și telefonul agentului, nu ale agenției", async () => {
    const [d] = (await get("agent")).data;
    expect(d.post_text).toContain("Detalii și vizionări: Ana Agent, 0722 111 222");
    expect(d.post_text).toContain("WhatsApp: 0733 444 555");
    expect(d.post_text).not.toContain("Agenția Exemplu");
    expect(d.needs_phone).toBe(false);
  });

  it("telefonul pentru anunțuri are prioritate față de telefonul mobil", () => {
    expect(composePostText(row({}), { ...agents[AGENT], listing_phone: "0744 000 000" }).text).toContain("Ana Agent, 0744 000 000");
  });

  it("agent fără telefon → needs_phone", async () => {
    const d = (await get("agency_admin")).data.find((x: { id: string }) => x.id === P2);
    expect(d.needs_phone).toBe(true);
    expect(d.post_text).not.toContain("Detalii și vizionări");
  });

  it("locație imprecisă → fără stradă; precisă → cu stradă", () => {
    const imprecise = composePostText(row({ location_precise: false }), agents[AGENT]).text;
    expect(imprecise).toContain("Zona: Mănăștur, Cluj-Napoca");
    expect(imprecise).not.toContain("Primăverii");
    expect(composePostText(row({ location_precise: true }), agents[AGENT]).text).toContain("Str. Primăverii 12");
  });

  it("descrierea se scurtează la 1.500 de caractere", () => {
    const text = composePostText(row({ description: "cuvânt ".repeat(1000) }), agents[AGENT]).text;
    const desc = text.split("\n\n")[1];
    expect(desc.length).toBeLessThanOrEqual(1500);
  });
});

describe("extension facebook-posts", () => {
  it("postare repetată în același grup în 7 zile → recently_posted, fără blocare", async () => {
    const g = { group_url: "https://www.facebook.com/groups/imobcluj/?ref=share", group_name: "Imobiliare Cluj" };
    const first = await post(P1, { ...g, posted_at: "2026-11-01T10:00:00Z" }, new Date("2026-11-01T10:00:00Z"));
    expect(first.status).toBe(201);
    expect(first.body.recently_posted).toBe(false);
    const again = await post(P1, { ...g, group_url: "https://www.facebook.com/groups/imobcluj/" }, new Date("2026-11-05T10:00:00Z"));
    expect(again.status).toBe(201);
    expect(again.body.recently_posted).toBe(true);
    expect(again.body.last_posted_at).toBe("2026-11-01T10:00:00.000Z");
    const later = await post(P1, g, new Date("2026-11-20T10:00:00Z"));
    expect(later.body.recently_posted).toBe(false);
  });

  it("agentul nu poate nota postări pe anunțul altui agent", async () => {
    expect((await post(P2, { group_url: "https://www.facebook.com/groups/x" }, new Date())).status).toBe(404);
  });
});
