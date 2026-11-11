import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { prepareOutreachCsv, outreachStatuses, type ImportSummary, type OutreachList, type OutreachDetail } from "@/lib/outreach";

async function assertSuperadmin(context: { supabase: { rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: unknown }> } }) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) throw new Error("Acces permis exclusiv Superadminului.");
}

export const getOutreachLists = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertSuperadmin(context);
  const { data, error } = await context.supabase.rpc("outreach_list_summaries");
  if (error) throw new Error("Listele nu au putut fi încărcate.");
  return data as unknown as OutreachList[];
});

export const importOutreachCsv = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().trim().min(1).max(160), csv: z.string().max(5_000_000), listId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const prepared = prepareOutreachCsv(data.csv);
    const { data: result, error } = await context.supabase.rpc("outreach_import", {
      _name: data.name, _rows: prepared.rows, _invalid: prepared.invalid, _duplicates: prepared.duplicates,
      ...(data.listId ? { _list_id: data.listId } : {}),
    });
    if (error) throw new Error("Importul nu a fost salvat. Încearcă din nou.");
    return result as unknown as ImportSummary & { list_id: string };
  });

export const getOutreachDetail = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listId: z.string().uuid(), q: z.string().trim().max(200).default(""), status: z.enum(["", ...outreachStatuses]).default(""), city: z.string().max(2000).default(""), page: z.number().int().min(1).max(100000).default(1) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { data: result, error } = await context.supabase.rpc("outreach_list_detail", { _list_id: data.listId, _q: data.q, _status: data.status, _city: data.city, _page: data.page });
    if (error) throw new Error("Lista nu a putut fi încărcată.");
    return result as unknown as OutreachDetail;
  });

export const excludeOutreachRecipient = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { error } = await context.supabase.rpc("outreach_exclude", { _recipient_id: data.id });
    if (error) throw new Error("Excluderea nu a fost salvată.");
    return { ok: true };
  });
const campaignListInput = z.object({ listId: z.string().uuid() });
export type OutreachCampaign = { id: string; list_id: string; name: string; subject: string; body_text: string; sender_name: string; footer_text: string; status: OutreachCampaignStatus; updated_at: string };
export type OutreachCampaignStatus = "draft" | "ready" | "sending" | "paused" | "completed";
export type OutreachPreviewRecipient = { agency_name: string | null; city: string | null; email: string; unsubscribe_token: string };

export const getOutreachCampaign = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => campaignListInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const [{ data: campaign, error }, { data: recipient, error: rErr }] = await Promise.all([
      context.supabase.from("outreach_campaigns").select("id,list_id,name,subject,body_text,sender_name,footer_text,status,updated_at").eq("list_id", data.listId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      context.supabase.from("outreach_recipients").select("agency_name,city,email,unsubscribe_token").eq("list_id", data.listId).order("created_at").order("id").limit(1).maybeSingle(),
    ]);
    if (error || rErr) throw new Error("Mesajul nu a putut fi încărcat.");
    return { campaign: campaign as OutreachCampaign | null, recipient: recipient as OutreachPreviewRecipient | null };
  });

export const saveOutreachCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listId: z.string().uuid(), id: z.string().uuid().nullable(), campaign: z.unknown() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { validateCampaign } = await import("./outreach-message");
    const valid = validateCampaign(data.campaign);
    if (!valid.ok) throw new Error(valid.error);
    if (data.id) {
      const { data: cur } = await context.supabase.from("outreach_campaigns").select("status").eq("id", data.id).maybeSingle();
      if (cur && cur.status !== "draft" && cur.status !== "ready") throw new Error("Mesajul nu se poate modifica după pornirea trimiterii.");
    }
    const q = data.id
      ? context.supabase.from("outreach_campaigns").update(valid.value).eq("id", data.id).eq("list_id", data.listId)
      : context.supabase.from("outreach_campaigns").insert({ ...valid.value, list_id: data.listId });
    const { data: row, error } = await q.select("id").single();
    if (error || !row) throw new Error("Mesajul nu a fost salvat.");
    return { id: row.id };
  });

export const sendOutreachTest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid(), to: z.string().max(254) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { runTestSend } = await import("./outreach-message");
    const db = context.supabase;
    return runTestSend({
      loadCampaign: async (id) => { const { data: c } = await db.from("outreach_campaigns").select("list_id,name,subject,body_text,sender_name,footer_text,status").eq("id", id).maybeSingle(); return c ? { ...c, status: c.status === "ready" ? "ready" as const : "draft" as const } : null; },
      firstRecipient: async (listId) => { const { data: r } = await db.from("outreach_recipients").select("agency_name,city,unsubscribe_token").eq("list_id", listId).order("created_at").order("id").limit(1).maybeSingle(); return r; },
      take: async (id, to) => { const { data: ok, error } = await db.rpc("outreach_test_send_take", { _campaign_id: id, _to: to }); if (error) throw new Error("Trimiterea de test nu a putut fi înregistrată."); return ok === true; },
      // Gmail of the platform (contact@habitoo.ro) only — no Mailgun fallback for outreach.
      send: async (msg) => { const { sendWorkspaceGmail } = await import("./gmail/gmail-workspace.server"); return sendWorkspaceGmail(msg); },
    }, data.campaignId, data.to);
  });

export type OutreachProgress = { status: OutreachCampaignStatus; daily_limit: number; window_start: string; window_end: string; weekdays_only: boolean; delay_seconds: number; counts: Partial<Record<string, number>>; total: number; sent_today: number; last_sent_at: string | null; last_error: string | null; paused_reason: string | null };

export const getOutreachProgress = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { data: p, error } = await context.supabase.rpc("outreach_campaign_progress", { _campaign_id: data.campaignId });
    if (error) throw new Error("Progresul nu a putut fi încărcat.");
    return p as unknown as OutreachProgress | null;
  });

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ora trebuie să fie în formatul HH:MM.");
export const outreachSettingsSchema = z.object({
  daily_limit: z.number().int().min(1).max(1500),
  window_start: hhmm, window_end: hhmm,
  weekdays_only: z.boolean(),
  delay_seconds: z.number().int().min(5).max(3600),
}).refine((v) => v.window_start < v.window_end, "Ora de început trebuie să fie înainte de ora de sfârșit.");

export const controlOutreachCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid(), action: z.enum(["start", "pause", "resume", "settings"]), settings: outreachSettingsSchema.optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    if (data.action === "settings" && !data.settings) throw new Error("Setări lipsă.");
    const { data: status, error } = await context.supabase.rpc("outreach_campaign_control", { _campaign_id: data.campaignId, _action: data.action, ...(data.settings ? { _settings: data.settings } : {}) });
    if (error) throw new Error(error.message || "Acțiunea nu a fost salvată.");
    return { status: status as OutreachCampaignStatus };
  });

export const outreachRecipientAction = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["retry", "bounce"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { error } = await context.supabase.rpc("outreach_recipient_action", { _recipient_id: data.id, _action: data.action });
    if (error) throw new Error(error.message || "Acțiunea nu a fost salvată.");
    return { ok: true };
  });
