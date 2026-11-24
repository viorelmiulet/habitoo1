/**
 * Mesajele HomeZZ (notificarea 503) → lead în CRM: întâi `get-messages`
 * pentru toată conversația, altfel doar textul din notificare. Legătura în
 * `portal_lead_links` (ID extern = `conversation_id`), mesajele în
 * `portal_messages` deduplicate pe cheia mesajului. Dependențe injectabile.
 */
import type { HomezzResult } from "./client";
import { homezzMessageKey, parseHomezzConversation, type HomezzConversationMessage } from "./messages";

export const HOMEZZ_SOURCE = "HomeZZ.ro";
export const HOMEZZ_MESSAGE_TTL_DAYS = 180;

export type HomezzOfferMatch = { propertyId: string; assignedTo: string | null; title: string | null };
export type HomezzMessageRow = {
  organizationId: string; propertyId: string; leadId: string | null; key: string; conversationId: string;
  direction: "in" | "out"; senderName: string | null; senderEmail: string | null; senderPhone: string | null; body: string; sentAt: string;
};
export type HomezzLeadDeps = {
  findOffer: (organizationId: string, internalId: string) => Promise<HomezzOfferMatch | null>;
  getMessages: (organizationId: string, internalId: string) => Promise<HomezzResult>;
  /** Primul răspuns brut al conversației (redactat, ≤20 KB) în jurnal. */
  logRaw: (organizationId: string, conversationId: string, raw: string, ok: boolean) => Promise<void>;
  loadLink: (organizationId: string, conversationId: string) => Promise<string | null>;
  /** `null` = mesaj deja salvat (aceeași cheie). */
  insertMessage: (row: HomezzMessageRow) => Promise<string | null>;
  createLead: (input: { organizationId: string; match: HomezzOfferMatch; conversationId: string; name: string; email: string | null; phone: string | null; body: string; sentAt: string; messageRowId: string }) => Promise<string>;
  attachMessages: (rowIds: string[], leadId: string) => Promise<void>;
  saveLink: (organizationId: string, conversationId: string, leadId: string) => Promise<void>;
  appendNote: (leadId: string, note: string) => Promise<void>;
  notify: (input: { organizationId: string; userId: string; leadId: string; title: string; body: string; key: string }) => Promise<void>;
  now: () => Date;
};

export type HomezzMessageEvent = { organizationId: string; internalId: string | null; conversationId: string | null; message: string | null; receivedAt: string };

const noteLine = (sentAt: string, body: string) => `[${HOMEZZ_SOURCE} · mesaj · ${sentAt.slice(0, 16).replace("T", " ")}]\n${body}`;

