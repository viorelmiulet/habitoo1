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

/** Citire anonimă prin funcția publică `public_partner_agencies` (fără acces la tabele). */
export async function loadPublicPartners(): Promise<PublicPartner[]> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Configurația publică lipsește.");
  const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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
): Promise<{ agency: PublicAgencyProfile; agents: PublicAgencyAgent[] } | null> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Configurația publică lipsește.");
  const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("public_agency_profile", { _slug: slug });
  if (error) throw new Error("Profilul agenției nu a putut fi încărcat.");
  const row = (data ?? [])[0];
  if (!row) return null;
  const { data: agents, error: agentsError } = await db.rpc("public_agency_agents", { _org: row.id });
  if (agentsError) throw new Error("Profilul agenției nu a putut fi încărcat.");
  return { agency: toPublicAgencyProfile(row), agents: toPublicAgencyAgents(agents) };
}

/** Pentru sitemap și llms.txt: `/agentii` apare doar dacă există cel puțin un partener. */
export async function hasPublicPartners(): Promise<boolean> {
  try {
    return (await loadPublicPartners()).length > 0;
  } catch {
    return false;
  }
}
