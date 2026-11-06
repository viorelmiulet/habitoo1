/**
 * Cererile clienților Housera (H7): evenimentele `lead.created`, `lead.updated`
 * și `lead.message_received` devin lead-uri în CRM, cu mesajele lor.
 * Doar citiri la Housera (`GET leads/{id}`, `GET leads/{id}/messages`).
 * Jurnalul nu conține niciodată date de contact.
 */
import { houseraOfferFilter, type HouseraEvent } from "./events";
import type { HouseraClientLike } from "./publish";
import { HouseraError } from "./client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export const HOUSERA_LEAD_TYPES = new Set(["lead.created", "lead.updated", "lead.message_received"]);
export const HOUSERA_NO_LEADS_READ = "fără drept leads:read";
export const HOUSERA_LEADS_READ_NOTICE = "Reconectează Housera ca să primești cererile clienților.";
export const HOUSERA_MESSAGE_TTL_DAYS = 180;
const SOURCE = "Housera.ro";

export type HouseraLeadDeps = { client?: HouseraClientLike; now?: () => Date };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const unwrap = (v: unknown) => { const o = obj(v); return o["data"] && typeof o["data"] === "object" && !Array.isArray(o["data"]) ? obj(o["data"]) : o; };

export type HouseraLead = {
  id: string; source: string | null; name: string | null; phone: string | null; email: string | null;
  message: string | null; price: number | null; listingCode: string | null; externalRef: string | null; agentEmail: string | null;
  status?: string | null;
};

export function parseHouseraLead(raw: unknown, fallbackId: string): HouseraLead {
  const d = unwrap(raw);
  const c = obj(d["contact"]);
  const l = obj(d["listing"]);
  const priceRaw = d["price"];
  const price = typeof priceRaw === "number" ? priceRaw : Number(obj(priceRaw)["amount"] ?? priceRaw);
  return {
    id: str(d["id"]) ?? (typeof d["id"] === "number" ? String(d["id"]) : fallbackId),
    source: str(d["source"]), name: str(c["name"]), phone: str(c["phone"]), email: str(c["email"])?.toLowerCase() ?? null,
    message: str(d["message"]), price: Number.isFinite(price) && price > 0 ? price : null,
    status: str(d["status"]), listingCode: str(l["code"]), externalRef: str(l["external_ref"]), agentEmail: str(obj(d["agent"])["email"])?.toLowerCase() ?? null,
  };
}

/** Nota pe lead: textul clientului + cererea de apel/vizionare. */
export function houseraLeadNote(lead: Pick<HouseraLead, "source" | "message">, when: string): string {
  const extra = lead.source === "phone" ? "Clientul a cerut să fie sunat." : lead.source === "viewing_request" ? "Clientul a cerut o vizionare." : null;
  return [`[${SOURCE} · ${when.slice(0, 16).replace("T", " ")}]`, lead.message, extra].filter(Boolean).join("\n");
}

async function stableId(parts: string[]): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parts))));
  h[6] = (h[6]! & 0x0f) | 0x50; h[8] = (h[8]! & 0x3f) | 0x80;
  const x = Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

async function log(admin: Admin, orgId: string, operation: "lead_import" | "lead_message", success: boolean, externalId: string, note: string, httpStatus: number | null = null) {
  await admin.from("portal_operation_logs").insert({
    organization_id: orgId, portal: "housera", operation, success, external_id: externalId, http_status: httpStatus,
    error_message: success ? null : note, portal_response: success ? { note } : null,
    environment: process.env["HOUSERA_ENV"] === "production" ? "production" : "staging",
  }).then(() => undefined, () => undefined);
}

async function defaultClient(orgId: string): Promise<HouseraClientLike | null> {
  const { loadHouseraKey, markHouseraReconnect } = await import("./store.server");
  const key = await loadHouseraKey(orgId);
  if (!key) return null;
  const { createHouseraClient } = await import("./client.server");
  const { houseraBaseUrl } = await import("./config");
  return createHouseraClient({ key, baseUrl: houseraBaseUrl(process.env), onUnauthorized: () => markHouseraReconnect(orgId) });
}

const UUID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(sale|rent)$/i;

