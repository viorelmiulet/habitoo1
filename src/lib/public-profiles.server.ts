import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { partnerLogoUrl } from "@/lib/public-partners";
import { PROFILE_OFFERS_PAGE_SIZE } from "@/lib/marketing/agency-seo";

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
export type PublicAgentSummary = { slug: string; fullName: string; jobTitle: string | null; avatarUrl: string | null; offerCount: number };

export const agentAvatarUrl = (agency: string, agent: string) => `/api/public/agent-avatar/${agency}/${agent}`;

async function offers(agency: string, agent: string | null, page: number): Promise<ProfileOffers> {
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
  const [agentsRes, list] = await Promise.all([db().rpc("public_agency_agent_list", { _slug: a.slug }), offers(a.slug, null, page)]);
  if (agentsRes.error) throw new Error("Agenții nu au putut fi încărcați.");
  const { id: _id, ...pub } = a;
  const agents: PublicAgentSummary[] = (agentsRes.data ?? []).map(r => ({ slug: r.slug, fullName: r.full_name, jobTitle: r.job_title, avatarUrl: r.has_avatar ? agentAvatarUrl(a.slug, r.slug) : null, offerCount: Number(r.offer_count) }));
  return { agency: pub, agents, offers: list };
}
export async function loadAgentPage(agencySlug: string, agentSlug: string, page: number) {
  const a = await agency(agencySlug); if (!a) return null;
  const { data, error } = await db().rpc("public_agent_page", { _agency_slug: a.slug, _agent_slug: agentSlug });
  if (error) throw new Error("Profilul agentului nu a putut fi încărcat.");
  const r = (data ?? [])[0]; if (!r) return null;
  const list = await offers(a.slug, r.slug, page);
  return {
    agency: { name: a.name, slug: a.slug, logoUrl: a.logoUrl, currentAccess: a.currentAccess },
    agent: { slug: r.slug, fullName: r.full_name, jobTitle: r.job_title, bio: r.bio, phone: r.phone, avatarUrl: r.has_avatar ? agentAvatarUrl(a.slug, r.slug) : null, isActive: r.is_active, offerCount: Number(r.offer_count) },
    offers: list,
  };
}
export async function loadAgencySitemap(): Promise<{ path: string; lastmod: string | null }[]> {
  const { publicRead } = await import("@/lib/public-read");
  return publicRead("public_agency_sitemap", async () => {
    const { data, error } = await db().rpc("public_agency_sitemap");
    if (error) throw new Error("Sitemap-ul agențiilor nu a putut fi citit.");
    return (data ?? []).map(r => ({ path: r.path, lastmod: r.lastmod }));
  }, []);
}
