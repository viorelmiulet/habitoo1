/**
 * Procesarea notificărilor Storia.ro / OLX Group (Faza 4, parțial).
 *
 * Două fluxuri sunt procesate:
 *
 *  1. `flow: "incoming_message"` — mesaj de la un cumpărător pe un anunț → lead
 *     în CRM, legat de proprietate, asignat agentului responsabil, cu notificare.
 *     CONFIRMAT DIN DOCUMENTAȚIE (developer.olxgroup.com/docs/incoming-message),
 *     NU din date reale: în `portal_webhook_events` nu a sosit încă niciun mesaj.
 *     Câmpuri documentate: `data.ad_id` (id NUMERIC al anunțului pe Storia),
 *     `data.sender_name`, `data.sender_email`, `data.sender_phone`,
 *     `data.message`, `data.id`, `data.conversation_id`, `data.created_at`.
 *     Atenție: `object_id` de la nivelul rădăcină este uuid-ul MESAJULUI, nu al
 *     anunțului, iar payload-ul nu conține `custom_fields.id`. Extragerea este
 *     tolerantă (acceptă și denumiri alternative), iar dacă nu recunoaștem
 *     nimic, evenimentul rămâne `processed = false` cu notă explicită.
 *
 *  2. `flow: "publish_advert"` — ciclul de viață al anunțului. CONFIRMAT pe
 *     payload-uri reale din jurnal (`event_type: advert_posted_success`,
 *     `data.code: active`, `object_id` = uuid-ul anunțului). Actualizează
 *     `portal_listings.status` / `last_error` prin `storiaListingStatus` și, când
 *     payload-ul îl expune, memorează id-ul numeric al anunțului (`AD:<id>` în
 *     `external_id`) — puntea necesară pentru a lega mesajele de proprietate.
 *
 * Idempotență: `transaction_id` deja procesat → nu se repetă niciun efect.
 */
import {
  STORIA_STATUS_MESSAGE,
  parseAdvertRefs,
  parseStoriaAdIds,
  storiaAdIdFromUrl,
  storiaListingStatus,

  withStoriaAdId,
} from "./adverts.server";

type Json = Record<string, unknown>;

export type StoriaProcessResult = { processed: boolean; note: string };

const asRecord = (value: unknown): Json | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;

const str = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `HBT-<propertyId>-SALE|RENT` — identificatorul trimis de noi la publicare. */
export function parseStoriaCustomId(
  value: string | null,
): { propertyId: string; transaction: "sale" | "rent" } | null {
  if (!value) return null;
  const match = /^HBT-([0-9a-f-]{36})-(SALE|RENT)$/i.exec(value.trim());
  if (!match) return null;
  return {
    propertyId: match[1]!.toLowerCase(),
    transaction: match[2]!.toLowerCase() as "sale" | "rent",
  };
}

export type StoriaEventShape = {
  flow: string | null;
  eventType: string | null;
  transactionId: string | null;
  /** uuid-ul anunțului (fluxul de anunțuri: `object_id`). */
  advertUuid: string | null;
  /** id-ul numeric al anunțului pe Storia (fluxul de mesaje: `data.ad_id`). */
  adId: string | null;
  /** Linkul public al anunțului (`data.url`), când vine în notificare. */
  publicUrl: string | null;
  customId: string | null;
  data: Json;
};


export function readEventShape(parsed: unknown): StoriaEventShape | null {
  const root = asRecord(parsed);
  if (!root) return null;
  const data = asRecord(root["data"]) ?? {};
  const flow = pick(root, ["flow"]);
  const isMessage = /message|conversation|inquiry|enquiry|lead/i.test(
    `${flow ?? ""} ${pick(root, ["event_type", "eventType"]) ?? ""}`,
  );

  // La mesaje, `object_id` este uuid-ul mesajului — nu îl folosim ca anunț.
  const advertCandidate = isMessage
    ? pick(data, ["advert_id", "advertId", "advert.uuid", "advert.id"])
    : (pick(root, ["object_id", "objectId"]) ??
      pick(data, ["advert_id", "advertId", "advert.uuid", "advert.id", "id"]));

  const publicUrl = pick(data, ["url", "advert.url", "state.url"]);
  // `data.ad_id` lipsea din notificările reale; linkul public conține însă id-ul
  // numeric, deci el este sursa principală.
  const adId = storiaAdIdFromUrl(publicUrl) ?? pick(data, ["ad_id", "adId", "advert.ad_id"]);

  return {
    flow,
    eventType: pick(root, ["event_type", "eventType", "type"]),
    transactionId: pick(root, ["transaction_id", "transactionId"]),
    advertUuid: advertCandidate && UUID_RE.test(advertCandidate) ? advertCandidate.toLowerCase() : null,
    adId: adId && /^\d+$/.test(adId) ? adId : null,
    publicUrl: publicUrl && /^https?:\/\//i.test(publicUrl) ? publicUrl : null,
    customId: pick(data, [
      "custom_fields.id",
      "advert.custom_fields.id",
      "customFields.id",
      "external_id",
      "advert.external_id",
    ]),
    data,
  };
}


