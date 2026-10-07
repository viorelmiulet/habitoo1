/**
 * Livrarea mesajelor Storia: nepotriviri (doar SuperAdmin), notificarea
 * agentului la fiecare mesaj (în aplicație + email best-effort) și gruparea
 * după `conversation_id`.
 */
type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type StoriaMessageInput = {
  senderName: string | null;
  email: string | null;
  phone: string | null;
  body: string | null;
  messageId: string | null;
  conversationId: string | null;
  sentAt: string | null;
};

async function stableId(parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Mesaj fără anunț recunoscut: NU merge la nicio agenție. Se păstrează în
 * lista „Mesaje Storia nepotrivite”, iar SuperAdminii sunt notificați.
 */
export async function saveUnmatchedStoriaMessage(
  admin: Admin,
  input: {
    webhookEventId: string | null;
    adRef: string | null;
    message: StoriaMessageInput;
    externalMessageId: string | null;
  },
  portal: "storia" | "vdi" = "storia",
): Promise<{ processed: boolean; note: string }> {
  const m = input.message;
  const portalName = portal === "vdi" ? "VDI.ro" : "Storia";
  const row = {
    portal,
    webhook_event_id: input.webhookEventId,
    ad_ref: input.adRef,
    conversation_id: m.conversationId,
    external_message_id: input.externalMessageId,
    sender_name: m.senderName,
    sender_email: m.email,
    sender_phone: m.phone,
    body: m.body ? m.body.slice(0, 4000) : null,
    sent_at: m.sentAt ?? new Date().toISOString(),
  };
  const { data, error } = input.externalMessageId
    ? await admin
        .from("portal_unmatched_messages")
        .upsert(row, { onConflict: "portal,external_message_id", ignoreDuplicates: true })
        .select("id")
        .maybeSingle()
    : await admin.from("portal_unmatched_messages").insert(row).select("id").maybeSingle();
  if (error) throw error;

  if (data?.id) {
    const { data: supers } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "superadmin");
    for (const userId of new Set((supers ?? []).map((r) => r.user_id))) {
      await admin.from("notifications").upsert(
        {
          id: await stableId([`${portal}-unmatched`, data.id, userId]),
          organization_id: null,
          user_id: userId,
          type: "portal_unmatched",
          title: `Mesaj ${portalName} fără anunț recunoscut`,
          body: `Anunț „${input.adRef ?? "-"}”, de la ${m.senderName ?? "contact necunoscut"}. Atribuie-l manual.`,
          link: "/superadmin/portals",
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
    }
  }
  return {
    processed: true,
    note: `mesaj ${portalName} nepotrivit (anunț=${input.adRef ?? "-"}) — păstrat pentru atribuire SuperAdmin`,
  };
}

/** Lead-ul deschis al aceleiași conversații Storia, în aceeași agenție. */
export async function findConversationLead(
  admin: Admin,
  organizationId: string,
  conversationId: string | null,
  excludeMessageRowId: string | null,
): Promise<string | null> {
  if (!conversationId) return null;
  let query = admin
    .from("portal_messages")
    .select("lead_id")
    .eq("portal", "storia")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .not("lead_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(5);
  if (excludeMessageRowId) query = query.neq("id", excludeMessageRowId);
  const { data } = await query;
  for (const row of data ?? []) {
    const { data: lead } = await admin
      .from("leads")
      .select("id, stage")
      .eq("id", row.lead_id as string)
      .is("deleted_at", null)
      .maybeSingle();
    if (lead && lead.stage !== "won" && lead.stage !== "lost") return lead.id;
  }
  return null;
}

/**
 * Notifică agentul la fiecare mesaj (inclusiv cele ulterioare): în aplicație,
 * o singură dată per mesaj, plus email best-effort (eșecul nu blochează).
 */
export async function notifyAgentOfStoriaMessage(
  admin: Admin,
  input: {
    organizationId: string;
    assignedTo: string | null;
    propertyTitle: string;
    leadId: string;
    senderName: string;
    body: string | null;
    messageKey: string;
    inApp: boolean;
  },
): Promise<void> {
  if (!input.assignedTo) return;
  const title = `Mesaj nou din Storia.ro de la ${input.senderName}`;
  const text = `${input.senderName} a scris pentru „${input.propertyTitle}”:\n\n${input.body ?? "(fără text)"}`;
  if (input.inApp) {
    await admin.from("notifications").upsert(
      {
        id: await stableId(["storia-message", input.organizationId, input.messageKey, input.assignedTo]),
        organization_id: input.organizationId,
        user_id: input.assignedTo,
        type: "lead",
        title: title.slice(0, 200),
        body: text.slice(0, 500),
        link: "/app/leads",
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  }
  try {
    const { data: agent } = await admin
      .from("profiles")
      .select("email")
      .eq("id", input.assignedTo)
      .maybeSingle();
    if (!agent?.email) return;
    const { sendEmail } = await import("@/lib/mailgun.server");
    await sendEmail({
      to: [agent.email],
      subject: title.slice(0, 180),
      text: `${text}\n\nDeschide lead-ul în Habitoo CRM: https://crm.habitoo.ro/app/leads`,
      sendKey: `storia-message:${input.messageKey}`,
    });
  } catch (error) {
    console.error("[storia] emailul către agent a eșuat", error);
  }
}
