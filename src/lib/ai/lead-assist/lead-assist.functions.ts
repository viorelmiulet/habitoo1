import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExtractedRequest } from "./schema";

const insightInput = z.object({ insightId: z.string().uuid() });

/** Existing analysis engine, initiated on demand for every source or a saved lead note. */
export const analyzeLeadConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid(), messageId: z.string().uuid().optional(), source: z.enum(["message", "note", "lead"]).default("lead") }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    const { data: lead } = await context.supabase.from("leads").select("id,organization_id,notes,deleted_at").eq("id", data.leadId).maybeSingle();
    if (!lead || lead.deleted_at) return { ok: false, message: "Lead-ul nu este disponibil." };
    const { createLeadAiDeps } = await import("./deps.server");
    const deps = await createLeadAiDeps();
    if (!(await deps.isFeatureEnabled(lead.organization_id))) return { ok: false, message: "Funcțiile AI nu sunt activate pentru agenția ta." };
    const { aiCreditsBlockedMessage } = await import("@/lib/ai/credits/credits.server");
    const blocked = await aiCreditsBlockedMessage(lead.organization_id);
    if (blocked) return { ok: false, message: blocked };
    let messageId: string | null = null;
    if (data.source !== "note") {
      let query = context.supabase.from("portal_messages").select("id").eq("lead_id", lead.id).eq("organization_id", lead.organization_id).eq("direction", "in");
      if (data.messageId) query = query.eq("id", data.messageId);
      const { data: incoming } = await query.order("sent_at", { ascending: false }).limit(1).maybeSingle();
      if (data.messageId && !incoming) return { ok: false, message: "Mesajul nu este disponibil." };
      messageId = incoming?.id ?? null;
    }
    if (data.source === "note" && !lead.notes?.trim()) return { ok: false, message: "Lead-ul nu are o notă de analizat." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let insightId: string | null = null;
    if (messageId) {
      const { data: old } = await context.supabase.from("lead_ai_insights").select("id,status,locked_until,updated_at").eq("message_id", messageId).maybeSingle();
      if (old?.status === "processing" && old.locked_until && Date.parse(old.locked_until) > Date.now()) return { ok: false, message: "O analiză este deja în curs pentru acest mesaj." };
      insightId = old?.id ?? null;
      if (old) {
        const { data: claimed } = await supabaseAdmin.from("lead_ai_insights").update({ status: "processing", locked_until: new Date(Date.now() + 300000).toISOString() })
          .eq("id", old.id).eq("updated_at", old.updated_at).eq("status", old.status).select("id");
        if (!claimed?.length) return { ok: false, message: "O analiză este deja în curs pentru acest mesaj." };
      }
    }
    if (!insightId) {
      const { data: created, error } = await supabaseAdmin.from("lead_ai_insights").insert({
        organization_id: lead.organization_id, lead_id: lead.id, message_id: messageId,
        source_kind: data.source, status: "processing", locked_until: new Date(Date.now() + 300000).toISOString(),
      }).select("id").single();
      if (error || !created) return { ok: false, message: "O analiză este deja în curs pentru acest mesaj." };
      insightId = created.id;
    }
    const { processLeadInsight } = await import("./process.server");
    try {
      const outcome = await processLeadInsight({ ...deps, readDb: context.supabase }, {
        id: insightId, organization_id: lead.organization_id, lead_id: lead.id, message_id: messageId, source_kind: data.source,
      }, { actorUserId: context.userId });
      return outcome === "done" ? { ok: true } : { ok: false, message: "Analiza nu a produs un răspuns valid. Datele lead-ului nu s-au schimbat." };
    } catch (error) {
      await supabaseAdmin.from("lead_ai_insights").update({ status: "failed", locked_until: null, skip_reason: "analysis_failed" }).eq("id", insightId);
      return { ok: false, message: error instanceof Error && error.name === "AiCreditsExhaustedError" ? error.message : "Analiza nu a putut fi realizată. Datele lead-ului nu s-au schimbat." };
    }
  });

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
      const outcome = await processLeadInsight({ ...deps, readDb: context.supabase }, row, { regenerate: true, actorUserId: context.userId });
      return outcome === "done" ? { ok: true } : { ok: false, message: "Ciorna nu a putut fi generată. Încearcă din nou." };
    } catch {
      return { ok: false, message: "Ciorna nu a putut fi generată. Încearcă din nou." };
    }
  });

/** Confirmation is explicit; the transactional RPC locks the lead to prevent duplicate requests. */
export const applyLeadRequestChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => insightInput.extend({ fields: z.array(z.string()).min(1).max(20).optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    const { data: row } = await context.supabase.from("lead_ai_insights").select("id,proposed_changes,changes_applied_at,lead_id").eq("id", data.insightId).maybeSingle();
    if (!row) return { ok: false, message: "Analiza nu este disponibilă." };
    if (row.changes_applied_at) return { ok: true };
    const changes = Array.isArray(row.proposed_changes) ? row.proposed_changes as unknown as { field: keyof ExtractedRequest }[] : [];
    const fields = data.fields ?? changes.map(c => c.field);
    // Only stored, validated proposals can be confirmed, never client-supplied values.
    const { error } = await context.supabase.rpc("confirm_lead_ai_request", { _insight: row.id, _fields: fields });
    if (error) return { ok: false, message: "Cererea nu a fost salvată. Confirmă tipul cererii și verifică dreptul de acces." };
    return { ok: true };
  });