async function matchProperty(admin: Admin, orgId: string, lead: HouseraLead) {
  const byOffer = async (field: "id" | "reference", value: string) => {
    const { data } = await admin.from("portal_listings").select("property_id").eq("portal", "housera").eq("organization_id", orgId).contains("portal_offers", houseraOfferFilter(field, value)).limit(1).maybeSingle();
    return (data?.property_id as string | undefined) ?? null;
  };
  let propertyId = (lead.listingCode ? await byOffer("id", lead.listingCode) : null) ?? (lead.externalRef ? await byOffer("reference", lead.externalRef) : null);
  if (!propertyId && lead.externalRef) propertyId = lead.externalRef.match(UUID)?.[1]?.toLowerCase() ?? null;
  if (!propertyId) return { propertyId: null, assignedTo: null, title: null };
  const { data } = await admin.from("properties").select("id, title, assigned_to").eq("id", propertyId).eq("organization_id", orgId).maybeSingle();
  if (!data) return { propertyId: null, assignedTo: null, title: null };
  return { propertyId: data.id as string, assignedTo: (data.assigned_to as string | null) ?? null, title: (data.title as string | null) ?? null };
}

async function agentByEmail(admin: Admin, orgId: string, email: string | null): Promise<string | null> {
  if (!email) return null;
  const { data } = await admin.from("profiles").select("id").eq("organization_id", orgId).eq("is_active", true).ilike("email", email).limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function loadLink(admin: Admin, orgId: string, externalId: string) {
  const { data } = await admin.from("portal_lead_links").select("id, lead_id, last_message_id")
    .eq("portal", "housera").eq("organization_id", orgId).eq("external_lead_id", externalId).maybeSingle();
  return data as { id: string; lead_id: string | null; last_message_id: string | null } | null;
}

/** Inserează mesajul doar dacă `external_message_id` e nou; `null` = deja salvat. */
async function insertMessage(admin: Admin, row: Record<string, unknown>): Promise<string | null> {
  const { data: seen } = await admin.from("portal_messages").select("id").eq("portal", "housera").eq("organization_id", row["organization_id"]).eq("external_message_id", row["external_message_id"]).maybeSingle();
  if (seen) return null;
  const { data, error } = await admin.from("portal_messages").insert(row).select("id").maybeSingle();
  if (error) { if (error.code === "23505") return null; throw new Error("Mesajul Housera nu a putut fi salvat."); }
  return (data?.id as string | undefined) ?? null;
}

/** Mesajul nostru întors de Housera: îl legăm de rândul existent, fără dublură. */
async function claimOwnReply(admin: Admin, orgId: string, externalLeadId: string, houseraId: string, body: string | null): Promise<boolean> {
  const ext = `housera:msg:${houseraId}`;
  const { data: rows } = await admin.from("portal_messages").select("id, external_message_id, body")
    .eq("portal", "housera").eq("organization_id", orgId).eq("conversation_id", `housera:${externalLeadId}`).eq("direction", "out");
  const list = (rows ?? []) as Array<{ id: string; external_message_id: string | null; body: string | null }>;
  if (list.some((r) => r.external_message_id === ext)) return true;
  const mine = list.find((r) => !r.external_message_id && (r.body ?? "").trim() === (body ?? "").trim());
  if (!mine) return false;
  await admin.from("portal_messages").update({ external_message_id: ext }).eq("id", mine.id);
  return true;
}

async function appendNote(admin: Admin, orgId: string, leadId: string, note: string, nowIso: string) {
  const { data } = await admin.from("leads").select("notes").eq("id", leadId).maybeSingle();
  await admin.from("leads").update({ last_interaction_at: nowIso, notes: [data?.notes, note].filter(Boolean).join("\n---\n").slice(0, 8000) }).eq("id", leadId);
  await admin.from("lead_events").insert({ organization_id: orgId, lead_id: leadId, to_stage: "new", note: note.slice(0, 2000) });
}

async function notifyMissingAbility(admin: Admin, orgId: string, now: Date) {
  const { data } = await admin.from("user_roles").select("user_id").eq("organization_id", orgId).eq("role", "agency_admin");
  const day = now.toISOString().slice(0, 10);
  for (const r of (data ?? []) as Array<{ user_id: string }>) {
    await admin.from("notifications").upsert({
      id: await stableId(["housera-leads-read", orgId, day, r.user_id]), organization_id: orgId, user_id: r.user_id,
      type: "portal_failure", title: "Housera: cererile clienților nu pot fi citite", body: HOUSERA_LEADS_READ_NOTICE, link: "/app/settings?tab=portals",
    }, { onConflict: "id", ignoreDuplicates: true });
  }
}

type Ctx = { admin: Admin; orgId: string; client: HouseraClientLike; now: Date };

/** Citește cererea și creează lead-ul + legătura (sau adaugă nota pe lead-ul legat). */
async function importLead(ctx: Ctx, e: HouseraEvent, externalId: string, link: Awaited<ReturnType<typeof loadLink>>) {
  const { admin, orgId, now } = ctx;
  const nowIso = now.toISOString();
  const when = e.created_at ?? nowIso;
  const res = await ctx.client.requestMeta<unknown>(`leads/${encodeURIComponent(externalId)}`);
  const lead = parseHouseraLead(res.data, externalId);
  const note = houseraLeadNote(lead, when);
  const prop = await matchProperty(admin, orgId, lead);
  const msg = {
    organization_id: orgId, portal: "housera", property_id: prop.propertyId,
    external_message_id: `housera:lead:${externalId}:${when}`, conversation_id: `housera:${externalId}`,
    sender_name: lead.name, sender_email: lead.email, sender_phone: lead.phone, body: lead.message,
    sent_at: when, expires_at: new Date(now.getTime() + HOUSERA_MESSAGE_TTL_DAYS * 86_400_000).toISOString(),
  };

  if (link?.lead_id) {
    if (e.type === "lead.updated") {
      const { noteHouseraRemoteStatus } = await import("./lead-status.server");
      await noteHouseraRemoteStatus(admin, orgId, externalId, lead.status);
    }
    const rowId = await insertMessage(admin, { ...msg, lead_id: link.lead_id });
    if (rowId) await appendNote(admin, orgId, link.lead_id, note, nowIso);
    await log(admin, orgId, "lead_import", true, externalId, rowId ? "notă adăugată" : "deja importat");
    return link.lead_id;
  }

  const rowId = await insertMessage(admin, msg);
  const assignedTo = (await agentByEmail(admin, orgId, lead.agentEmail)) ?? prop.assignedTo;
  const { ingestPortalLead } = await import("../lead-ingest.server");
  const name = lead.name ?? lead.email ?? lead.phone ?? "Client Housera";
  const r = await ingestPortalLead(admin, {
    portal: "housera", source: SOURCE,
    match: { organizationId: orgId, propertyId: prop.propertyId, assignedTo, propertyTitle: prop.title },
    name, email: lead.email, phone: lead.phone, senderName: lead.name, bodyText: lead.message, noteLine: note,
    sentAt: when, now: nowIso, messageRowId: rowId, expiresAt: msg.expires_at,
    createdEventNote: `Cerere nouă din ${SOURCE}`,
    notificationTitle: `Cerere nouă din ${SOURCE}`,
    notificationBody: prop.title ? `Pentru „${prop.title}”` : "Cerere fără anunț asociat",
    auditAction: "housera_lead_import", auditValues: { portal: "housera", external_lead_id: externalId, property_id: prop.propertyId },
  });
  if (r.created && lead.price) await admin.from("leads").update({ value: lead.price }).eq("id", r.leadId);
  const { error } = await admin.from("portal_lead_links").upsert({
    organization_id: orgId, portal: "housera", external_lead_id: externalId, lead_id: r.leadId, updated_at: nowIso,
    ...(lead.status ? { status_remote: lead.status } : {}),
  }, { onConflict: "portal,organization_id,external_lead_id" });
  if (error) throw new Error("Legătura cererii Housera nu a putut fi salvată.");
  await log(admin, orgId, "lead_import", true, externalId, r.created ? "lead creat" : "atașat la lead existent");
  return r.leadId;
}

async function importMessages(ctx: Ctx, externalId: string, leadId: string) {
  const { admin, orgId, now } = ctx;
  const link = await loadLink(admin, orgId, externalId);
  let after = link?.last_message_id ?? null;
  const { data: leadRow } = await admin.from("leads").select("name, assigned_to, property_id").eq("id", leadId).maybeSingle();
  let propertyTitle = "cererea Housera";
  if (leadRow?.property_id) {
    const { data: p } = await admin.from("properties").select("title").eq("id", leadRow.property_id).maybeSingle();
    if (p?.title) propertyTitle = p.title as string;
  }
  let saved = 0;
  let lastIn: { id: string; body: string | null } | null = null;
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const query: Record<string, string | number> = {};
    if (cursor) query["cursor"] = cursor;
    else if (after) query["after"] = after;
    const r = await ctx.client.requestMeta<unknown>(`leads/${encodeURIComponent(externalId)}/messages`, { query });
    const o = obj(r.data);
    const list = (Array.isArray(r.data) ? r.data : Array.isArray(o["data"]) ? o["data"] : []) as unknown[];
    if (!list.length) break;
    for (const raw of list) {
      const m = obj(raw);
      const id = str(m["id"]) ?? (typeof m["id"] === "number" ? String(m["id"]) : null);
      if (!id) continue;
      after = id;
      const body = str(m["body"]) ?? str(m["text"]) ?? str(m["message"]);
      const sentAt = str(m["created_at"]) ?? now.toISOString();
      const incoming = m["direction"] === "in";
      if (!incoming && (await claimOwnReply(admin, orgId, externalId, id, body))) continue;
      const rowId = await insertMessage(admin, {
        direction: incoming ? "in" : "out",
        organization_id: orgId, portal: "housera", property_id: leadRow?.property_id ?? null, lead_id: leadId,
        external_message_id: `housera:msg:${id}`, conversation_id: `housera:${externalId}`,
        sender_name: incoming ? leadRow?.name ?? null : null, body, sent_at: sentAt,
        expires_at: new Date(now.getTime() + HOUSERA_MESSAGE_TTL_DAYS * 86_400_000).toISOString(),
      });
      if (!rowId) continue;
      saved++;
      if (incoming) {
        await appendNote(admin, orgId, leadId, [`[${SOURCE} · mesaj · ${sentAt.slice(0, 16).replace("T", " ")}]`, body].filter(Boolean).join("\n"), now.toISOString());
        lastIn = { id, body };
      }
    }
    const meta = obj(o["meta"]);
    cursor = str(meta["next_cursor"]);
    if (!cursor && !meta["next"] && !o["has_more"]) break;
  }
  await admin.from("portal_lead_links").update({ last_message_id: after, updated_at: now.toISOString() })
    .eq("portal", "housera").eq("organization_id", orgId).eq("external_lead_id", externalId);
  if (lastIn) {
    const { notifyAgentOfStoriaMessage } = await import("../storia/messages.server");
    await notifyAgentOfStoriaMessage(admin, {
      organizationId: orgId, assignedTo: (leadRow?.assigned_to as string | null) ?? null, propertyTitle, leadId,
      senderName: (leadRow?.name as string | null) ?? "Client Housera", body: lastIn.body, messageKey: lastIn.id, inApp: true,
      portalLabel: SOURCE, keyPrefix: "housera-message",
    });
  }
  await log(admin, orgId, "lead_message", true, externalId, `mesaje noi: ${saved}`);
  return saved;
}

