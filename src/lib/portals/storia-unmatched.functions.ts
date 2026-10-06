/**
 * „Mesaje Storia nepotrivite”: listare și atribuire manuală, doar SuperAdmin.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null }> } };

async function requireSuperadmin(context: Ctx) {
  const { data } = await context.supabase.rpc("is_superadmin");
  if (data !== true) throw new Error("Doar SuperAdmin poate gestiona mesajele nepotrivite.");
}

export type UnmatchedStoriaMessage = {
  id: string;
  adRef: string | null;
  senderName: string | null;
  senderEmail: string | null;
  senderPhone: string | null;
  body: string | null;
  sentAt: string;
};

export const listUnmatchedStoriaMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UnmatchedStoriaMessage[]> => {
    await requireSuperadmin(context as unknown as Ctx);
    const { data, error } = await context.supabase
      .from("portal_unmatched_messages")
      .select("id, ad_ref, sender_name, sender_email, sender_phone, body, sent_at")
      .eq("status", "pending")
      .order("sent_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Lista mesajelor nepotrivite nu a putut fi încărcată.");
    return (data ?? []).map((r) => ({
      id: r.id,
      adRef: r.ad_ref,
      senderName: r.sender_name,
      senderEmail: r.sender_email,
      senderPhone: r.sender_phone,
      body: r.body,
      sentAt: r.sent_at,
    }));
  });

export const assignUnmatchedStoriaMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        organizationId: z.string().uuid(),
        propertyId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ leadId: string }> => {
    await requireSuperadmin(context as unknown as Ctx);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await admin
      .from("portal_unmatched_messages")
      .select("*")
      .eq("id", data.id)
      .eq("status", "pending")
      .maybeSingle();
    if (!row) throw new Error("Mesajul nu mai este în așteptare.");

    let property: { id: string; title: string; assigned_to: string | null } | null = null;
    if (data.propertyId) {
      const { data: p } = await admin
        .from("properties")
        .select("id, title, assigned_to")
        .eq("id", data.propertyId)
        .eq("organization_id", data.organizationId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!p) throw new Error("Oferta nu aparține agenției alese.");
      property = p;
    }

    const name = row.sender_name ?? "Contact Storia";
    const sentAt = row.sent_at;
    const noteLine = [`Mesaj Storia.ro (${sentAt})`, row.body].filter(Boolean).join(":\n");
    const { ingestPortalLead } = await import("@/lib/portals/lead-ingest.server");
    const { portalMessageExpiry } = await import("@/lib/portals/storia/leads.server");
    const match = {
      organizationId: data.organizationId,
      propertyId: property?.id ?? null,
      assignedTo: property?.assigned_to ?? null,
      propertyTitle: property?.title ?? null,
    };
    const outcome = await ingestPortalLead(admin, {
      portal: "storia",
      source: "Storia.ro",
      match,
      name,
      email: row.sender_email,
      phone: row.sender_phone,
      senderName: row.sender_name,
      bodyText: row.body,
      noteLine,
      sentAt,
      now: new Date().toISOString(),
      messageRowId: null,
      expiresAt: portalMessageExpiry(sentAt),
      createdEventNote: `Lead creat din mesaj Storia.ro atribuit manual. ${row.body ?? ""}`.trim().slice(0, 2000),
      notificationTitle: "Lead nou din Storia.ro",
      notificationBody: `${name} a trimis un mesaj${property ? ` pentru „${property.title}”` : ""}.`,
      auditAction: "storia.unmatched_message_assigned",
      auditValues: { unmatched_id: row.id, property_id: property?.id ?? null, assigned_by: context.userId },
    });

    if (property) {
      const { notifyAgentOfStoriaMessage } = await import("@/lib/portals/storia/messages.server");
      await notifyAgentOfStoriaMessage(admin, {
        organizationId: data.organizationId,
        assignedTo: property.assigned_to,
        propertyTitle: property.title,
        leadId: outcome.leadId,
        senderName: name,
        body: row.body,
        messageKey: `unmatched:${row.id}`,
        inApp: !outcome.created,
      });
    }

    await admin
      .from("portal_unmatched_messages")
      .update({
        status: "assigned",
        assigned_organization_id: data.organizationId,
        assigned_property_id: property?.id ?? null,
        assigned_lead_id: outcome.leadId,
        assigned_by: context.userId,
        assigned_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return { leadId: outcome.leadId };
  });
