/**
 * Codul poștal dedus din adresă: punctul de intrare din aplicație.
 *
 * `resolvePropertyPostalCode` se apelează după salvarea unei oferte; agenția și
 * drepturile vin din sesiune, niciodată din input. `backfillPostalCodes` este
 * acțiunea manuală de superadmin pentru ofertele deja existente.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PostalCodeRow, PostalCodeSource } from "./postal-code";
import {
  POSTAL_REASON_LABELS,
  type PostalPorts,
  type PostalResolution,
} from "./postal-code.server";

const PROPERTY_COLUMNS =
  "id, organization_id, reference, title, postal_code, postal_code_source, postal_code_resolved_from, address, district, city, county, lat, lng, locality_siruta_code, uat_siruta_code";

type PropertyRow = PostalCodeRow & {
  id: string;
  organization_id: string;
  reference: string | null;
  title: string | null;
};

/** Porturile reale: nomenclator propriu pentru localitate, cache și jurnal. */
async function realPorts(organizationId: string, property: PropertyRow): Promise<PostalPorts> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { nominatimReverse } = await import("./postal-code.server");

  return {
    reverse: nominatimReverse,
    localityPostal: async (row) => {
      if (row.locality_siruta_code) {
        const { data } = await supabaseAdmin
          .from("ro_localities")
          .select("postal_code")
          .eq("siruta_code", row.locality_siruta_code)
          .maybeSingle();
        if (data?.postal_code) return data.postal_code;
      }
      if (row.uat_siruta_code) {
        const { data } = await supabaseAdmin
          .from("ro_uats")
          .select("postal_code")
          .eq("siruta_code", row.uat_siruta_code)
          .maybeSingle();
        if (data?.postal_code) return data.postal_code;
      }
      return null;
    },
    cacheGet: async (key) => {
      const { data } = await supabaseAdmin
        .from("geocode_postal_cache")
        .select("postal_code, source")
        .eq("coord_key", key)
        .maybeSingle();
      return data ? { postalCode: data.postal_code ?? null, source: data.source } : null;
    },
    cacheSet: async (key, postalCode, source) => {
      await supabaseAdmin
        .from("geocode_postal_cache")
        .upsert(
          { coord_key: key, postal_code: postalCode, source, updated_at: new Date().toISOString() },
          { onConflict: "coord_key" },
        );
    },
    providerCallsToday: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("postal_code_resolution_attempts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("used_provider", true)
        .gte("created_at", since);
      return count ?? 0;
    },
    logAttempt: async (entry) => {
      await supabaseAdmin.from("postal_code_resolution_attempts").insert({
        organization_id: organizationId,
        property_id: property.id,
        outcome: entry.outcome,
        postal_code: entry.postalCode,
        source: entry.source,
        used_provider: entry.usedProvider,
        detail: entry.detail,
      });
    },
    save: async (value) => {
      await supabaseAdmin
        .from("properties")
        .update({
          postal_code: value.postalCode,
          postal_code_source: value.source,
          postal_code_resolved_at: new Date().toISOString(),
          postal_code_resolved_from: value.resolvedFrom,
        })
        .eq("id", property.id)
        // Garanție suplimentară: o valoare manuală nu poate fi atinsă nici
        // dacă între citire și scriere cineva a completat câmpul.
        .neq("postal_code_source", "manual");
    },
  };
}

export type PostalCodeReport = PostalResolution & {
  reference: string | null;
  title: string | null;
  reasonLabel: string;
};

function report(result: PostalResolution, property: PropertyRow): PostalCodeReport {
  return {
    ...result,
    reference: property.reference,
    title: property.title,
    reasonLabel: POSTAL_REASON_LABELS[result.reason] ?? result.reason,
  };
}

export const resolvePropertyPostalCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ propertyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<PostalCodeReport | null> => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", context.userId)
      .maybeSingle();
    const organizationId = profile?.organization_id;
    if (!organizationId) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: property } = await supabaseAdmin
      .from("properties")
      .select(PROPERTY_COLUMNS)
      .eq("id", data.propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!property) return null;

    const row = property as unknown as PropertyRow;
    const { resolvePostalCodeFor } = await import("./postal-code.server");
    const result = await resolvePostalCodeFor(row.id, row, await realPorts(organizationId, row));
    return report(result, row);
  });

export const backfillPostalCodes = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(25).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ processed: number; items: PostalCodeReport[] }> => {
    const { requireSuperadmin } = await import("@/lib/org-access");
    await requireSuperadmin(context as never);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolvePostalCodeFor } = await import("./postal-code.server");

    let query = supabaseAdmin
      .from("properties")
      .select(PROPERTY_COLUMNS)
      .is("deleted_at", null)
      .or("postal_code.is.null,postal_code.eq.")
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 10);
    if (data.organizationId) query = query.eq("organization_id", data.organizationId);

    const { data: rows } = await query;
    const items: PostalCodeReport[] = [];
    for (const raw of (rows ?? []) as unknown as PropertyRow[]) {
      const result = await resolvePostalCodeFor(
        raw.id,
        raw,
        await realPorts(raw.organization_id, raw),
      );
      items.push(report(result, raw));
      // Politica furnizorului: maximum o cerere pe secundă. Pauza ține și când
      // rezolvarea a venit din cache (cost zero), ca ritmul să rămână sigur.
      if (result.usedProvider) await new Promise((r) => setTimeout(r, 1100));
    }
    return { processed: items.length, items };
  });

export type { PostalCodeSource };