/** Întoarce nota pentru jurnalul evenimentelor. Aruncă la eroare de DB (se reia). */
export async function importHomezzMessage(deps: HomezzLeadDeps, e: HomezzMessageEvent): Promise<string> {
  if (!e.internalId || !e.conversationId) return "fără internal_id sau conversation_id";
  const match = await deps.findOffer(e.organizationId, e.internalId);
  if (!match) return "anunț necunoscut în agenție";
  const linked = await deps.loadLink(e.organizationId, e.conversationId);

  let contact = { name: null as string | null, phone: null as string | null, email: null as string | null };
  let messages: HomezzConversationMessage[] | null = null;
  const res = await deps.getMessages(e.organizationId, e.internalId).catch(() => null);
  if (res && !linked) await deps.logRaw(e.organizationId, e.conversationId, res.raw, res.ok).catch(() => undefined);
  if (res?.ok) {
    const conv = parseHomezzConversation(res.data, e.conversationId);
    if (conv) { messages = conv.messages; contact = { name: conv.name, phone: conv.phone, email: conv.email }; }
  }
  const fromNotification = !messages;
  if (!messages) {
    if (!e.message) return "mesaj gol";
    messages = [{ id: null, body: e.message, sentAt: e.receivedAt, incoming: true }];
  }

  const name = contact.name ?? `Client ${HOMEZZ_SOURCE} (#${e.conversationId})`;
  const saved: { rowId: string; m: HomezzConversationMessage; sentAt: string; key: string }[] = [];
  for (const m of messages) {
    // Fără dată: ora primirii notificării (stabilă la reluări).
    const sentAt = m.sentAt && !Number.isNaN(Date.parse(m.sentAt)) ? new Date(m.sentAt).toISOString() : e.receivedAt;
    const key = await homezzMessageKey(e.conversationId, { id: m.id, body: m.body, sentAt: m.id ? m.sentAt : e.receivedAt });
    const rowId = await deps.insertMessage({
      organizationId: e.organizationId, propertyId: match.propertyId, leadId: linked, key, conversationId: e.conversationId,
      direction: m.incoming ? "in" : "out", senderName: m.incoming ? contact.name : null,
      senderEmail: m.incoming ? contact.email : null, senderPhone: m.incoming ? contact.phone : null, body: m.body, sentAt,
    });
    if (rowId) saved.push({ rowId, m, sentAt, key });
  }
  if (!saved.length) return "deja importat";

  let leadId = linked;
  const incoming = saved.filter((s) => s.m.incoming);
  if (!leadId) {
    const head = incoming[0] ?? saved[0]!;
    leadId = await deps.createLead({
      organizationId: e.organizationId, match, conversationId: e.conversationId, name, email: contact.email, phone: contact.phone,
      body: incoming.map((s) => noteLine(s.sentAt, s.m.body)).join("\n---\n") || head.m.body, sentAt: head.sentAt, messageRowId: head.rowId,
    });
    await deps.attachMessages(saved.map((s) => s.rowId).filter((id) => id !== head.rowId), leadId);
    await deps.saveLink(e.organizationId, e.conversationId, leadId);
    return `lead creat (${saved.length} mesaje${fromNotification ? ", din notificare" : ""})`;
  }
  for (const s of incoming) {
    await deps.appendNote(leadId, noteLine(s.sentAt, s.m.body));
    if (match.assignedTo) {
      await deps.notify({
        organizationId: e.organizationId, userId: match.assignedTo, leadId, key: s.key,
        title: `Mesaj nou din ${HOMEZZ_SOURCE}${match.title ? ` pentru „${match.title}”` : ""}`, body: s.m.body.slice(0, 200),
      });
    }
  }
  return `mesaje noi: ${saved.length}`;
}

