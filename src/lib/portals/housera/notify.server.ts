/**
 * Notificări Housera (H12): același mecanism ca la Storia (`notifyAgentOfStoriaMessage`),
 * cu „Housera.ro” și link direct la lead. Fără agent → administratorii agenției.
 * Email: maximum unul la 10 minute per lead (`portal_lead_links.last_email_notified_at`).
 */
import { notifyAgentOfStoriaMessage } from "../storia/messages.server";
import { activeHouseraEnv } from "./config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export const HOUSERA_EMAIL_GROUP_MS = 10 * 60_000;

export async function notifyHouseraLead(admin: Admin, input: {
  organizationId: string; assignedTo: string | null; leadId: string; externalLeadId: string;
  propertyTitle: string; senderName: string; body: string | null; messageKey: string;
  /** false când `ingestPortalLead` a creat deja notificarea în aplicație pentru agent. */
  inApp: boolean; now: Date;
}): Promise<void> {
  let recipients: string[] = input.assignedTo ? [input.assignedTo] : [];
  let inApp = input.inApp;
  if (!recipients.length) {
    const { data } = await admin.from("user_roles").select("user_id").eq("organization_id", input.organizationId).eq("role", "agency_admin");
    recipients = [...new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id))];
    inApp = true;
  }
  if (!recipients.length) return;

  const { data: link } = await admin.from("portal_lead_links").select("id, last_email_notified_at")
    .eq("portal", "housera").eq("organization_id", input.organizationId).eq("external_lead_id", input.externalLeadId).eq("environment", activeHouseraEnv()).maybeSingle();
  const last = link?.last_email_notified_at ? Date.parse(link.last_email_notified_at as string) : 0;
  const email = !last || input.now.getTime() - last >= HOUSERA_EMAIL_GROUP_MS;
  if (email && link?.id) await admin.from("portal_lead_links").update({ last_email_notified_at: input.now.toISOString() }).eq("id", link.id);

  for (const userId of recipients) {
    await notifyAgentOfStoriaMessage(admin, {
      organizationId: input.organizationId, assignedTo: userId, propertyTitle: input.propertyTitle, leadId: input.leadId,
      senderName: input.senderName, body: input.body, messageKey: input.messageKey, inApp,
      portalLabel: "Housera.ro", keyPrefix: "housera-message", link: `/app/leads?lead=${input.leadId}`, email,
    });
  }
}
