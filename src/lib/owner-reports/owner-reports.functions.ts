import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const propInput = z.object({ propertyId: z.string().uuid() });
const reportInput = z.object({ reportId: z.string().uuid() });

export type OwnerReportRow = { id: string; week_start: string; week_end: string; status: "draft" | "sent" | "skipped" | "failed"; is_ai: boolean; auto_send: boolean; sent_at: string | null; sent_via: string | null; send_error: string | null; short_text: string | null; has_pdf: boolean };
export type OwnerReportPanel = { allowed: boolean; hasOwner: boolean; ownerHasEmail: boolean; canAutoSend: boolean; enabled: boolean; autoSend: boolean; reports: OwnerReportRow[] };

/** Panoul raportului: vizibil agentului proprietății și adminului (RLS + can_see_property_reports). */
export const getOwnerReportPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => propInput.parse(d))
  .handler(async ({ data, context }): Promise<OwnerReportPanel> => {
    const sb = context.supabase;
    const { data: allowed } = await sb.rpc("can_see_property_reports", { _property: data.propertyId });
    const empty: OwnerReportPanel = { allowed: false, hasOwner: false, ownerHasEmail: false, canAutoSend: false, enabled: false, autoSend: false, reports: [] };
    if (!allowed) return empty;
    const { data: p } = await sb.from("properties").select("owner_contact_id").eq("id", data.propertyId).maybeSingle();
    const ownerId = p?.owner_contact_id ?? null;
    const [{ data: owner }, { data: s }, { data: reports }] = await Promise.all([
      ownerId ? sb.from("contacts").select("email,gdpr_consent,gdpr_withdrawn_at").eq("id", ownerId).maybeSingle() : Promise.resolve({ data: null }),
      sb.from("owner_report_settings").select("enabled,auto_send").eq("property_id", data.propertyId).maybeSingle(),
      sb.from("owner_reports").select("id,week_start,week_end,status,is_ai,auto_send,sent_at,sent_via,send_error,short_text,pdf_path").eq("property_id", data.propertyId).order("week_start", { ascending: false }).limit(52),
    ]);
    const { canAutoSend } = await import("./report");
    const o = owner as { email: string | null; gdpr_consent: boolean; gdpr_withdrawn_at: string | null } | null;
    return {
      allowed: true, hasOwner: !!ownerId, ownerHasEmail: !!o?.email?.includes("@"), canAutoSend: canAutoSend(o),
      enabled: !!s?.enabled, autoSend: !!s?.auto_send,
      reports: (reports ?? []).map(({ pdf_path, ...r }) => ({ ...r, status: r.status as OwnerReportRow["status"], has_pdf: !!pdf_path })),
    };
  });

export const saveOwnerReportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => propInput.extend({ enabled: z.boolean(), autoSend: z.boolean() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    const { data: allowed } = await context.supabase.rpc("can_see_property_reports", { _property: data.propertyId });
    if (!allowed) return { ok: false, message: "Nu ai acces la această proprietate." };
    const { data: p } = await context.supabase.from("properties").select("organization_id,owner_contact_id").eq("id", data.propertyId).maybeSingle();
    if (!p) return { ok: false, message: "Proprietatea nu este disponibilă." };
    if (data.enabled && !p.owner_contact_id) return { ok: false, message: "Adaugă mai întâi proprietarul." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("owner_report_settings").upsert({ property_id: data.propertyId, organization_id: p.organization_id, enabled: data.enabled, auto_send: data.enabled && data.autoSend, updated_by: context.userId });
    if (error) return { ok: false, message: /consent/.test(error.message) ? "„Trimite automat” cere emailul proprietarului și consimțământul GDPR înregistrat." : "Setarea nu a putut fi salvată." };
    if (!data.autoSend) await supabaseAdmin.from("owner_reports").update({ auto_send: false }).eq("property_id", data.propertyId).eq("status", "draft");
    return { ok: true };
  });

async function visibleReport(sb: { from: (t: "owner_reports") => any }, id: string) {
  const { data } = await sb.from("owner_reports").select("id,property_id,status,pdf_path,short_text,owner_contact_id,data").eq("id", id).maybeSingle();
  return data as { id: string; property_id: string; status: string; pdf_path: string | null; short_text: string | null; owner_contact_id: string | null; data: unknown } | null;
}

/** „Trimite pe email”: doar la clicul agentului. */
export const sendOwnerReportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reportInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    const r = await visibleReport(context.supabase as never, data.reportId);
    if (!r) return { ok: false, message: "Raportul nu este disponibil." };
    const { createSendDeps } = await import("./deps.server");
    const { sendOwnerReport } = await import("./run.server");
    return sendOwnerReport(await createSendDeps(), r.id, { userId: context.userId, via: "email" });
  });

export const skipOwnerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reportInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    const r = await visibleReport(context.supabase as never, data.reportId);
    if (!r || r.status !== "draft") return { ok: false, message: "Raportul nu mai este o ciornă." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd } = await supabaseAdmin.from("owner_reports").update({ status: "skipped", auto_send: false, updated_at: new Date().toISOString() }).eq("id", r.id).eq("status", "draft").is("sent_via", null).select("id");
    return upd?.length ? { ok: true } : { ok: false, message: "Raportul este deja în curs de trimitere." };
  });

/** Link PDF semnat (30 de zile) + textul scurt pentru WhatsApp; „WhatsApp” se înregistrează la confirmarea agentului. */
export const getOwnerReportLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reportInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string; pdfUrl?: string; text?: string; phone?: string | null }> => {
    const r = await visibleReport(context.supabase as never, data.reportId);
    if (!r?.pdf_path) return { ok: false, message: "PDF-ul nu este disponibil." };
    const { signedPdfUrl } = await import("./deps.server");
    const { shortReportText } = await import("./report");
    const pdfUrl = await signedPdfUrl(r.pdf_path);
    if (!pdfUrl) return { ok: false, message: "Linkul PDF nu a putut fi creat." };
    const { data: c } = r.owner_contact_id ? await context.supabase.from("contacts").select("phone").eq("id", r.owner_contact_id).maybeSingle() : { data: null };
    return { ok: true, pdfUrl, text: shortReportText(r.data as never, pdfUrl), phone: (c as { phone?: string | null } | null)?.phone ?? null };
  });

/** Agentul confirmă că a trimis pe WhatsApp: status trimis + activitate la proprietar. */
export const markOwnerReportSentWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reportInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    const r = await visibleReport(context.supabase as never, data.reportId);
    if (!r || r.status !== "draft") return { ok: false, message: "Raportul nu mai este o ciornă." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: upd } = await supabaseAdmin.from("owner_reports").update({ status: "sent", sent_at: now, sent_by: context.userId, sent_via: "whatsapp", updated_at: now }).eq("id", r.id).eq("status", "draft").is("sent_via", null).select("organization_id");
    if (!upd?.length) return { ok: false, message: "Raportul este deja în curs de trimitere." };
    const week = r.data as { week?: { start: string; end: string } };
    await supabaseAdmin.from("activities").insert({ organization_id: upd[0]!.organization_id, kind: "note", status: "done", done: true, starts_at: now, title: "Raport săptămânal trimis proprietarului", description: `Săptămâna ${week.week?.start ?? ""} – ${week.week?.end ?? ""}, trimis pe WhatsApp.`, contact_id: r.owner_contact_id, property_id: r.property_id, assigned_to: context.userId, created_by: context.userId });
    return { ok: true };
  });
