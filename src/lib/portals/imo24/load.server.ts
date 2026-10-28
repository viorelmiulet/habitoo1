/**
 * Datele reale pentru publicarea imo24.ro (server-only): proprietatea, pozele,
 * emailul agentului, cursul BNR și dicționarele; apoi mapper-ul din pasul 2.
 */
import { CRM_URL } from "@/lib/host";
import { isPropertyFeedEligible, type PropertyRow } from "@/lib/site-feed/mapper";
import { watermarkFromOrg } from "@/lib/watermark";
import type { Imo24Deps } from "./client";
import { getImo24Enumerations, getImo24Features } from "./dictionaries";
import { imo24Category, imo24ExternalId, mapPropertyToImo24, type Imo24Anunt } from "./mapper";
import { imo24ImageUrls } from "./publish";

export type Imo24Build =
  | { ok: true; bodies: Imo24Anunt[]; warnings: string[]; images: string[]; agentEmail: string | null }
  | { ok: false; reasons: string[] };

export async function buildImo24Bodies(
  apiKey: string,
  input: { organizationId: string; propertyId: string },
  deps: Imo24Deps = {},
): Promise<Imo24Build> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: property } = await supabaseAdmin
    .from("properties").select("*")
    .eq("id", input.propertyId).eq("organization_id", input.organizationId).maybeSingle();
  if (!property) return { ok: false, reasons: ["Proprietatea nu a fost găsită."] };
  const row = property as PropertyRow;
  if (!isPropertyFeedEligible(row)) {
    return { ok: false, reasons: ["Oferta nu este publicabilă: verifică statusul și publicarea pe site."] };
  }

  const needsRate = [row.currency, row.sale_currency, row.rent_currency].some((c) => (c ?? "").toUpperCase() === "RON");
  const category = imo24Category(row.property_type);
  const [{ data: images }, { data: org }, agent, rate, enums, features] = await Promise.all([
    supabaseAdmin.from("property_images").select("*")
      .eq("organization_id", input.organizationId).eq("property_id", input.propertyId),
    supabaseAdmin.from("organizations").select("watermark_enabled").eq("id", input.organizationId).maybeSingle(),
    row.assigned_to
      ? supabaseAdmin.from("profiles").select("email").eq("id", row.assigned_to).maybeSingle()
      : Promise.resolve({ data: null }),
    needsRate
      ? (async () => {
          const { getRonEurRateForDate } = await import("@/lib/commissions-rates.server");
          const today = new Date().toISOString().slice(0, 10);
          return getRonEurRateForDate(today, { table: supabaseAdmin.from("exchange_rates") as never })
            .then((r) => r.rate).catch(() => null);
        })()
      : Promise.resolve(undefined),
    getImo24Enumerations(apiKey, deps),
    category ? getImo24Features(apiKey, category, deps) : Promise.resolve(null),
  ]);

  const mapped = mapPropertyToImo24(row, {
    eurRonRate: needsRate ? (rate ?? null) : undefined,
    enumerations: enums.ok ? enums.data : null,
    features: features && features.ok ? features.data : null,
  });
  if (!mapped.ok) return { ok: false, reasons: mapped.reasons };

  const pics = imo24ImageUrls((images ?? []) as never, {
    baseUrl: CRM_URL,
    watermark: watermarkFromOrg(org as never).enabled,
  });
  return {
    ok: true,
    bodies: mapped.bodies,
    warnings: [...mapped.warnings.filter((w) => !w.startsWith("Ambele")), ...pics.warnings],
    images: pics.urls,
    agentEmail: ((agent as { data: { email?: string | null } | null }).data?.email ?? null) || null,
  };
}

/** Codurile imo24 posibile ale proprietății (vânzare + închiriere), pentru retragere. */
export async function imo24CandidateExternalIds(input: { organizationId: string; propertyId: string }): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("properties").select("id, reference")
    .eq("id", input.propertyId).eq("organization_id", input.organizationId).maybeSingle();
  if (!data) return [];
  return [imo24ExternalId(data as never, "vanzare"), imo24ExternalId(data as never, "inchiriere")];
}
