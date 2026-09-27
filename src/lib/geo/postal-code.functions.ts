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
import { POSTAL_REASON_LABELS, type PostalResolution } from "./postal-code.server";
import { PROPERTY_COLUMNS, realPorts, type PropertyRow } from "./postal-code.ports.server";

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
    try {
      const result = await resolvePostalCodeFor(row.id, row, await realPorts(organizationId, row));
      return report(result, row);
    } catch (error) {
      // Salvarea ofertei a reușit deja: eșecul se consemnează și se întoarce ca
      // notificare, niciodată înghițit în silence.
      const message = error instanceof Error ? error.message : String(error);
      await supabaseAdmin.from("postal_code_resolution_attempts").insert({
        organization_id: organizationId,
        property_id: row.id,
        outcome: "failed",
        postal_code: null,
        source: null,
        used_provider: false,
        detail: message.slice(0, 500),
      });
      return report(
        {
          propertyId: row.id,
          status: "failed",
          postalCode: (row.postal_code ?? "").trim() || null,
          source: null,
          reason: "failed",
          usedProvider: false,
        },
        row,
      );
    }
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
    // Acțiune rezervată administratorilor platformei, verificată pe server.
    const { data: isSuperadmin } = await (
      context as unknown as { supabase: { rpc: (fn: string) => Promise<{ data: unknown }> } }
    ).supabase.rpc("is_superadmin");
    if (isSuperadmin !== true) {
      throw new Error("Această operațiune este rezervată administratorilor platformei.");
    }

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
