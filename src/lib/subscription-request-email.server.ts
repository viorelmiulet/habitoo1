import { sendSubscriptionEmail, type SubscriptionEmailEvidence } from "./subscription-request-email";
import { sendTemplateEmail } from "./email-templates/send-email";
import { z } from "zod";

export async function notifySubscriptionRequest(requestId: string, actorId: string) {
  // Called only after the authenticated RPC has created this user's request.
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: request, error } = await db.from("subscription_requests").select("*, organizations(name)").eq("id", requestId).eq("requested_by", actorId).single();
  if (error || !request) throw new Error("Cererea nu poate fi citită.");
  const { data: profile } = await db.from("profiles").select("full_name").eq("id", actorId).maybeSingle();
  const emailData = { requestId, agency: request.organizations?.name ?? "Agenție", plan: request.plan, term: request.term, requester: profile?.full_name ?? "Administrator agenție", note: request.note ?? "" };
  const to = process.env["CONTACT_INBOX"] ?? "contact@habitoo.ro";
  return sendSubscriptionEmail(emailData, to, {
    now: () => new Date().toISOString(),
    send: (data, recipient, key) => sendTemplateEmail("subscription-request", recipient, { templateData: data, idempotencyKey: key }),
    save: async evidence => {
      const { error: saveError } = await db.from("audit_logs").insert({ organization_id: request.organization_id, actor_id: actorId, entity: "subscription_requests", entity_id: requestId, action: "subscription.request_email", new_values: { ...evidence } });
      if (saveError) throw new Error("Confirmarea emailului nu a putut fi înregistrată.");
    },
  });
}
const evidenceSchema = z.object({ status: z.enum(["sent", "failed", "suppressed"]), sentAt: z.string().nullable(), to: z.string(), subject: z.string(), text: z.string() });
export async function subscriptionEmailEvidence(ids: string[]) {
  // IDs must come from an authenticated, RLS-scoped request read, never browser input.
  const map = new Map<string, SubscriptionEmailEvidence>();
  if (!ids.length) return map;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data, error } = await db.from("audit_logs").select("entity_id,new_values").eq("entity", "subscription_requests").eq("action", "subscription.request_email").in("entity_id", ids).order("created_at", { ascending: false });
  if (error) return map;
  for (const row of data ?? []) {
    const parsed = evidenceSchema.safeParse(row.new_values);
    if (row.entity_id && parsed.success && !map.has(row.entity_id)) map.set(row.entity_id, parsed.data);
  }
  return map;
}