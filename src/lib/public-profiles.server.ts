import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { partnerLogoUrl } from "@/lib/public-partners";
import { PROFILE_OFFERS_PAGE_SIZE } from "@/lib/marketing/agency-seo";
import { agencyDescriptionStatsSchema, buildAgencyDescription } from "@/lib/marketing/agency-description";

function db() {
  const url = process.env["SUPABASE_URL"]; const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Configurația publică lipsește.");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  } } });
}
export type ProfileOffer = { slug: string; title: string; price: number | null; currency: string; transactionKind: string; rooms: number | null; surface: number | null; city: string | null; district: string | null; imageId: string | null };
export type ProfileOffers = { items: ProfileOffer[]; total: number; page: number; pages: number };
export type PublicAgencyPage = { name: string; slug: string; description: string | null; logoUrl: string | null; city: string | null; phone: string | null; email: string | null; website: string | null; currentAccess: boolean; offerCount: number };

export const agentAvatarUrl = (agency: string, agent: string) => `/api/public/agent-avatar/${agency}/${agent}`;

async function offers(agency: string, agent: null, page: number): Promise<ProfileOffers> {
  const { data, error } = await db().rpc("public_agency_offers", { _agency_slug: agency, ...(agent ? { _agent_slug: agent } : {}), _offset: (page - 1) * PROFILE_OFFERS_PAGE_SIZE, _limit: PROFILE_OFFERS_PAGE_SIZE });
  if (error) throw new Error("Ofertele nu au putut fi încărcate.");
  const rows = data ?? []; const total = Number(rows[0]?.total ?? 0);
  return { page, total, pages: Math.max(1, Math.ceil(total / PROFILE_OFFERS_PAGE_SIZE)), items: rows.map(r => ({ slug: r.slug, title: r.title, price: r.price, currency: r.currency, transactionKind: r.transaction_kind, rooms: r.rooms, surface: r.surface, city: r.city, district: r.district, imageId: r.image_id })) };
}
async function agency(slug: string): Promise<(PublicAgencyPage & { id: string }) | null> {
  const { data, error } = await db().rpc("public_agency_page", { _slug: slug });
  if (error) throw new Error("Profilul agenției nu a putut fi încărcat.");
  const r = (data ?? [])[0]; if (!r) return null;
  return { id: r.id, name: r.name, slug: r.slug, description: r.description, logoUrl: r.has_logo ? partnerLogoUrl(r.id) : null, city: r.city, phone: r.phone, email: r.email, website: r.website, currentAccess: r.current_access, offerCount: Number(r.offer_count) };
}

export async function loadAgencyPage(slug: string, page: number) {
  const a = await agency(slug); if (!a) return null;
  const [list, aggregate] = await Promise.all([
    offers(a.slug, null, page),
    db().rpc("public_agency_description_stats", { _slug: a.slug }),
  ]);
  const parsed = aggregate.error ? null : agencyDescriptionStatsSchema.safeParse(aggregate.data);
  // A failed aggregate never fabricates facts or hides the existing agency page.
  const description = parsed?.success ? buildAgencyDescription(a, parsed.data)
    : { description: a.offerCount > 0 ? a.description : null, automaticDescription: null, metaDescription: null };
  const { id: _id, ...pub } = a;
  return { agency: { ...pub, ...description }, offers: list };
}
export async function loadAgencySitemap(): Promise<{ path: string; lastmod: string | null }[]> {
  const { publicRead } = await import("@/lib/public-read");
  return publicRead("public_agency_sitemap", async () => {
    const { data, error } = await db().rpc("public_agency_sitemap");
    if (error) throw new Error("Sitemap-ul agențiilor nu a putut fi citit.");
    return (data ?? []).map(r => ({ path: r.path, lastmod: r.lastmod }));
  }, []);
}
