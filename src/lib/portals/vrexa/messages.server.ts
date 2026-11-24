/** Dependențele reale pentru mesajele Vrexa (service role, doar pe server). */
import { vrexaRequest, type VrexaCredentials } from "./client";
import type { VrexaEnv } from "./config";
import { syncVrexaMessages, VREXA_SOURCE, type VrexaMessagesPage, type VrexaSyncDeps } from "./messages";
import type { VrexaReplyDeps } from "./replies";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
const TTL_DAYS = 180;
const ttl = () => new Date(Date.now() + TTL_DAYS * 86_400_000).toISOString();

async function stableUuid(parts: string[]): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parts))));
  h[6] = (h[6]! & 0x0f) | 0x50; h[8] = (h[8]! & 0x3f) | 0x80;
  const x = Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

type Conn = { organization_id: string; external_account_id: string | null; portal_credentials_encrypted: string | null; settings: Record<string, unknown> | null };

export async function vrexaCredentialsForOrg(db: Admin, organizationId: string): Promise<{ creds: VrexaCredentials; settings: Record<string, unknown> } | null> {
  const { data } = await db.from("portal_connections").select("organization_id, external_account_id, portal_credentials_encrypted, settings, activated")
    .eq("organization_id", organizationId).eq("portal", "vrexa").maybeSingle();
  return data?.activated === true ? credsFrom(data as Conn) : null;
}

async function credsFrom(row: Conn) {
  if (!row.portal_credentials_encrypted || !row.external_account_id) return null;
  const { decryptPortalCredential } = await import("../crypto.server");
  const { vrexaCredentialsFrom } = await import("../adapters/vrexa.server");
  const settings = row.settings ?? {};
  const c = vrexaCredentialsFrom({ organizationId: row.organization_id, clientId: row.external_account_id, clientSecret: decryptPortalCredential(row.portal_credentials_encrypted) ?? "", settings }, process.env);
  return "ok" in c ? null : { creds: c, settings };
}

