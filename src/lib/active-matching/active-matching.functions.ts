import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const draftInput = z.object({ alertId: z.string().uuid(), regenerate: z.boolean().optional() });

export type AlertDraftDto = {
  ok: boolean; message?: string; text?: string; isAi?: boolean; notice?: string | null;
  phone?: string | null; email?: string | null; subject?: string; link?: string | null;
};

/** Ciorna se generează la deschiderea alertei (nu în avans). Nu trimite nimic. */
export const getMatchAlertDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftInput.parse(d))
  .handler(async ({ data, context }): Promise<AlertDraftDto> => {
    const sb = context.supabase;
    // Vizibilitatea alertei (agentul ei sau adminul agenției) vine din RLS-ul apelantului.
    const { data: alert } = await sb.from("active_match_alerts").select("id,organization_id,property_id,contact_id,draft,draft_is_ai").eq("id", data.alertId).maybeSingle();
    if (!alert) return { ok: false, message: "Alerta nu este disponibilă." };
    const [{ data: p }, { data: c }] = await Promise.all([
      sb.from("properties").select("id,title,transaction_kind,property_type,price,currency,rooms,surface,usable_surface,floor,city,balcony,parking,description,publish_status").eq("id", alert.property_id).maybeSingle(),
      alert.contact_id ? sb.from("contacts").select("first_name,phone,email").eq("id", alert.contact_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!p) return { ok: false, message: "Proprietatea nu mai este disponibilă." };
    const { offerShareUrl } = await import("@/lib/share");
    const link = p.publish_status === "published" ? offerShareUrl(p.id) : null;
    const contact = c as { first_name?: string | null; phone?: string | null; email?: string | null } | null;
    const base = { phone: contact?.phone ?? null, email: contact?.email ?? null, subject: `Proprietate potrivită: ${p.title}`, link };
    if (alert.draft && !data.regenerate) return { ok: true, text: alert.draft, isAi: alert.draft_is_ai, notice: null, ...base };

    const { createDraftDeps } = await import("./deps.server");
    const { buildAlertDraft } = await import("./draft.server");
    const num = (v: unknown) => (v == null ? null : Number(v));
    const result = await buildAlertDraft(await createDraftDeps(), {
      organizationId: alert.organization_id, userId: context.userId, clientFirstName: contact?.first_name?.trim() || null, link,
      property: { title: p.title, transaction_kind: p.transaction_kind, property_type: p.property_type, price: num(p.price), currency: p.currency, rooms: p.rooms, surface: num(p.surface), usable_surface: num(p.usable_surface), floor: num(p.floor), city: p.city, balcony: !!p.balcony, parking: (p.parking as string | null) ?? null, description: p.description },
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("active_match_alerts").update({ draft: result.text, draft_is_ai: result.isAi, updated_at: new Date().toISOString() }).eq("id", alert.id);
    return { ok: true, ...result, ...base };
  });

const statusInput = z.object({ alertId: z.string().uuid(), status: z.enum(["sent", "ignored", "new"]) });

/** „Am trimis” marchează alerta și creează o activitate în istoricul clientului. */
export const setMatchAlertStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => statusInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    const sb = context.supabase;
    const { data: alert } = await sb.from("active_match_alerts").select("id,organization_id,property_id,request_id,contact_id,status,score").eq("id", data.alertId).maybeSingle();
    if (!alert) return { ok: false, message: "Alerta nu este disponibilă." };
    const now = new Date().toISOString();
    if (data.status === "sent" && alert.status !== "sent") {
      const { data: p } = await sb.from("properties").select("title").eq("id", alert.property_id).maybeSingle();
      const { error } = await sb.from("activities").insert({
        organization_id: alert.organization_id, kind: "note", status: "done", done: true, starts_at: now,
        title: `Ofertă trimisă clientului: ${p?.title ?? "proprietate"}`, description: `Potrivire ${alert.score}% (Potriviri active).`,
        contact_id: alert.contact_id, request_id: alert.request_id, property_id: alert.property_id, assigned_to: context.userId, created_by: context.userId,
      } as never);
      if (error) return { ok: false, message: "Activitatea nu a putut fi salvată." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("active_match_alerts").update({ status: data.status, sent_at: data.status === "sent" ? now : null, updated_at: now }).eq("id", alert.id);
    return { ok: true };
  });

/** Pragul agenției: citit de toți membrii, salvat doar de adminul agenției (RLS). */
export const saveActiveMatchThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ minScore: z.number().int().min(50).max(100) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    const { data: org } = await context.supabase.rpc("current_org");
    if (!org) return { ok: false, message: "Agenția nu a fost găsită." };
    const { error } = await context.supabase.from("active_match_settings").upsert({ organization_id: org as string, min_score: data.minScore, updated_at: new Date().toISOString(), updated_by: context.userId });
    return error ? { ok: false, message: "Doar administratorul agenției poate schimba pragul." } : { ok: true };
  });