// ---------------------------------------------------------------- dependențe reale

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function stableUuid(parts: string[]): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parts))));
  h[6] = (h[6]! & 0x0f) | 0x50; h[8] = (h[8]! & 0x3f) | 0x80;
  const x = Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export async function homezzLeadDeps(admin?: Admin): Promise<HomezzLeadDeps> {
  const db: Admin = admin ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const { homezzAgentDeps } = await import("./agents.server");
  const agents = await homezzAgentDeps();
  const ttl = () => new Date(Date.now() + HOMEZZ_MESSAGE_TTL_DAYS * 86_400_000).toISOString();
  return {
    now: () => new Date(),
    async findOffer(organizationId, internalId) {
      const { data } = await db.from("portal_listings").select("property_id").eq("organization_id", organizationId).eq("portal", "homezz")
        .contains("portal_offers", [{ internal_id: internalId }]).limit(2);
      const rows = (data ?? []) as { property_id: string }[];
      if (rows.length !== 1) return null;
      const { data: p } = await db.from("properties").select("id, title, assigned_to").eq("id", rows[0]!.property_id).eq("organization_id", organizationId).maybeSingle();
      return p ? { propertyId: p.id as string, assignedTo: (p.assigned_to as string | null) ?? null, title: (p.title as string | null) ?? null } : null;
    },
    async getMessages(organizationId, internalId) {
      return agents.post("get-messages", { key: await agents.agencyKey(organizationId), internal_id: internalId });
    },
    async logRaw(organizationId, conversationId, raw, ok) {
      const { truncateHomezzRaw } = await import("./client");
      await db.from("portal_operation_logs").insert({
        organization_id: organizationId, portal: "homezz", operation: "lead_messages", success: ok, external_id: conversationId,
        error_message: ok ? null : "get-messages a eșuat; lead din notificare", portal_response: { action: "get-messages", body: truncateHomezzRaw(raw) },
      });
    },
    async loadLink(organizationId, conversationId) {
      const { data } = await db.from("portal_lead_links").select("lead_id").eq("portal", "homezz").eq("organization_id", organizationId)
        .eq("external_lead_id", conversationId).eq("environment", "").maybeSingle();
      return (data?.lead_id as string | null | undefined) ?? null;
    },
    async insertMessage(r) {
      const { data, error } = await db.from("portal_messages").insert({
        organization_id: r.organizationId, portal: "homezz", property_id: r.propertyId, lead_id: r.leadId,
        external_message_id: r.key, conversation_id: `homezz:${r.conversationId}`, direction: r.direction,
        ...(r.direction === "out" ? { delivery_status: "sent" } : {}),
        sender_name: r.senderName, sender_email: r.senderEmail, sender_phone: r.senderPhone, body: r.body, sent_at: r.sentAt, expires_at: ttl(),
      }).select("id").maybeSingle();
      if (error) { if (error.code === "23505") return null; throw new Error("Mesajul HomeZZ nu a putut fi salvat."); }
      return (data?.id as string | undefined) ?? null;
    },
    async createLead(i) {
      const { ingestPortalLead } = await import("../lead-ingest.server");
      const nowIso = new Date().toISOString();
      const r = await ingestPortalLead(db, {
        portal: "homezz", source: HOMEZZ_SOURCE,
        match: { organizationId: i.organizationId, propertyId: i.match.propertyId, assignedTo: i.match.assignedTo, propertyTitle: i.match.title },
        name: i.name, email: i.email, phone: i.phone, senderName: i.name, bodyText: i.body, noteLine: i.body,
        sentAt: i.sentAt, now: nowIso, messageRowId: i.messageRowId, expiresAt: ttl(),
        createdEventNote: `Mesaj nou din ${HOMEZZ_SOURCE}`, notificationTitle: `Mesaj nou din ${HOMEZZ_SOURCE}`,
        notificationBody: i.match.title ? `Pentru „${i.match.title}”` : "Mesaj HomeZZ",
        auditAction: "homezz_lead_import", auditValues: { portal: "homezz", conversation_id: i.conversationId, property_id: i.match.propertyId },
      });
      return r.leadId;
    },
    async attachMessages(rowIds, leadId) {
      if (rowIds.length) await db.from("portal_messages").update({ lead_id: leadId }).in("id", rowIds);
    },
    async saveLink(organizationId, conversationId, leadId) {
      const { error } = await db.from("portal_lead_links").upsert({
        organization_id: organizationId, portal: "homezz", external_lead_id: conversationId, lead_id: leadId, environment: "", updated_at: new Date().toISOString(),
      }, { onConflict: "portal,organization_id,external_lead_id,environment" });
      if (error) throw new Error("Legătura conversației HomeZZ nu a putut fi salvată.");
    },
    async appendNote(leadId, note) {
      const { data } = await db.from("leads").select("notes").eq("id", leadId).maybeSingle();
      await db.from("leads").update({ notes: [data?.notes, note].filter(Boolean).join("\n---\n").slice(0, 8000), last_interaction_at: new Date().toISOString() }).eq("id", leadId);
    },
    async notify(n) {
      await db.from("notifications").upsert({
        id: await stableUuid(["habitoo-homezz-message", n.key, n.userId]), organization_id: n.organizationId, user_id: n.userId,
        type: "lead", title: n.title, body: n.body, link: `/app/leads?lead=${n.leadId}`,
      }, { onConflict: "id", ignoreDuplicates: true });
    },
  };
}
