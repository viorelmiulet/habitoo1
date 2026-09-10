/**
 * Procesarea notificărilor Storia.ro / OLX Group (Faza 4, parțial).
 *
 * Două fluxuri sunt procesate:
 *
 *  1. MESAJE DE LA CUMPĂRĂTORI (`incoming_message` / flow „messages”) → lead în CRM,
 *     legat de proprietatea corectă, asignat agentului responsabil, cu notificare.
 *     ATENȚIE: forma exactă a payload-ului de mesaj NU a fost încă observată în
 *     `portal_webhook_events` (până acum au sosit doar notificări de anunț din
 *     testul App Manager). Extragerea câmpurilor este deci defensivă: acceptăm
 *     mai multe denumiri plauzibile (documentate sau uzuale la OLX), iar dacă nu
 *     găsim nici mesaj, nici expeditor, marcăm evenimentul `processed = false` cu
 *     o notă explicită, ca să putem confirma la primul mesaj real.
 *
 *  2. CICLUL DE VIAȚĂ AL ANUNȚULUI (`advert_*`) → actualizează
 *     `portal_listings.status` / `last_error` prin `storiaListingStatus`,
 *     confirmat pe payload-uri reale din jurnal (`flow: publish_advert`,
 *     `event_type: advert_posted_success`, `data.code: active`).
 *
 * Idempotență: fiecare eveniment are `transaction_id`; dacă un eveniment cu
 * același `transaction_id` a fost deja procesat, nu se mai creează nimic.
 */
import { STORIA_STATUS_MESSAGE, parseAdvertRefs, storiaListingStatus } from "./adverts.server";

type Json = Record<string, unknown>;

export type StoriaProcessResult = { processed: boolean; note: string };

const asRecord = (value: unknown): Json | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;

const str = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
};

