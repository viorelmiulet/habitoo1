// Extensia Chrome — anunțurile active ale agentului pentru postare în grupuri Facebook. Modul pur (fără DB).
import { z } from "zod";
import { publicLocation } from "@/lib/geo";
import { extError, type ExtContext } from "./core";

export const POST_DESCRIPTION_MAX = 1500;
export const RECENT_POST_DAYS = 7;
export const MY_LISTINGS_PAGE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ExtListingRow = {
  id: string; reference: string | null; title: string | null; description: string | null;
  transaction_kind: string | null; property_type: string | null; price: number | null; currency: string | null;
  rooms: number | null; usable_surface: number | null; surface: number | null; floor: number | null; floor_label: string | null;
  building_floors: number | null; build_year: number | null; city: string | null; district: string | null; county: string | null;
  address: string | null; street: string | null; street_number: string | null; location_precise: boolean | null;
  lat?: number | null; lng?: number | null; assigned_to: string | null; created_at: string;
};
export type ExtAgentContact = { full_name: string | null; phone: string | null; listing_phone: string | null; whatsapp: string | null };
export type ExtFbPost = { group_name: string | null; group_url: string; posted_at: string };

export type ExtListingsStore = {
  listings: (a: { org: string; user: string; all: boolean; q: string; cursor: { created_at: string; id: string } | null; limit: number }) => Promise<ExtListingRow[]>;
  images: (propertyIds: string[]) => Promise<Record<string, string[]>>;
  agents: (userIds: string[]) => Promise<Record<string, ExtAgentContact>>;
  posts: (propertyIds: string[]) => Promise<Record<string, ExtFbPost[]>>;
  listingAccess: (a: { propertyId: string; org: string; user: string; all: boolean }) => Promise<boolean>;
  lastPost: (propertyId: string, groupKey: string, since: string) => Promise<string | null>;
  insertPost: (row: { property_id: string; user_id: string; organization_id: string; group_url: string; group_key: string; group_name: string | null; posted_at: string }) => Promise<void>;
};

