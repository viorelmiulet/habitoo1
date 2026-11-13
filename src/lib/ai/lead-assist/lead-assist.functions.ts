import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProposedChange } from "./schema";

const insightInput = z.object({ insightId: z.string().uuid() });

/** Regenerează ciorna pentru un mesaj (1 credit). Nu trimite nimic. */
export const regenerateLeadDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => insightInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    // Vizibilitatea lead-ului se verifică prin RLS-ul apelantului.
    const { data: row } = await context.supabase.from("lead_ai_insights").select("id,organization_id,lead_id,message_id").eq("id", data.insightId).maybeSingle();
    if (!row) return { ok: false, message: "Lead-ul nu este disponibil." };
    const { createLeadAiDeps } = await import("./deps.server");
    const { processLeadInsight } = await import("./process.server");
    const deps = await createLeadAiDeps();
    if (!(await deps.isFeatureEnabled(row.organization_id))) {
      const { aiFeatureDisabledMessage } = await import("@/lib/ai/features/keys");
      return { ok: false, message: aiFeatureDisabledMessage("ai_lead_assist") };
    }
    const { aiCreditsBlockedMessage } = await import("@/lib/ai/credits/credits.server");
    const blocked = await aiCreditsBlockedMessage(row.organization_id);
    if (blocked) return { ok: false, message: blocked };
    try {
      const outcome = await processLeadInsight(deps, row, { regenerate: true, actorUserId: context.userId });
      return outcome === "done" ? { ok: true } : { ok: false, message: "Ciorna nu a putut fi generată. Încearcă din nou." };
    } catch {
      return { ok: false, message: "Ciorna nu a putut fi generată. Încearcă din nou." };
    }
  });

/** Aplică diferențele propuse pe cererea existentă, cu drepturile agentului. */
export const applyLeadRequestChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => insightInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    const { data: row } = await context.supabase.from("lead_ai_insights").select("id,request_id,proposed_changes,changes_applied_at").eq("id", data.insightId).maybeSingle();
    if (!row?.request_id) return { ok: false, message: "Nu există o cerere de actualizat." };
    if (row.changes_applied_at) return { ok: true };
    const { data: existing } = await context.supabase.from("requests").select("*").eq("id", row.request_id).maybeSingle();
    if (!existing) return { ok: false, message: "Cererea nu este disponibilă." };
    const { applyChanges } = await import("./schema");
    const patch = applyChanges(existing as never, (row.proposed_changes ?? []) as unknown as ProposedChange[]);
    const { error } = await context.supabase.from("requests").update({ ...patch, updated_by: context.userId } as never).eq("id", row.request_id);
    if (error) return { ok: false, message: "Nu ai dreptul să modifici această cerere." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("lead_ai_insights").update({ changes_applied_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true };
  });
