import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { entitySchema, confirmedChanges, type AnalyzedCall } from "./schema";
import { applyChanges, leadAiResponseSchema } from "../lead-assist/schema";

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export const summarizeContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<Result<string>> => {
    const { contactHistory } = await import("./context.server");
    const { summarizeClient } = await import("./analysis.server");
    const { paidClientAnalysis } = await import("./paid.server");
    try {
      const { scope, history } = await contactHistory(context.supabase, context.userId, data.id);
      if (!history.length) return { ok: false, message: "Contactul nu are încă un istoric pentru rezumat." };
      const summary = await paidClientAnalysis(scope.organizationId, context.userId, "client_summary", async provider => {
        const r = await summarizeClient(provider, history); return { value: r.summary, usage: r.usage };
      });
      return summary ? { ok: true, value: summary } : { ok: false, message: "Rezumatul nu a putut fi validat. Datele contactului nu s-au schimbat." };
    } catch (error) { const { clientAiError } = await import("./paid.server"); return { ok: false, message: clientAiError(error) }; }
  });

export const analyzeDictatedCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entity: entitySchema, audio: z.object({ mimeType: z.literal("audio/wav"), base64: z.string().min(60).max(8_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }) }).parse(input))
  .handler(async ({ data, context }): Promise<Result<AnalyzedCall>> => {
    const { clientScope } = await import("./context.server");
    const { analyzeCall } = await import("./analysis.server");
    const { paidClientAnalysis, clientAiError } = await import("./paid.server");
    try {
      const scope = await clientScope(context.supabase, context.userId, data.entity);
      const header = atob(data.audio.base64.slice(0, 60));
      if (header.slice(0, 4) !== "RIFF" || header.slice(8, 12) !== "WAVE") return { ok: false, message: "Înregistrarea audio nu este validă." };
      const proposal = await paidClientAnalysis(scope.organizationId, context.userId, "dictated_call", async provider => {
        if (provider.id !== "gemini") throw new Error("Gemini nu este configurat pentru înregistrări audio.");
        const r = await analyzeCall(provider, data.audio); return { value: r.proposal, usage: r.usage };
      });
      return proposal ? { ok: true, value: { ...proposal, organizationId: scope.organizationId } } : { ok: false, message: "Notița nu a putut fi validată. Nu s-a salvat nimic." };
    } catch (error) { return { ok: false, message: clientAiError(error) }; }
    finally { data.audio.base64 = ""; }
  });

export const loadCallRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => entitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { entityRequests, clientScope } = await import("./context.server");
    const { assertClientAiEnabled } = await import("./paid.server");
    const scope = await clientScope(context.supabase, context.userId, data);
    await assertClientAiEnabled(scope.organizationId);
    const rows = await entityRequests(context.supabase, context.userId, data);
    return rows.map(r => ({ id: r.id, title: r.title }));
  });

/** Only an explicit confirmation invokes this endpoint; generation has no CRM writes. */
export const confirmCallRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entity: entitySchema, requestId: z.string().uuid().nullable(), source: z.string().trim().min(1).max(12000), request: leadAiResponseSchema.shape.request, fields: z.array(z.string()).min(1).max(20) }).parse(input))
  .handler(async ({ data, context }): Promise<Result<string>> => {
    const { clientScope, entityRequests } = await import("./context.server");
    const { assertClientAiEnabled } = await import("./paid.server");
    try {
      const scope = await clientScope(context.supabase, context.userId, data.entity);
      await assertClientAiEnabled(scope.organizationId);
      const requests = await entityRequests(context.supabase, context.userId, data.entity);
      const existing = data.requestId ? requests.find(r => r.id === data.requestId) : null;
      if (data.requestId && !existing) return { ok: false, message: "Cererea nu este disponibilă." };
      if (data.entity.kind === "lead" && requests.length && !existing) return { ok: false, message: "Lead-ul are deja o cerere. Alege cererea existentă." };
      const changes = confirmedChanges(data.source, data.request, data.fields, existing ?? {});
      const patch = applyChanges(existing ?? {}, changes);
      if (!changes.length) return { ok: false, message: "Nu există modificări confirmate cu dovadă în transcript." };
      if (!existing && patch["kind"] !== "buy" && patch["kind"] !== "rent") return { ok: false, message: "Confirmă și tipul cererii din transcript (cumpărare sau închiriere)." };
      if ((patch["budget_min"] !== undefined || patch["budget_max"] !== undefined) && typeof patch["currency"] !== "string") return { ok: false, message: "Confirmă moneda bugetului menționată în transcript." };
      if (data.entity.kind === "lead") {
        // Reuse the existing locked, transactional lead confirmation and matching flow.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: insight, error } = await supabaseAdmin.from("lead_ai_insights").insert({ organization_id: scope.organizationId, lead_id: data.entity.id, message_id: null, source_kind: "note", status: "done", source_text: [...new Set(changes.map(c => c.evidence))].join("\n"), extracted: JSON.parse(JSON.stringify(patch)) as import("@/integrations/supabase/types").Json, proposed_changes: changes as unknown as import("@/integrations/supabase/types").Json }).select("id").single();
        if (error || !insight) throw new Error("Cererea nu a fost salvată.");
        const r = await context.supabase.rpc("confirm_lead_ai_request", { _insight: insight.id, _fields: changes.map(c => c.field) });
        // This is a confirmed call proposal, not a new lead analysis/score or reply.
        await supabaseAdmin.from("lead_ai_insights").update({ status: "skipped", skip_reason: "dictated_call_confirmed" }).eq("id", insight.id).eq("organization_id", scope.organizationId);
        if (r.error) throw new Error("Cererea nu a fost salvată.");
        return { ok: true, value: insight.id };
      }
      if (existing) {
        const { data: saved, error } = await context.supabase.from("requests").update({ ...patch, updated_by: context.userId }).eq("id", existing.id).eq("organization_id", scope.organizationId).eq("updated_at", existing.updated_at).select("id").maybeSingle();
        if (error || !saved) throw new Error("Cererea s-a schimbat între timp. Reîncarcă și confirmă din nou.");
        return { ok: true, value: saved.id };
      }
      const { data: saved, error } = await context.supabase.from("requests").insert({ ...patch, kind: patch["kind"] === "rent" ? "rent" : "buy", title: "Cerere din apel confirmat", contact_id: data.entity.id, organization_id: scope.organizationId, assigned_to: context.userId, created_by: context.userId, status: "active" }).select("id").single();
      if (error || !saved) throw new Error("Cererea nu a fost salvată.");
      return { ok: true, value: saved.id };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Cererea nu a fost salvată." }; }
  });