export function vrexaSyncDeps(db: Admin, creds: VrexaCredentials, initial: Record<string, unknown>): VrexaSyncDeps {
  const org = creds.organizationId;
  const env: VrexaEnv = creds.env;
  const settings = { ...initial };
  return {
    env, organizationId: org, settings, now: () => Date.now(),
    fetchPage: (after) => vrexaRequest<VrexaMessagesPage>(creds, "GET", `/partner/v1/messages?after=${encodeURIComponent(after)}&limit=100`),
    async saveSettings(patch) {
      // Citire proaspătă: alte câmpuri din settings (mediu, publicare) rămân neatinse.
      const { data } = await db.from("portal_connections").select("settings").eq("organization_id", org).eq("portal", "vrexa").maybeSingle();
      const next = { ...((data?.settings as Record<string, unknown> | null) ?? {}), ...patch };
      const { error } = await db.from("portal_connections").update({ settings: next }).eq("organization_id", org).eq("portal", "vrexa");
      if (error) throw new Error("Starea mesajelor Vrexa nu a putut fi salvată.");
      Object.assign(settings, patch);
    },
    async findOffer(externalId) {
      const { data } = await db.from("portal_listings").select("property_id, portal_offers").eq("organization_id", org).eq("portal", "vrexa")
        .contains("portal_offers", [{ reference: externalId }]).limit(2);
      const rows = ((data ?? []) as { property_id: string; portal_offers: unknown }[])
        .filter((r) => Array.isArray(r.portal_offers) && (r.portal_offers as Record<string, unknown>[]).some((o) => o["reference"] === externalId && (o["env"] ?? "test") === env));
      if (rows.length !== 1) return null;
      const { data: p } = await db.from("properties").select("id, title, assigned_to").eq("id", rows[0]!.property_id).eq("organization_id", org).maybeSingle();
      return p ? { propertyId: p.id as string, assignedTo: (p.assigned_to as string | null) ?? null, title: (p.title as string | null) ?? null } : null;
    },
    async insertMessage(r) {
      const { data, error } = await db.from("portal_messages").insert({
        organization_id: org, portal: "vrexa", property_id: r.propertyId, lead_id: r.leadId, external_message_id: r.key, conversation_id: r.conversation,
        direction: r.direction, ...(r.direction === "out" ? { delivery_status: "sent" } : {}),
        sender_name: r.name, sender_email: r.email, sender_phone: r.phone, body: r.body, sent_at: r.sentAt, expires_at: ttl(),
      }).select("id").maybeSingle();
      if (error) { if (error.code === "23505") return null; throw new Error("Mesajul Vrexa nu a putut fi salvat."); }
      return (data?.id as string | undefined) ?? null;
    },
    async findPendingReply(conversation, text) {
      const { data } = await db.from("portal_messages").select("id").eq("organization_id", org).eq("portal", "vrexa").eq("conversation_id", conversation)
        .eq("direction", "out").is("external_message_id", null).in("delivery_status", ["sending", "failed"]).eq("body", text)
        .order("sent_at", { ascending: true }).limit(1);
      return ((data ?? [])[0]?.id as string | undefined) ?? null;
    },
    async confirmReply(rowId, key, _sentAt) {
      const { error } = await db.from("portal_messages").update({ external_message_id: key, delivery_status: "sent", delivery_error: null, updated_at: new Date().toISOString() }).eq("id", rowId);
      if (error && error.code !== "23505") throw new Error("Confirmarea mesajului Vrexa nu a putut fi salvată.");
    },
    async loadLink(conversationId) {
      const { data } = await db.from("portal_lead_links").select("lead_id").eq("portal", "vrexa").eq("organization_id", org)
        .eq("external_lead_id", conversationId).eq("environment", env).maybeSingle();
      return (data?.lead_id as string | null | undefined) ?? null;
    },
    async createLead(i) {
      const { ingestPortalLead } = await import("../lead-ingest.server");
      const r = await ingestPortalLead(db, {
        portal: "vrexa", source: VREXA_SOURCE,
        match: { organizationId: org, propertyId: i.match.propertyId, assignedTo: i.match.assignedTo, propertyTitle: i.match.title },
        name: i.name, email: i.email, phone: i.phone, senderName: i.name, bodyText: i.body, noteLine: i.body,
        sentAt: i.sentAt, now: new Date().toISOString(), messageRowId: i.messageRowId, expiresAt: ttl(),
        createdEventNote: `Mesaj nou din ${VREXA_SOURCE}`, notificationTitle: `Mesaj nou din ${VREXA_SOURCE}`,
        notificationBody: i.match.title ? `Pentru „${i.match.title}”` : "Mesaj Vrexa",
        auditAction: "vrexa_lead_import", auditValues: { portal: "vrexa", env, conversation_id: i.conversationId, property_id: i.match.propertyId },
      });
      return r.leadId;
    },
    async saveLink(conversationId, leadId) {
      const { error } = await db.from("portal_lead_links").upsert({
        organization_id: org, portal: "vrexa", external_lead_id: conversationId, lead_id: leadId, environment: env, updated_at: new Date().toISOString(),
      }, { onConflict: "portal,organization_id,external_lead_id,environment" });
      if (error) throw new Error("Legătura conversației Vrexa nu a putut fi salvată.");
    },
    async appendNote(leadId, note) {
      const { data } = await db.from("leads").select("notes").eq("id", leadId).maybeSingle();
      await db.from("leads").update({ notes: [data?.notes, note].filter(Boolean).join("\n---\n").slice(0, 8000), last_interaction_at: new Date().toISOString() }).eq("id", leadId);
    },
    async notify(n) {
      await db.from("notifications").upsert({
        id: await stableUuid(["habitoo-vrexa-message", org, n.key, n.userId]), organization_id: org, user_id: n.userId,
        type: "lead", title: n.title, body: n.body, link: `/app/leads?lead=${n.leadId}`,
      }, { onConflict: "id", ignoreDuplicates: true });
    },
    async unmatched(m, key) {
      // Fără agenție/anunț ghicit: doar SuperAdmin îl vede și îl atribuie.
      const { error } = await db.from("portal_unmatched_messages").insert({
        portal: "vrexa", ad_ref: String(m.externalId ?? "") || null, conversation_id: `${env}:${m.conversationId}`, external_message_id: `${org}:${key}`,
        sender_name: m.direction === "received" ? (m.lead?.name ?? null) : (m.agent?.name ?? null), sender_email: m.direction === "received" ? (m.lead?.email ?? null) : null,
        sender_phone: m.direction === "received" ? (m.lead?.phone ?? null) : null, body: m.text ?? null,
        sent_at: m.sentAt && !Number.isNaN(Date.parse(m.sentAt)) ? new Date(m.sentAt).toISOString() : new Date().toISOString(),
      });
      if (error && error.code !== "23505") throw new Error("Mesajul Vrexa nepotrivit nu a putut fi salvat.");
    },
  };
}

export function vrexaReplyDeps(db: Admin, creds: VrexaCredentials): VrexaReplyDeps {
  return {
    async insert(row) { const { error } = await db.from("portal_messages").insert(row); if (error) throw new Error("Mesajul nu a putut fi salvat."); },
    async load(id) { const { data } = await db.from("portal_messages").select("id, organization_id, portal, direction, conversation_id, body, delivery_status, attempts, updated_at, external_message_id").eq("id", id).maybeSingle(); return data ?? null; },
    async update(id, patch) { await db.from("portal_messages").update(patch).eq("id", id); },
    send: (conversationId, text) => vrexaRequest(creds, "POST", `/partner/v1/conversations/${encodeURIComponent(conversationId)}/replies`, { text }),
  };
}

/** Rularea programată: toate agențiile cu Vrexa activat, fiecare de la cursorul propriu. */
export async function runVrexaMessagesCron(): Promise<{ agencies: number; saved: number; disabled: number; errors: number }> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db.from("portal_connections").select("organization_id, external_account_id, portal_credentials_encrypted, settings")
    .eq("portal", "vrexa").eq("activated", true);
  const out = { agencies: 0, saved: 0, disabled: 0, errors: 0 };
  for (const row of (data ?? []) as Conn[]) {
    const c = await credsFrom(row).catch(() => null);
    if (!c) continue;
    out.agencies++;
    try {
      const r = await syncVrexaMessages(vrexaSyncDeps(db, c.creds, c.settings));
      out.saved += r.saved; if (r.disabled) out.disabled++; if (r.error) out.errors++;
    } catch { out.errors++; }
  }
  return out;
}


