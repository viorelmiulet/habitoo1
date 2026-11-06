import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { activeHouseraEnv } from "./config";

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Cine poate trimite: agentul responsabil al lead-ului sau administratorul agenției. */
async function replyAccess(ctx: Ctx, leadId: string) {
  const { data: lead } = await ctx.supabase.from("leads").select("id, organization_id, assigned_to, property_id").eq("id", leadId).maybeSingle();
  if (!lead) return null;
  const { data: isAdmin } = await ctx.supabase.rpc("is_org_admin");
  const canSend = lead.assigned_to === ctx.userId || isAdmin === true;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: link } = await supabaseAdmin.from("portal_lead_links").select("external_lead_id")
    .eq("portal", "housera").eq("organization_id", lead.organization_id).eq("lead_id", leadId).eq("environment", activeHouseraEnv()).maybeSingle();
  if (!link) return { lead, linked: false, canSend: false, reconnect: false, admin: supabaseAdmin, externalLeadId: null as string | null };
  const { data: conn } = await supabaseAdmin.from("portal_connections").select("status, settings, portal_credentials_encrypted")
    .eq("portal", "housera").eq("organization_id", lead.organization_id).maybeSingle();
  const settings = (conn?.settings ?? {}) as Record<string, unknown>;
  const reconnect = !conn?.portal_credentials_encrypted || conn.status !== "connected" || !!settings["reconnect_required"];
  return { lead, linked: true, canSend, reconnect, admin: supabaseAdmin, externalLeadId: link.external_lead_id as string };
}

export const getHouseraReplyState = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await replyAccess(context as unknown as Ctx, data.leadId);
    return { linked: !!a?.linked, canSend: !!a?.canSend, reconnect: !!a?.reconnect };
  });

async function clientFor(orgId: string) {
  const { loadHouseraKey, markHouseraReconnect } = await import("./store.server");
  const key = await loadHouseraKey(orgId);
  if (!key) throw new Error("Reconectează Housera din Setări → Portaluri");
  const { createHouseraClient } = await import("./client.server");
  const { houseraBaseUrl } = await import("./config");
  return createHouseraClient({ key, baseUrl: houseraBaseUrl(process.env), onUnauthorized: () => markHouseraReconnect(orgId) });
}

async function guard(context: unknown, leadId: string) {
  const a = await replyAccess(context as Ctx, leadId);
  if (!a?.linked) throw new Error("Lead-ul nu este legat de o cerere Housera.");
  if (!a.canSend) throw new Error("Doar agentul responsabil sau administratorul agenției poate răspunde.");
  if (a.reconnect) throw new Error("Reconectează Housera din Setări → Portaluri");
  return a;
}

export const sendHouseraLeadReply = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await guard(context, data.leadId);
    const { sendHouseraReply } = await import("./replies.server");
    return sendHouseraReply(a.admin, await clientFor(a.lead.organization_id), {
      organizationId: a.lead.organization_id, leadId: data.leadId, externalLeadId: a.externalLeadId!,
      propertyId: a.lead.property_id ?? null, userId: (context as unknown as Ctx).userId, body: data.body,
    });
  });

export const retryHouseraLeadReply = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid(), messageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await guard(context, data.leadId);
    const { data: row } = await a.admin.from("portal_messages").select("id, lead_id").eq("id", data.messageId).maybeSingle();
    if (!row || row.lead_id !== data.leadId) throw new Error("Mesajul nu există.");
    const { deliverHouseraReply } = await import("./replies.server");
    return deliverHouseraReply(a.admin, await clientFor(a.lead.organization_id), data.messageId);
  });