function isMessageEvent(shape: StoriaEventShape): boolean {
  return /message|conversation|inquiry|enquiry|lead/i.test(
    `${shape.flow ?? ""} ${shape.eventType ?? ""}`,
  );
}

function isLifecycleEvent(shape: StoriaEventShape): boolean {
  return /advert|listing|publish/i.test(`${shape.flow ?? ""} ${shape.eventType ?? ""}`);
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
    senderName: pick(d, ["sender_name", "sender.name", "user.name", "contact.name", "from.name", "name"]),
    phone: pick(d, ["sender_phone", "sender.phone", "user.phone", "contact.phone", "phone", "phone_number"]),
    email: pick(d, ["sender_email", "sender.email", "user.email", "contact.email", "email"]),
    body: pick(d, ["message", "message.text", "message.body", "text", "body", "content"]),
    messageId: pick(d, ["id", "message_id", "message.id", "conversation_id", "conversation.id"]),
    sentAt: pick(d, ["created_at", "message.created_at", "sent_at", "recorded_at"]),
  };
}

// --------------------------------------------------------------- procesarea

type Admin = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

type MatchedListing = {
  organizationId: string;
  propertyId: string;
  assignedTo: string | null;
  propertyTitle: string;
  externalId: string | null;
};

async function propertyMatch(
  admin: Admin,
  propertyId: string,
  externalId: string | null,
): Promise<MatchedListing | null> {
  const { data } = await admin
    .from("properties")
    .select("id, organization_id, assigned_to, title")
    .eq("id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    organizationId: data.organization_id,
    propertyId: data.id,
    assignedTo: data.assigned_to,
    propertyTitle: data.title,
    externalId,
  };
}

/**
 * Identifică proprietatea, în ordinea siguranței:
 *   1. `custom_fields.id` (`HBT-<propertyId>-SALE`) — îl trimitem noi la publicare;
 *   2. uuid-ul anunțului, căutat în `portal_listings.external_id` (`SALE:uuid|RENT:uuid`);
 *   3. id-ul numeric al anunțului, căutat în segmentul `AD:<id>`.
 */
async function matchListing(admin: Admin, shape: StoriaEventShape): Promise<MatchedListing | null> {
  const custom = parseStoriaCustomId(shape.customId);
  if (custom) {
    const { data: listing } = await admin
      .from("portal_listings")
      .select("external_id")
      .eq("portal", "storia")
      .eq("property_id", custom.propertyId)
      .maybeSingle();
    const match = await propertyMatch(admin, custom.propertyId, listing?.external_id ?? null);
    if (match) return match;
  }

  const needle = shape.advertUuid ?? (shape.adId ? `AD:${shape.adId}` : null);
  if (!needle) return null;

  const { data: listings } = await admin
    .from("portal_listings")
    .select("organization_id, property_id, external_id")
    .eq("portal", "storia")
    .ilike("external_id", `%${needle}%`)
    .limit(10);

  for (const listing of listings ?? []) {
    const uuidHit =
      shape.advertUuid &&
      Object.values(parseAdvertRefs(listing.external_id)).some(
        (uuid) => uuid?.toLowerCase() === shape.advertUuid,
      );
    const adHit = shape.adId && parseStoriaAdIds(listing.external_id).includes(shape.adId);
    if (!uuidHit && !adHit) continue;
    const match = await propertyMatch(admin, listing.property_id, listing.external_id);
    if (match) return match;
  }
  return null;
}

const SOURCE = "Storia.ro";

