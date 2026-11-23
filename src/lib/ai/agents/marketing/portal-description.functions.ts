import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { DESCRIPTION_PORTALS } from "./portal-description";

export const applyPortalDescription = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ propertyId: z.string().uuid(), draftId: z.string().uuid(), portal: z.enum(DESCRIPTION_PORTALS) }).parse(data))
  .handler(async ({ data, context }) => {
    const { runListingChecks } = await import("@/lib/listing-check/check.server");
    const [allowed] = await runListingChecks(context.supabase as never, context.userId, [data.propertyId]);
    if (!allowed) return { ok: false, message: "Anunțul nu este accesibil." };
    const { data: property } = await context.supabase.from("properties").select("*").eq("id", data.propertyId).maybeSingle();
    if (!property) return { ok: false, message: "Anunțul nu este accesibil." };
    const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
    if (!(await isAiFeatureEnabled(property.organization_id, "ai_marketing"))) return { ok: false, message: "Funcțiile AI nu sunt activate pentru agenție." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: draft } = await supabaseAdmin.from("marketing_drafts").select("body,context_hash,validation_status,created_by,channel").eq("id", data.draftId).eq("property_id", data.propertyId).eq("organization_id", property.organization_id).eq("created_by", context.userId).maybeSingle();
    const { buildMarketingFactSheet, marketingContextHash, validateMarketingFacts } = await import("./facts");
    const facts = buildMarketingFactSheet(property);
    const channel = data.portal === "olx_direct" ? "olx" : data.portal;
    if (!draft || draft.channel !== channel || draft.validation_status === "invalid" || draft.context_hash !== marketingContextHash(facts) || validateMarketingFacts(draft.body, facts).status === "invalid") return { ok: false, message: "Datele anunțului s-au schimbat sau textul nu a trecut verificarea. Generează din nou." };
    const { error } = await supabaseAdmin.from("marketing_drafts").update({ context_snapshot: { portalDescription: data.portal }, applied_at: new Date().toISOString(), applied_by: context.userId }).eq("id", data.draftId).eq("organization_id", property.organization_id);
    if (error) return { ok: false, message: "Descrierea nu a putut fi selectată." };
    const { clearProperstarCache } = await import("@/lib/portals/properstar/cache");
    clearProperstarCache(property.organization_id);
    return { ok: true, message: "Descriere selectată pentru portal. Fișa proprietății rămâne neschimbată." };
  });