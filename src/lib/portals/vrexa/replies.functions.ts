import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Doar agentul responsabil al lead-ului sau administratorul agenției; lead-ul citit cu RLS-ul apelantului. */
async function replyAccess(ctx: Ctx, leadId: string) {
  const { data: lead } = await ctx.supabase.from("leads").select("id, organization_id, assigned_to, property_id").eq("id", leadId).maybeSingle();
  if (!lead) return null;
  const { data: isAdmin } = await ctx.supabase.rpc("is_org_admin");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { vrexaCredentialsForOrg } = await import("./messages.server");
  const c = await vrexaCredentialsForOrg(supabaseAdmin, lead.organization_id);
  const env = c?.creds.env ?? null;
  const { data: link } = env ? await supabaseAdmin.from("portal_lead_links").select("external_lead_id")
    .eq("portal", "vrexa").eq("organization_id", lead.organization_id).eq("lead_id", leadId).eq("environment", env).limit(1).maybeSingle() : { data: null };
  return { lead, linked: !!link, creds: c?.creds ?? null, canSend: lead.assigned_to === ctx.userId || isAdmin === true, admin: supabaseAdmin, conversationId: (link?.external_lead_id as string | undefined) ?? null };
}

async function guard(context: unknown, leadId: string) {
  const a = await replyAccess(context as Ctx, leadId);
  if (!a?.linked || !a.creds) throw new Error("Lead-ul nu este legat de o conversație Vrexa.");
  if (!a.canSend) throw new Error("Doar agentul responsabil sau administratorul agenției poate răspunde.");
  return { ...a, creds: a.creds };
}

export const getVrexaReplyState = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await replyAccess(context as unknown as Ctx, data.leadId);
    return { linked: !!a?.linked, canSend: !!a?.canSend };
  });

export const sendVrexaLeadReply = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await guard(context, data.leadId);
    const { sendVrexaReply } = await import("./replies");
    const { vrexaReplyDeps } = await import("./messages.server");
    return sendVrexaReply(vrexaReplyDeps(a.admin, a.creds), a.creds.env, {
      organizationId: a.lead.organization_id, leadId: data.leadId, conversationId: a.conversationId!,
      propertyId: a.lead.property_id ?? null, userId: (context as unknown as Ctx).userId, body: data.body,
    });
  });

/** Retrimitere doar la cererea agentului: după eroare sau după 15 minute fără confirmare. */
export const retryVrexaLeadReply = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid(), messageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await guard(context, data.leadId);
    const { data: row } = await a.admin.from("portal_messages").select("id, lead_id, portal, delivery_status, updated_at").eq("id", data.messageId).maybeSingle();
    if (!row || row.lead_id !== data.leadId || row.portal !== "vrexa") throw new Error("Mesajul nu există.");
    const { deliverVrexaReply, vrexaReplyRetryable } = await import("./replies");
    if (!vrexaReplyRetryable(row, Date.now())) throw new Error("Mesajul așteaptă încă confirmarea de la Vrexa (până la 15 minute).");
    const { vrexaReplyDeps } = await import("./messages.server");
    return deliverVrexaReply(vrexaReplyDeps(a.admin, a.creds), a.creds.env, data.messageId);
  });