async function processMessage(admin: Admin, shape: StoriaEventShape): Promise<StoriaProcessResult> {
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
      note: `mesaj Storia fără proprietate identificabilă (ad_id=${shape.adId ?? "-"}, custom_id=${shape.customId ?? "-"})`,
    };
  }

  const name = message.senderName ?? "Contact Storia";
  const now = new Date().toISOString();
  const sentAt = message.sentAt ?? now;
  const bodyText = message.body ? message.body.slice(0, 4000) : null;
  const noteLine = [`Mesaj Storia.ro (${sentAt})`, bodyText].filter(Boolean).join(":\n");

  // Deduplicare: același expeditor, aceeași proprietate, lead încă deschis.
  const query = admin
    .from("leads")
    .select("id, notes")
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
      link: `/app/leads`,
    });
  }

  await admin.from("audit_logs").insert({
    organization_id: match.organizationId,
    action: "storia.message_lead_created",
    entity: "leads",
    entity_id: lead.id,
    new_values: {
      property_id: match.propertyId,
      transaction_id: shape.transactionId,
      message_id: message.messageId,
      assigned_to: match.assignedTo,
    },
  });

  return { processed: true, note: `lead nou din mesaj Storia (${lead.id})` };
}

async function processLifecycle(admin: Admin, shape: StoriaEventShape): Promise<StoriaProcessResult> {
  const match = await matchListing(admin, shape);
  if (!match) {
    return {
      processed: false,
      note: `ciclu de viață Storia pentru un anunț necunoscut în CRM (advert=${shape.advertUuid ?? "-"})`,
    };
  }

  const code = pick(shape.data, ["code", "status", "advert.code"]);
  const now = new Date().toISOString();

  // Memorăm id-ul numeric al anunțului: notificările de mesaje îl folosesc.
  const externalId =
    shape.adId && !parseStoriaAdIds(match.externalId).includes(shape.adId)
      ? withStoriaAdId(match.externalId, shape.adId)
      : null;
  const urlPatch = shape.publicUrl ? { public_url: shape.publicUrl } : {};

  if (!code) {
    if (externalId || shape.publicUrl) {
      await admin
        .from("portal_listings")
        .update({ ...(externalId ? { external_id: externalId } : {}), ...urlPatch })
        .eq("portal", "storia")
        .eq("organization_id", match.organizationId)
        .eq("property_id", match.propertyId);
      return {
        processed: true,
        note: `link/id anunț Storia memorat (${externalId ? `AD:${shape.adId}` : "url"})`,
      };
    }
    return { processed: false, note: "ciclu de viață Storia fără cod de status în payload" };
  }


  const status = storiaListingStatus(code);
  const detail =
    pick(shape.data, ["moderation.reason", "moderation.description", "detail", "title"]) ??
    pick(shape.data, ["error_message"]);
  const message =
    status === "published" || status === "pending"
      ? null
      : (detail ?? STORIA_STATUS_MESSAGE[code] ?? `status Storia: ${code}`);

  await admin
    .from("portal_listings")
    .update({
      status,
      last_error: message,
      last_sync_at: now,
      ...(externalId ? { external_id: externalId } : {}),
      ...urlPatch,
    })

    .eq("portal", "storia")
    .eq("organization_id", match.organizationId)
    .eq("property_id", match.propertyId);

  await admin
    .from("portal_publications")
    .update({
      status: status === "error" ? "error" : status === "withdrawn" ? "disabled" : "synced",
      last_error: status === "error" ? message : null,
      last_synced_at: now,
    })
    .eq("portal_key", "storia")
    .eq("organization_id", match.organizationId)
    .eq("property_id", match.propertyId);

  return { processed: true, note: `status anunț Storia „${code}” → ${status}` };
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

/**
 * Punctul de intrare: rulează după jurnalizare și niciodată nu propagă erori
 * către răspunsul HTTP. `eventId` este rândul din `portal_webhook_events`,
 * actualizat cu rezultatul procesării (`processed`, `process_note`).
 */
export async function processStoriaNotification(args: {
  eventId: string | null;
  parsed: unknown;
}): Promise<StoriaProcessResult> {
  let result: StoriaProcessResult = { processed: false, note: "payload nerecunoscut" };
  let admin: Admin | null = null;
  try {
    admin = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const shape = readEventShape(args.parsed);

    if (!shape) {
      result = { processed: false, note: "payload gol sau non-JSON" };
    } else if (
      shape.transactionId &&
      (await alreadyProcessed(admin, shape.transactionId, args.eventId))
    ) {
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
  } catch (error) {
    console.error("[storia] procesarea notificării a eșuat", error);
    result = { processed: false, note: `eroare la procesare: ${String(error).slice(0, 300)}` };
  }

  if (args.eventId && admin) {
    try {
      await admin
        .from("portal_webhook_events")
        .update({ processed: result.processed, process_note: result.note.slice(0, 500) })
        .eq("id", args.eventId);
    } catch (error) {
      console.error("[storia] marcarea evenimentului a eșuat", error);
    }
  }
  return result;
}
