/** Implementările reale (baza de date, stocare, AI, email) pentru rapoartele de proprietar. */
import type { GenerateDeps, LoadedRaw, ReportTarget, SendDeps } from "./run.server";
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { nextDay, romaniaMidnightUtc, type OwnerReportData, type OwnerReportNarrative } from "./report";

const BUCKET = "owner-reports";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function admin(): Promise<Db> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function loadRawReport(db: Db, t: ReportTarget, week: { start: string; end: string }, caller?:SupabaseClient<Database>): Promise<LoadedRaw | null> {
  const from = romaniaMidnightUtc(week.start);
  const to = romaniaMidnightUtc(nextDay(week.end));
  const { data: p } = await db.from("properties").select("id,organization_id,title,reference,price,currency,city,status,deleted_at,archived_at,owner_contact_id,assigned_to").eq("id", t.property_id).maybeSingle();
  if (!p || p.organization_id !== t.organization_id || p.status !== "active" || p.deleted_at || p.archived_at || !p.owner_contact_id) return null;
  const { portalDisplayName } = await import("@/lib/portals/registry");
  const {readComplete}=await import('./price.server');
  const rows=async<T>(q:(a:number,b:number)=>PromiseLike<{data:T[]|null;error:unknown}>)=>({data:await readComplete(q)});
  const portalLabel = (id: string) => { try { return portalDisplayName(id as never) || id; } catch { return id; } };
  const [visits, stats, listings, leads, msgs, viewings, acp, org, agent] = await Promise.all([
    rows<{source:string|null;views:number}>((a,b)=>db.from("site_feed_visits").select("source,views").eq("property_id", p.id).gte("occurred_on", week.start).lte("occurred_on", week.end).order('id').range(a,b)),
    rows<{portal:string;views:number}>((a,b)=>db.from("partner_api_statistics").select("portal,views").eq("property_id", p.id).eq("environment", "live").gte("date", week.start).lte("date", week.end).order('date').order('portal').range(a,b)),
    rows<{portal:string;status:string}>((a,b)=>db.from("portal_listings").select("portal,status").eq("property_id", p.id).in("status", ["published", "updated"]).order('id').range(a,b)),
    rows<{source:string|null}>((a,b)=>db.from("leads").select("source").eq("organization_id",p.organization_id).eq("property_id", p.id).is("deleted_at", null).gte("created_at", from).lt("created_at", to).order('id').range(a,b)),
    db.from("portal_messages").select("id", { count: "exact", head: true }).eq("property_id", p.id).eq("direction", "in").gte("created_at", from).lt("created_at", to),
    rows<{status:string;description:string|null}>((a,b)=>db.from("activities").select("status,description").eq("organization_id",p.organization_id).eq("property_id", p.id).eq("kind", "viewing").neq("status", "cancelled").gte("starts_at", from).lt("starts_at", to).order('id').range(a,b)),
    db.from("acp_analyses").select("estimated_min,estimated_max").eq("property_id", p.id).eq("organization_id", p.organization_id).not("estimated_min", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("organizations").select("name,logo_path,material_accent_color").eq("id", p.organization_id).maybeSingle(),
    p.assigned_to ? db.from("profiles").select("full_name,phone,email").eq("id", p.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if(msgs.error || org.error || agent.error)throw new Error('Statisticile raportului nu sunt disponibile.');
  let logo: Uint8Array | null = null;
  if (org.data?.logo_path && /\.(png|jpe?g)$/i.test(org.data.logo_path)) {
    const { data: file } = await db.storage.from("agency-logos").download(org.data.logo_path);
    if (file) logo = new Uint8Array(await file.arrayBuffer());
  }
  const {loadPriceEstimate}=await import('./price.server');
  const role=caller?await caller.rpc('is_org_admin'):null;
  if(role?.error)throw new Error('Accesul nu a putut fi verificat.');
  const estimate=await loadPriceEstimate(caller??db,p.organization_id,p.id,role?.data===true?undefined:(t.actorUserId??p.assigned_to??undefined));
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    raw: {
      week,
      property: { title: p.title, reference: p.reference ?? null, price: num(p.price), currency: p.currency ?? "EUR", city: p.city ?? null },
      siteVisits: (visits.data ?? []).map((v: { source: string | null; views: number }) => ({ source: "site", views: Number(v.views) })),
      portalStats: (stats.data ?? []).map((s: { portal: string; views: number }) => ({ portal: s.portal, views: Number(s.views) })),
      publishedPortals: (listings.data ?? []).map((l: { portal: string }) => l.portal),
      leads: (leads.data ?? []).map((l: { source: string | null }) => ({ source: l.source })),
      inboundMessages: msgs.count ?? 0,
      viewings: (viewings.data ?? []).map((v: { status: string; description: string | null }) => ({ status: v.status, description: v.description?.trim()?'Feedback notat':null })),
      acp: acp.data ? { estimated_min: num(acp.data.estimated_min), estimated_max: num(acp.data.estimated_max) } : null,
      estimate,
      agent: { name: agent.data?.full_name ?? org.data?.name ?? "Agentul tău", phone: agent.data?.phone ?? null, email: agent.data?.email ?? null },
      agency: { name: org.data?.name ?? "Agenția", accent: org.data?.material_accent_color ?? null },
      portalLabel: (id: string) => (id === "site" ? "Site agenție" : portalLabel(id)),
    },
    forbiddenNames:[],
    feedbackNotes:[],
    ownerContactId: p.owner_contact_id,
    agentId: p.assigned_to ?? null,
    logo,
  };
}

export async function createGenerateDeps(caller?:SupabaseClient<Database>): Promise<GenerateDeps> {
  const db = await admin();
  const { resolveAiProvider } = await import("@/lib/ai/providers/registry.server");
  const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
  const { withAiCredits, aiCreditsBlockedMessage } = await import("@/lib/ai/credits/credits.server");
  const { withAiProviderFallback } = await import("@/lib/ai/providers/fallback.server");
  const { buildOwnerReportPdf } = await import("./pdf.server");
  const primary = resolveAiProvider("standard");
  const usage:{current:{provider:string;model:string;input_tokens:number|null;output_tokens:number|null;latency_ms:number}|null}={current:null};
  const readUsage=()=>usage.current;
  return {
    claim: async (t, week) => {
      const { data,error } = await db.from("owner_reports").upsert({ organization_id: t.organization_id, property_id: t.property_id, week_start: week.start, week_end: week.end, auto_send: false }, { onConflict: "property_id,week_start", ignoreDuplicates: true }).select("id");
      if(error)throw new Error('Ciorna raportului nu a putut fi creată.');
      return data?.[0]?.id ?? null;
    },
    loadRaw: (t, week) => loadRawReport(db, t, week,caller),
    isFeatureEnabled: (org) => isAiFeatureEnabled(org, "ai_owner_report"),
    creditsBlocked: (org) => aiCreditsBlockedMessage(org),
    withCredits: (actor, run, ok) => withAiCredits(actor, "owner_report", async()=>{
      usage.current=null;
      const result=await run();
      const current=readUsage();
      if(current){
        const {writeAiUsage}=await import('@/lib/ai/usage/tracking.server');
        await writeAiUsage(db,{...current,organization_id:actor.organizationId,user_id:actor.userId,capability:'owner_report',success:ok(result),tool_calls:0});
      }
      return result;
    }, { isSuccess: ok }),
    provider: primary ? { generate: async (req) => {
      const started=Date.now();
      const outcome=await withAiProviderFallback(primary,(p)=>p.generate(req));
      // Usage is written in withCredits below with the verified requesting actor.
      usage.current={provider:outcome.provider.id,model:outcome.provider.model,input_tokens:outcome.result.inputTokens,output_tokens:outcome.result.outputTokens,latency_ms:Date.now()-started};
      return outcome.result;
    } } : null,
    renderPdf: buildOwnerReportPdf,
    savePdf: async (id, bytes) => {
      const path = `${id}.pdf`;
      const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (error) throw new Error(error.message);
      return path;
    },
    finalize: async (id, patch) => { const {error}=await db.from("owner_reports").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id); if(error)throw new Error('Raportul nu a putut fi salvat.'); },
    // Un eșec eliberează slotul, ca o rulare ulterioară din aceeași zi să reîncerce.
    release: async (id) => { await db.from("owner_reports").delete().eq("id", id).is("pdf_path", null); },
    notify: async (n) => { await db.from("notifications").insert({ organization_id: n.organizationId, user_id: n.userId, type: "owner_report", title: n.title, body: n.body, link: n.link }); },
  };
}

export async function createSendDeps(): Promise<SendDeps> {
  const db = await admin();
  const { sendEmail } = await import("@/lib/mailgun.server");
  return {
    lockDraft: async (id) => {
      const { data } = await db.from("owner_reports").update({ sent_via: "sending", send_error: null }).eq("id", id).eq("status", "draft").is("sent_via", null).not("pdf_path", "is", null)
        .select("id,organization_id,property_id,owner_contact_id,agent_id,pdf_path,data,narrative");
      const r = data?.[0];
      return r ? { ...r, data: r.data as OwnerReportData, narrative: r.narrative as OwnerReportNarrative } : null;
    },
    unlock: async (id, error) => { await db.from("owner_reports").update({ sent_via: null, send_error: error.slice(0, 300) }).eq("id", id).eq("sent_via", "sending"); },
    loadRecipients: async (ownerId, agentId) => {
      const [{ data: c }, { data: a }] = await Promise.all([
        db.from("contacts").select("email,first_name").eq("id", ownerId).maybeSingle(),
        agentId ? db.from("profiles").select("email").eq("id", agentId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      return { ownerEmail: c?.email?.trim() || null, ownerFirstName: c?.first_name?.trim() || null, agentEmail: a?.email ?? null };
    },
    loadPdf: async (path) => {
      const { data } = await db.storage.from(BUCKET).download(path);
      return data ? new Uint8Array(await data.arrayBuffer()) : null;
    },
    sendEmail: async (m) => {
      const r = await sendEmail({ to: m.to, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html, sendKey: m.sendKey, attachments: [{ filename: m.attachment.filename, contentType: "application/pdf", size: m.attachment.data.byteLength, data: m.attachment.data }] as never });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    markSent: async (id, by, via) => { await db.from("owner_reports").update({ status: "sent", sent_at: new Date().toISOString(), sent_by: by, sent_via: via, updated_at: new Date().toISOString() }).eq("id", id); },
    logActivity: async (r) => {
      const now = new Date().toISOString();
      await db.from("activities").insert({ organization_id: r.organizationId, kind: "email", status: "done", done: true, starts_at: now, title: r.title, description: r.description, contact_id: r.contactId, property_id: r.propertyId, assigned_to: r.agentId, created_by: r.agentId });
    },
  };
}

export async function signedPdfUrl(path: string, seconds = 30 * 24 * 3600): Promise<string | null> {
  const db = await admin();
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
