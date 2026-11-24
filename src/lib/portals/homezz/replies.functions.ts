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
  const { data: link } = await supabaseAdmin.from("portal_lead_links").select("external_lead_id")
    .eq("portal", "homezz").eq("organization_id", lead.organization_id).eq("lead_id", leadId).limit(1).maybeSingle();
  return { lead, linked: !!link, canSend: lead.assigned_to === ctx.userId || isAdmin === true, admin: supabaseAdmin, conversationId: (link?.external_lead_id as string | undefined) ?? null };
}

async function guard(context: unknown, leadId: string) {
  const a = await replyAccess(context as Ctx, leadId);
  if (!a?.linked) throw new Error("Lead-ul nu este legat de o conversație HomeZZ.");
  if (!a.canSend) throw new Error("Doar agentul responsabil sau administratorul agenției poate răspunde.");
  return a;
}

export const getHomezzReplyState = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await replyAccess(context as unknown as Ctx, data.leadId);
    return { linked: !!a?.linked, canSend: !!a?.canSend };
  });

export const sendHomezzLeadReply = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await guard(context, data.leadId);
    const { sendHomezzReply, homezzReplyDeps } = await import("./replies.server");
    return sendHomezzReply(await homezzReplyDeps(a.admin), {
      organizationId: a.lead.organization_id, leadId: data.leadId, conversationId: a.conversationId!,
      propertyId: a.lead.property_id ?? null, userId: (context as unknown as Ctx).userId, body: data.body,
    });
  });

/** Retrimitere doar la cererea agentului (send-message nu e idempotent). */
export const retryHomezzLeadReply = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid(), messageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await guard(context, data.leadId);
    const { data: row } = await a.admin.from("portal_messages").select("id, lead_id, portal").eq("id", data.messageId).maybeSingle();
    if (!row || row.lead_id !== data.leadId || row.portal !== "homezz") throw new Error("Mesajul nu există.");
    const { deliverHomezzReply, homezzReplyDeps } = await import("./replies.server");
    return deliverHomezzReply(await homezzReplyDeps(a.admin), data.messageId);
  });