/** Prima valoare de tip text găsită pe una din căile date (`a.b.c`). */
function pick(root: Json, paths: string[]): string | null {
  for (const path of paths) {
    let cursor: unknown = root;
    for (const segment of path.split(".")) {
      const record = asRecord(cursor);
      if (!record) {
        cursor = undefined;
        break;
      }
      cursor = record[segment];
    }
    const value = str(cursor);
    if (value) return value;
  }
  return null;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** `HBT-<propertyId>-SALE|RENT` — identificatorul trimis de noi la publicare. */
export function parseStoriaCustomId(
  value: string | null,
): { propertyId: string; transaction: "sale" | "rent" } | null {
  if (!value) return null;
  const match = /^HBT-([0-9a-f-]{36})-(SALE|RENT)$/i.exec(value.trim());
  if (!match) return null;
  return { propertyId: match[1]!.toLowerCase(), transaction: match[2]!.toLowerCase() as "sale" | "rent" };
}

export type StoriaEventShape = {
  flow: string | null;
  eventType: string | null;
  transactionId: string | null;
  advertUuid: string | null;
  customId: string | null;
  data: Json;
};

export function readEventShape(parsed: unknown): StoriaEventShape | null {
  const root = asRecord(parsed);
  if (!root) return null;
  const data = asRecord(root["data"]) ?? {};
  const advertUuid =
    pick(root, ["object_id", "objectId"]) ??
    pick(data, ["advert_id", "advertId", "advert.id", "advert.uuid", "id"]);
  const customId =
    pick(data, [
      "custom_fields.id",
      "advert.custom_fields.id",
      "customFields.id",
      "external_id",
      "advert.external_id",
    ]) ?? pick(root, ["custom_fields.id"]);
  return {
    flow: pick(root, ["flow"]),
    eventType: pick(root, ["event_type", "eventType", "type"]),
    transactionId: pick(root, ["transaction_id", "transactionId"]),
    advertUuid: advertUuid && UUID_RE.test(advertUuid) ? advertUuid.toLowerCase() : null,
    customId,
    data,
  };
}

/** Fluxul de mesaje: denumirile plauzibile ale evenimentului OLX. */
function isMessageEvent(shape: StoriaEventShape): boolean {
  const haystack = `${shape.flow ?? ""} ${shape.eventType ?? ""}`.toLowerCase();
  return /message|conversation|inquiry|enquiry|lead/.test(haystack);
}

function isLifecycleEvent(shape: StoriaEventShape): boolean {
  const haystack = `${shape.flow ?? ""} ${shape.eventType ?? ""}`.toLowerCase();
  return /advert|listing|publish/.test(haystack);
}

export type MessagePayload = {
  senderName: string | null;
  phone: string | null;
  email: string | null;
  body: string | null;
  messageId: string | null;
  sentAt: string | null;
};

export function readMessagePayload(shape: StoriaEventShape): MessagePayload {
  const d = shape.data;
  return {
    senderName: pick(d, [
      "sender.name",
      "sender.full_name",
      "user.name",
      "author.name",
      "from.name",
      "contact.name",
      "name",
      "sender_name",
    ]),
    phone: pick(d, [
      "sender.phone",
      "sender.phone_number",
      "user.phone",
      "contact.phone",
      "from.phone",
      "phone",
      "phone_number",
    ]),
    email: pick(d, ["sender.email", "user.email", "contact.email", "from.email", "email"]),
    body: pick(d, ["message.text", "message.body", "message.content", "text", "body", "content", "message"]),
    messageId: pick(d, ["message.id", "message_id", "conversation_id", "conversation.id", "thread_id"]),
    sentAt: pick(d, ["message.created_at", "created_at", "sent_at", "recorded_at"]),
  };
}

// --------------------------------------------------------------- procesarea

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

type MatchedListing = {
  organizationId: string;
  propertyId: string;
  assignedTo: string | null;
  propertyTitle: string;
};

/**
 * Identifică proprietatea: `custom_fields.id` (cel mai sigur, îl trimitem noi la
 * publicare), altfel uuid-ul anunțului căutat în `portal_listings.external_id`
 * (`SALE:uuid|RENT:uuid`).
 */
async function matchListing(admin: Admin, shape: StoriaEventShape): Promise<MatchedListing | null> {
  const custom = parseStoriaCustomId(shape.customId);
  if (custom) {
    const { data } = await admin
      .from("properties")
      .select("id, organization_id, assigned_to, title")
      .eq("id", custom.propertyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) {
      return {
        organizationId: data.organization_id,
        propertyId: data.id,
        assignedTo: data.assigned_to,
        propertyTitle: data.title,
      };
    }
  }

  if (!shape.advertUuid) return null;
  const { data: listings } = await admin
    .from("portal_listings")
    .select("organization_id, property_id, external_id")
    .eq("portal", "storia")
    .ilike("external_id", `%${shape.advertUuid}%`)
    .limit(5);

  for (const listing of listings ?? []) {
    const refs = parseAdvertRefs(listing.external_id);
    if (!Object.values(refs).some((uuid) => uuid?.toLowerCase() === shape.advertUuid)) continue;
    const { data: property } = await admin
      .from("properties")
      .select("id, organization_id, assigned_to, title")
      .eq("id", listing.property_id)
      .maybeSingle();
    if (!property) continue;
    return {
      organizationId: property.organization_id,
      propertyId: property.id,
      assignedTo: property.assigned_to,
      propertyTitle: property.title,
    };
  }
  return null;
}

const SOURCE = "Storia.ro";

async function processMessage(
  admin: Admin,
  shape: StoriaEventShape,
): Promise<StoriaProcessResult> {
  const message = readMessagePayload(shape);
  if (!message.body && !message.senderName && !message.email && !message.phone) {
    return {
      processed: false,
      note: "mesaj Storia fără câmpuri recunoscute (nume/telefon/email/text) — structura payload-ului trebuie confirmată",
    };
  }

  const match = await matchListing(admin, shape);
  if (!match) {
    return {
      processed: false,
      note: `mesaj Storia fără proprietate identificabilă (custom_id=${shape.customId ?? "-"}, advert=${shape.advertUuid ?? "-"})`,
    };
  }

  const name = message.senderName ?? "Contact Storia";
  const now = new Date().toISOString();
  const sentAt = message.sentAt ?? now;
  const bodyText = message.body ? message.body.slice(0, 4000) : null;
  const noteLine = [`Mesaj Storia.ro (${sentAt})`, bodyText].filter(Boolean).join(":\n");

  // Deduplicare lead: același expeditor, aceeași proprietate, lead încă deschis.
  const query = admin
    .from("leads")
    .select("id, notes, assigned_to")
    .eq("organization_id", match.organizationId)
    .eq("property_id", match.propertyId)
    .eq("source", SOURCE)
    .not("stage", "in", "(won,lost)")
    .limit(1);
  const existing = await (message.email
    ? query.eq("email", message.email)
    : message.phone
      ? query.eq("phone", message.phone)
      : query.eq("name", name)
  ).maybeSingle();

  if (existing.data) {
    const leadId = existing.data.id;
    await admin
      .from("leads")
      .update({
        last_interaction_at: now,
        notes: [existing.data.notes, noteLine].filter(Boolean).join("\n---\n").slice(0, 8000),
      })
      .eq("id", leadId);
    await admin.from("lead_events").insert({
      organization_id: match.organizationId,
      lead_id: leadId,
      to_stage: "new",
      note: noteLine.slice(0, 2000),
    });
    return { processed: true, note: `mesaj Storia adăugat pe lead-ul existent ${leadId}` };
  }

  const { data: lead, error } = await admin
    .from("leads")
    .insert({
      organization_id: match.organizationId,
      property_id: match.propertyId,
      name,
      phone: message.phone,
      email: message.email,
      source: SOURCE,
      stage: "new",
      notes: noteLine,
      assigned_to: match.assignedTo,
      last_interaction_at: sentAt,
    })
    .select("id")
    .single();
  if (error) throw error;

  await admin.from("lead_events").insert({
    organization_id: match.organizationId,
    lead_id: lead.id,
    to_stage: "new",
    note: `Lead creat din mesaj Storia.ro. ${bodyText ?? ""}`.trim().slice(0, 2000),
  });

  if (match.assignedTo) {
    await admin.from("notifications").insert({
      organization_id: match.organizationId,
      user_id: match.assignedTo,
      type: "lead",
      title: "Lead nou din Storia.ro",
      body: `${name} a trimis un mesaj pentru „${match.propertyTitle}”.`,
      link: `/app/leads?lead=${lead.id}`,
    });
  }

  await admin.from("audit_logs").insert({
    organization_id: match.organizationId,
    action: "storia.message_lead_created",
    entity: "leads",
    entity_id: lead.id,
    new_values: { property_id: match.propertyId, transaction_id: shape.transactionId },
  });

  return { processed: true, note: `lead nou din mesaj Storia (${lead.id})` };
}

async function processLifecycle(
  admin: Admin,
  shape: StoriaEventShape,
): Promise<StoriaProcessResult> {
  const code = pick(shape.data, ["code", "status", "advert.code"]);
  const match = await matchListing(admin, shape);
  if (!match) {
    return {
      processed: false,
      note: `ciclu de viață Storia pentru un anunț necunoscut în CRM (advert=${shape.advertUuid ?? "-"})`,
    };
  }
  if (!code) {
    return { processed: false, note: "ciclu de viață Storia fără cod de status în payload" };
  }

  const status = storiaListingStatus(code);
  const moderation =
    pick(shape.data, ["moderation.reason", "moderation.description"]) ??
    (status === "error" ? (STORIA_STATUS_MESSAGE[code] ?? `status Storia: ${code}`) : null);

  await admin
    .from("portal_listings")
    .update({
      status,
      last_error: status === "published" || status === "pending" ? null : moderation,
      last_sync_at: new Date().toISOString(),
    })
    .eq("portal", "storia")
    .eq("organization_id", match.organizationId)
    .eq("property_id", match.propertyId);

  await admin
    .from("portal_publications")
    .update({
      status: status === "error" ? "error" : status === "withdrawn" ? "disabled" : "synced",
      last_error: status === "error" ? moderation : null,
      last_synced_at: new Date().toISOString(),
    })
    .eq("portal_key", "storia")
    .eq("organization_id", match.organizationId)
    .eq("property_id", match.propertyId);

  return { processed: true, note: `status anunț Storia „${code}” → ${status}` };
}

/**
 * Punctul de intrare: rulează după jurnalizare, niciodată nu propagă erori către
 * răspunsul HTTP. `eventId` este rândul din `portal_webhook_events`, actualizat
 * cu rezultatul procesării.
 */
export async function processStoriaNotification(args: {
  eventId: string | null;
  parsed: unknown;
}): Promise<StoriaProcessResult> {
  const shape = readEventShape(args.parsed);
  let result: StoriaProcessResult = { processed: false, note: "payload nerecunoscut" };
  try {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    if (!shape) {
      result = { processed: false, note: "payload gol sau non-JSON" };
    } else if (shape.transactionId && (await alreadyProcessed(admin, shape.transactionId, args.eventId))) {
      result = { processed: true, note: `duplicat ignorat (transaction_id ${shape.transactionId})` };
    } else if (isMessageEvent(shape)) {
      result = await processMessage(admin, shape);
    } else if (isLifecycleEvent(shape)) {
      result = await processLifecycle(admin, shape);
    } else {
      result = {
        processed: false,
        note: `flux Storia neprocesat (flow=${shape.flow ?? "-"}, event=${shape.eventType ?? "-"})`,
      };
    }

    if (args.eventId) {
      await admin
        .from("portal_webhook_events")
        .update({ processed: result.processed, process_note: result.note.slice(0, 500) })
        .eq("id", args.eventId);
    }
  } catch (error) {
    console.error("[storia] procesarea notificării a eșuat", error);
    result = { processed: false, note: `eroare la procesare: ${String(error).slice(0, 300)}` };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (args.eventId) {
        await supabaseAdmin
          .from("portal_webhook_events")
          .update({ processed: false, process_note: result.note.slice(0, 500) })
          .eq("id", args.eventId);
      }
    } catch {
      /* jurnalizarea nu trebuie să afecteze răspunsul */
    }
  }
  return result;
}

/** Același `transaction_id` procesat deja → nu repetăm efectele. */
async function alreadyProcessed(
  admin: Admin,
  transactionId: string,
  currentEventId: string | null,
): Promise<boolean> {
  const { data } = await admin
    .from("portal_webhook_events")
    .select("id")
    .eq("portal", "storia")
    .eq("processed", true)
    .eq("parsed_payload->>transaction_id", transactionId)
    .limit(2);
  return (data ?? []).some((row) => row.id !== currentEventId);
}