/** Procesează un eveniment `lead.*` suportat; întoarce nota pentru jurnalul evenimentelor. */
export async function processHouseraLeadEvent(admin: Admin, orgId: string, e: HouseraEvent, deps: HouseraLeadDeps = {}): Promise<string> {
  const externalId = str(e.data["lead_id"]) ?? (typeof e.data["lead_id"] === "number" ? String(e.data["lead_id"]) : null);
  if (!externalId) return "lead_id lipsă";
  const now = deps.now?.() ?? new Date();
  const client = deps.client ?? (await defaultClient(orgId));
  if (!client) return "agenția nu are cheie Housera";
  const ctx: Ctx = { admin, orgId, client, now };
  try {
    const link = await loadLink(admin, orgId, externalId);
    if (e.type === "lead.message_received") {
      const leadId = link?.lead_id ?? (await importLead(ctx, e, externalId, null));
      const n = await importMessages(ctx, externalId, leadId);
      return `${e.type} aplicat (${n} mesaje)`;
    }
    await importLead(ctx, e, externalId, link);
    return `${e.type} aplicat`;
  } catch (err) {
    if (err instanceof HouseraError && err.status === 403 && err.code === "missing_ability") {
      await notifyMissingAbility(admin, orgId, now);
      await log(admin, orgId, e.type === "lead.message_received" ? "lead_message" : "lead_import", false, externalId, HOUSERA_NO_LEADS_READ, 403);
      return HOUSERA_NO_LEADS_READ;
    }
    const msg = err instanceof Error ? err.message : "eroare";
    await log(admin, orgId, e.type === "lead.message_received" ? "lead_message" : "lead_import", false, externalId, msg.slice(0, 300), err instanceof HouseraError ? err.status : null);
    throw err;
  }
}
