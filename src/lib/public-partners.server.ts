import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  toPublicAgencyAgents,
  toPublicAgencyProfile,
  toPublicPartners,
  type PublicAgencyAgent,
  type PublicAgencyProfile,
  type PublicPartner,
} from "@/lib/public-partners";

/** Publishable keys are opaque: public reads send apikey, never Bearer <key>. */
function publicPartnerClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Configurația publică lipsește.");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  } } });
}

/** Citire anonimă prin funcția publică `public_partner_agencies` (fără acces la tabele). */
export async function loadPublicPartners(): Promise<PublicPartner[]> {
  const db = publicPartnerClient();
  const { data, error } = await db.rpc("public_partner_agencies");
  if (error) throw new Error("Lista agențiilor partenere nu a putut fi încărcată.");
  return toPublicPartners(data ?? []);
}

/**
 * Profilul public al unei agenții după slug, plus agenții ei publici.
 * Returnează null când slugul nu corespunde unei agenții activate.
 */
export async function loadAgencyProfile(
  slug: string,
): Promise<{ agency: PublicAgencyProfile; agents: PublicAgencyAgent[]; city: string | null } | null> {
  const db = publicPartnerClient();
  const { data, error } = await db.rpc("public_agency_profile", { _slug: slug });
  if (error) throw new Error("Profilul agenției nu a putut fi încărcat.");
  const row = (data ?? [])[0];
  if (!row) return null;
  const [agentResult, cityResult] = await Promise.all([
    db.rpc("public_agency_agents", { _org: row.id }),
    db.rpc("public_agency_city", { _slug: slug }),
  ]);
  if (agentResult.error || cityResult.error) throw new Error("Profilul agenției nu a putut fi încărcat.");
  return { agency: toPublicAgencyProfile(row), agents: toPublicAgencyAgents(agentResult.data), city: cityResult.data };
}

/** Pentru sitemap și llms.txt: `/agentii` apare doar dacă există cel puțin un partener. */
export async function hasPublicPartners(): Promise<boolean> {
  try {
    const { publicRead } = await import("@/lib/public-read");
    return (await publicRead("public_partner_agencies", loadPublicPartners, [])).length > 0;
  } catch {
    return false;
  }
}
