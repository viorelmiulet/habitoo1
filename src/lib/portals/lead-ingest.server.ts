/**
 * Pasul comun prin care un mesaj venit de pe un portal devine lead în CRM
 * (Storia.ro, Properstar): atașare la lead-ul deschis al aceleiași persoane
 * pentru aceeași proprietate sau lead nou, `lead_events`, rândul din
 * `portal_messages`, notificarea agentului și auditul.
 */
type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type PortalLeadMatch = {
  organizationId: string;
  /** null = lead fără proprietate (anunț negăsit). */
  propertyId: string | null;
  assignedTo: string | null;
  propertyTitle: string | null;
};

export type IngestPortalLeadInput = {
  portal: string;
  source: string;
  match: PortalLeadMatch;
  name: string;
  email: string | null;
  phone: string | null;
  senderName: string | null;
  bodyText: string | null;
  noteLine: string;
  sentAt: string;
  now: string;
  /** Rând `portal_messages` deja inserat (cu id extern), altfel se inserează aici. */
  messageRowId: string | null;
  expiresAt: string;
  createdEventNote: string;
  notificationTitle: string;
  notificationBody: string;
  auditAction: string;
  auditValues: Record<string, unknown>;
};

export async function ingestPortalLead(
  admin: Admin,
  input: IngestPortalLeadInput,
): Promise<{ leadId: string; created: boolean }> {
  const { match } = input;

  const attachMessageToLead = async (leadId: string) => {
    if (input.messageRowId) {
      await admin.from("portal_messages").update({ lead_id: leadId }).eq("id", input.messageRowId);
      return;
    }
    await admin.from("portal_messages").insert({
      organization_id: match.organizationId,
      portal: input.portal,
      property_id: match.propertyId,
      lead_id: leadId,
      sender_name: input.senderName,
      sender_email: input.email,
      sender_phone: input.phone,
      body: input.bodyText,
      sent_at: input.sentAt,
      expires_at: input.expiresAt,
    });
  };

  // Același expeditor (email, apoi telefon, apoi nume), aceeași proprietate, lead deschis.
  const base = admin
    .from("leads")
    .select("id, notes")
    .eq("organization_id", match.organizationId)
    .eq("source", input.source)
    .not("stage", "in", "(won,lost)")
    .limit(1);
  const query = match.propertyId ? base.eq("property_id", match.propertyId) : base.is("property_id", null);
  const existing = await (
    input.email
      ? query.eq("email", input.email)
      : input.phone
        ? query.eq("phone", input.phone)
        : query.eq("name", input.name)
  ).maybeSingle();

  if (existing.data) {
    const leadId = existing.data.id;
    await admin
      .from("leads")
      .update({
        last_interaction_at: input.now,
        notes: [existing.data.notes, input.noteLine].filter(Boolean).join("\n---\n").slice(0, 8000),
      })
      .eq("id", leadId);
    await admin.from("lead_events").insert({
      organization_id: match.organizationId,
      lead_id: leadId,
      to_stage: "new",
      note: input.noteLine.slice(0, 2000),
    });
    await attachMessageToLead(leadId);
    return { leadId, created: false };
  }

  const { data: lead, error } = await admin
    .from("leads")
    .insert({
      organization_id: match.organizationId,
      property_id: match.propertyId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      source: input.source,
      stage: "new",
      notes: input.noteLine,
      assigned_to: match.assignedTo,
      last_interaction_at: input.sentAt,
    })
    .select("id")
    .single();
  if (error) throw error;

  await admin.from("lead_events").insert({
    organization_id: match.organizationId,
    lead_id: lead.id,
    to_stage: "new",
    note: input.createdEventNote,
  });

  await attachMessageToLead(lead.id);

  if (match.assignedTo) {
    await admin.from("notifications").insert({
      organization_id: match.organizationId,
      user_id: match.assignedTo,
      type: "lead",
      title: input.notificationTitle,
      body: input.notificationBody,
      link: `/app/leads`,
    });
  }

  await admin.from("audit_logs").insert({
    organization_id: match.organizationId,
    action: input.auditAction,
    entity: "leads",
    entity_id: lead.id,
    new_values: input.auditValues as never,
  });

  return { leadId: lead.id, created: true };
}
