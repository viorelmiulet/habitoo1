/** Datele reale pentru previzualizarea HomeDirect (server-only, doar citire). Corpul complet, ca la publicare. */
import type { PropertyRow } from "@/lib/site-feed/mapper";
import type { HomedirectLocation } from "./locations.server";
import { prepareHomedirect } from "./load.server";
import { withAccounts, type HomedirectFullBody } from "./publish";
import type { HomedirectBody } from "./mapper";

export type HomedirectPreview = {
  ok: boolean;
  bodies: (HomedirectFullBody | HomedirectBody)[];
  reasons: string[];
  warnings: string[];
  location: HomedirectLocation;
};

export async function buildHomedirectPreview(propertyId: string): Promise<HomedirectPreview> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: p } = await db.from("properties").select("*").eq("id", propertyId).maybeSingle();
  if (!p) throw new Error("Proprietatea nu a fost găsită.");
  const prep = await prepareHomedirect(db, p as PropertyRow);
  const warnings = [...prep.mapped.warnings, ...prep.imageWarnings];
  const bodies = prep.mapped.ok
    ? prep.agency && prep.agent
      ? prep.mapped.bodies.map((b) => withAccounts(b, { agency: prep.agency!, agent: prep.agent!, organizationId: p.organization_id, userId: p.assigned_to }))
      : prep.mapped.bodies
    : [];
  // Locația neverificată și cheia lipsă blochează doar publicarea, nu previzualizarea.
  return { ok: prep.reasons.length === 0, bodies, reasons: prep.reasons, warnings, location: prep.location };
}
