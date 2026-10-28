/**
 * ZonaTa: sincronizarea nomenclatorului (doar SuperAdmin, doar GET-uri cu cheia
 * salvată a agenției — merge și cheia de test), starea lui și previzualizarea
 * corpului de anunț (fără cheie, fără apel la ZonaTa).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { diffZonataNomenclature, parseZonataCategories, parseZonataFields, type ZonataSubcategory } from "./nomenclature";
import { mapPropertyToZonata } from "./mapper";

async function assertSuperadmin(supabase: any) {
  const { data } = await supabase.rpc("is_superadmin");
  if (data !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
}

export const syncZonataNomenclature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: conn } = await admin
      .from("portal_connections")
      .select("portal_credentials_encrypted")
      .eq("organization_id", data.organizationId)
      .eq("portal", "zonata")
      .maybeSingle();
    const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
    const key = conn?.portal_credentials_encrypted ? decryptPortalCredential(conn.portal_credentials_encrypted) : null;
    if (!key) throw new Error("Salvează întâi cheia ZonaTa a agenției.");
    const { zonataRequest } = await import("./client");

    const cats = await zonataRequest<unknown>(key, "GET", "/categories");
    if (!cats.ok) throw new Error(cats.message);
    const refs = parseZonataCategories(cats.data);
    if (refs.length === 0) throw new Error("ZonaTa nu a întors nicio subcategorie imobiliară; nomenclatorul existent rămâne neschimbat.");
    const next: ZonataSubcategory[] = [];
    for (const ref of refs) {
      const path = `/categories/${encodeURIComponent(ref.category_slug)}/${encodeURIComponent(ref.subcategory_slug)}/fields`;
      const res = await zonataRequest<unknown>(key, "GET", path);
      if (!res.ok) throw new Error(`${ref.subcategory_label ?? ref.subcategory_slug}: ${res.message}`);
      next.push({ ...ref, fields: parseZonataFields(res.data) });
    }

    const { data: previous } = await admin.from("zonata_subcategories").select("category_slug,subcategory_slug,fields,active");
    const { counts, changes } = diffZonataNomenclature(next, previous ?? []);
    const now = new Date().toISOString();
    const { error } = await admin
      .from("zonata_subcategories")
      .upsert(next.map((n) => ({ ...n, active: true, synced_at: now })), { onConflict: "category_slug,subcategory_slug" });
    if (error) throw new Error(error.message);
    for (const k of changes.removed) {
      const [category_slug, subcategory_slug] = k.split("/");
      await admin.from("zonata_subcategories").update({ active: false, synced_at: now }).eq("category_slug", category_slug).eq("subcategory_slug", subcategory_slug);
    }
    await admin.from("zonata_nomenclature_syncs").insert({
      synced_at: now,
      synced_by: context.userId,
      organization_id: data.organizationId,
      raw_categories: cats.data as never,
      counts,
      changes,
    });
    return { counts, changes, syncedAt: now };
  });

export const getZonataNomenclatureStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase);
    const { data } = await (context.supabase as any)
      .from("zonata_nomenclature_syncs")
      .select("synced_at,counts,changes")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      syncedAt: (data?.synced_at as string | undefined) ?? null,
      counts: (data?.counts ?? null) as { subcategories: number; fields: number } | null,
      changes: (data?.changes ?? null) as { added: string[]; removed: string[]; fieldsChanged: string[] } | null,
    };
  });

export const previewZonataPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { propertyId: string }) => z.object({ propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: p } = await admin.from("properties").select("*").eq("id", data.propertyId).maybeSingle();
    if (!p) throw new Error("Proprietatea nu a fost găsită.");
    const { loadZonataImages, loadZonataNomenclature } = await import("./context.server");
    const [nomenclature, images] = await Promise.all([
      loadZonataNomenclature(admin),
      loadZonataImages(admin, p.organization_id, [p.id]),
    ]);
    const result = mapPropertyToZonata(p, { nomenclature, images: images.get(p.id) ?? [] });
    return {
      ok: result.ok,
      /** Corpul exact, ca JSON formatat (fără cheie). */
      bodiesJson: result.ok ? JSON.stringify(result.bodies, null, 2) : null,
      reasons: result.ok ? ([] as string[]) : result.reasons,
      warnings: result.warnings,
    };
  });