/** Cheia grupului: fără parametri, #, www./m., majuscule sau „/” final — același grup = aceeași cheie. */
export function groupKey(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase().replace(/^(www|m|web|mbasic)\./, "");
    return `${host}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch { return null; }
}

export const isAgencyWide = (role: string) => role === "agency_admin" || role === "superadmin";

const fmt = (n: number) => new Intl.NumberFormat("ro-RO").format(n);

export function agentSignature(agent: ExtAgentContact | null | undefined) {
  const phone = (agent?.listing_phone || agent?.phone || "").trim();
  const name = (agent?.full_name || "").trim();
  if (!phone) return { needs_phone: true as const, signature: null };
  const wa = (agent?.whatsapp || "").trim();
  return { needs_phone: false as const, signature: `Detalii și vizionări: ${name ? `${name}, ` : ""}${phone}${wa ? `\nWhatsApp: ${wa}` : ""}` };
}

export function truncate(text: string, max = POST_DESCRIPTION_MAX) {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.8 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export function listingLocation(p: ExtListingRow) {
  const loc = publicLocation({ ...p } as Parameters<typeof publicLocation>[0]);
  const street = loc.precise ? (loc.address || [loc.street, loc.street_number].filter(Boolean).join(" ")) : "";
  return [street, p.district, p.city].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
}

export function composePostText(p: ExtListingRow, agent: ExtAgentContact | null | undefined) {
  const lines: string[] = [];
  if (p.title) lines.push(p.title.trim());
  if (p.price != null) lines.push(`Preț: ${fmt(p.price)} ${p.currency ?? "EUR"}${p.transaction_kind === "rent" ? " / lună" : ""}`);
  const feats = [
    p.rooms != null ? `${p.rooms} ${p.rooms === 1 ? "cameră" : "camere"}` : null,
    (p.usable_surface ?? p.surface) != null ? `${fmt(Number(p.usable_surface ?? p.surface))} m²` : null,
    p.floor_label ? `Etaj ${p.floor_label}${p.building_floors != null ? `/${p.building_floors}` : ""}` : p.floor != null ? `Etaj ${p.floor === 0 ? "parter" : p.floor}${p.building_floors != null ? `/${p.building_floors}` : ""}` : null,
    p.build_year != null ? `An ${p.build_year}` : null,
  ].filter(Boolean);
  if (feats.length) lines.push(feats.join(" • "));
  const loc = listingLocation(p);
  if (loc) lines.push(`Zona: ${loc}`);
  const desc = p.description ? truncate(p.description) : "";
  const sig = agentSignature(agent);
  const text = [lines.join("\n"), desc, sig.signature].filter(Boolean).join("\n\n");
  return { text, needs_phone: sig.needs_phone };
}

function decodeCursor(raw: string | null) {
  if (!raw) return null;
  try {
    const [created_at, id] = atob(raw).split("|");
    if (!id || !UUID.test(id) || Number.isNaN(Date.parse(created_at))) return undefined;
    return { created_at, id };
  } catch { return undefined; }
}
const encodeCursor = (r: ExtListingRow) => btoa(`${r.created_at}|${r.id}`);

export function myListingsHandler(request: Request, store: ExtListingsStore) {
  return async (c: ExtContext) => {
    const sp = new URL(request.url).searchParams;
    const q = (sp.get("q") ?? "").trim().slice(0, 100);
    const cursor = decodeCursor(sp.get("cursor"));
    if (cursor === undefined) return extError(422, "VALIDATION_ERROR", "cursor invalid.", c.requestId);
    const rows = await store.listings({ org: c.token.organization_id, user: c.token.user_id, all: isAgencyWide(c.account.role), q, cursor, limit: MY_LISTINGS_PAGE + 1 });
    const page = rows.slice(0, MY_LISTINGS_PAGE);
    const ids = page.map((r) => r.id);
    const [images, agents, posts] = await Promise.all([
      store.images(ids),
      store.agents([...new Set(page.map((r) => r.assigned_to).filter((x): x is string => !!x))]),
      store.posts(ids),
    ]);
    const data = page.map((p) => {
      const agent = p.assigned_to ? agents[p.assigned_to] : null;
      const post = composePostText(p, agent);
      return {
        id: p.id, reference: p.reference, title: p.title, transaction: p.transaction_kind, price: p.price, currency: p.currency,
        property_type: p.property_type, rooms: p.rooms, surface: p.usable_surface ?? p.surface,
        locality: p.city, zone: p.district, images: (images[p.id] ?? []).slice(0, 10),
        post_text: post.text, needs_phone: post.needs_phone,
        facebook_posts: (posts[p.id] ?? []).slice(0, 5),
      };
    });
    return Response.json({ data, next_cursor: rows.length > MY_LISTINGS_PAGE ? encodeCursor(page[page.length - 1]) : null });
  };
}

const postSchema = z.object({
  group_url: z.string().trim().min(1).max(2048),
  group_name: z.string().trim().max(300).nullish(),
  posted_at: z.string().datetime({ offset: true }).nullish(),
});

export function facebookPostHandler(request: Request, store: ExtListingsStore, propertyId: string, now = () => new Date()) {
  return async (c: ExtContext) => {
    if (!UUID.test(propertyId)) return extError(404, "NOT_FOUND", "Anunțul nu a fost găsit.", c.requestId);
    let body: unknown;
    try { const t = await request.text(); if (t.length > 20_000) throw 0; body = JSON.parse(t); } catch { return extError(422, "VALIDATION_ERROR", "Corpul cererii trebuie să fie JSON valid.", c.requestId); }
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return extError(422, "VALIDATION_ERROR", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), c.requestId);
    const key = groupKey(parsed.data.group_url);
    if (!key) return extError(422, "VALIDATION_ERROR", "group_url trebuie să fie o adresă http(s).", c.requestId);
    const ok = await store.listingAccess({ propertyId, org: c.token.organization_id, user: c.token.user_id, all: isAgencyWide(c.account.role) });
    if (!ok) return extError(404, "NOT_FOUND", "Anunțul nu a fost găsit.", c.requestId);
    const nowD = now();
    const postedAt = parsed.data.posted_at ? new Date(parsed.data.posted_at) : nowD;
    const posted = (postedAt.getTime() > nowD.getTime() + 5 * 60_000 ? nowD : postedAt).toISOString();
    const since = new Date(new Date(posted).getTime() - RECENT_POST_DAYS * 86_400_000).toISOString();
    const last = await store.lastPost(propertyId, key, since);
    await store.insertPost({ property_id: propertyId, user_id: c.token.user_id, organization_id: c.token.organization_id, group_url: parsed.data.group_url, group_key: key, group_name: parsed.data.group_name || null, posted_at: posted });
    return Response.json({ ok: true, recently_posted: !!last, last_posted_at: last }, { status: 201 });
  };
}
