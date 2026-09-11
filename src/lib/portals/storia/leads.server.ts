/**
 * Procesarea notificărilor Storia.ro / OLX Group (Faza 4, parțial).
 *
 * Două fluxuri sunt procesate:
 *
 *  1. `flow: "incoming_message"` — mesaj de la un cumpărător pe un anunț → lead
 *     în CRM, legat de proprietate, asignat agentului responsabil, cu notificare.
 *     CONFIRMAT PE PAYLOAD REAL: `data.ad_id` conține slugul alfanumeric din
 *     linkul public al anunțului (de exemplu `IwcT`), nu un id numeric.
 *     Câmpuri documentate: `data.ad_id`,
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
 *     payload-ul expune URL-ul, memorează slugul (`ADSLUG:<slug>` în
 *     `external_id`) — puntea folosită pentru a lega mesajele de proprietate.
 *
 * Idempotență: `transaction_id` deja procesat → nu se repetă niciun efect.
 */
import {
  STORIA_STATUS_MESSAGE,
  parseAdvertRefs,
  parseStoriaAdIds,
  parseStoriaAdSlugs,
  storiaAdSlugFromUrl,
  storiaListingStatus,
  withStoriaAdSlug,
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
  /** Slugul alfanumeric din URL; la mesaje vine în `data.ad_id`. */
  adSlug: string | null;
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
  // Payloadurile reale confirmă că `data.ad_id` este chiar slugul din URL.
  // Acceptăm valori alfanumerice și folosim URL-ul drept fallback.
  const adSlugCandidate =
    pick(data, ["ad_id", "adId", "advert.ad_id", "advert.id"]) ??
    storiaAdSlugFromUrl(publicUrl);

  return {
    flow,
    eventType: pick(root, ["event_type", "eventType", "type"]),
    transactionId: pick(root, ["transaction_id", "transactionId"]),
    advertUuid:
      advertCandidate && UUID_RE.test(advertCandidate) ? advertCandidate.toLowerCase() : null,
    adSlug:
      adSlugCandidate && /^[A-Za-z0-9]{2,}$/.test(adSlugCandidate)
        ? adSlugCandidate
        : null,
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
    senderName: pick(d, [
      "sender_name",
      "sender.name",
      "user.name",
      "contact.name",
      "from.name",
      "message.name",
      "name",
    ]),
    phone: pick(d, [
      "sender_phone",
      "sender.phone",
      "user.phone",
      "contact.phone",
      "phone",
      "phone_number",
    ]),
    email: pick(d, ["sender_email", "sender.email", "user.email", "contact.email", "email"]),
    body: pick(d, ["message", "message.text", "message.body", "text", "body", "content"]),
    messageId: pick(d, ["id", "message_id", "message.id", "conversation_id", "conversation.id"]),
    sentAt: pick(d, ["created_at", "message.created_at", "sent_at", "recorded_at"]),
  };
}

// --------------------------------------------------------------- procesarea

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

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
 *   3. slugul anunțului, căutat în segmentul canonic `ADSLUG:<slug>`.
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

  // Forma canonică este `ADSLUG:`. `AD:` rămâne doar fallback pentru date vechi.
  const needles = [
    shape.advertUuid,
    shape.adSlug ? `ADSLUG:${shape.adSlug}` : null,
    shape.adSlug ? `AD:${shape.adSlug}` : null,
  ].filter(Boolean) as string[];
  if (!needles.length) return null;

  const { data: listings } = await admin
    .from("portal_listings")
    .select("organization_id, property_id, external_id")
    .eq("portal", "storia")
    .or(needles.map((n) => `external_id.ilike.%${n}%`).join(","))
    .limit(20);

  for (const listing of listings ?? []) {
    const uuidHit =
      shape.advertUuid &&
      Object.values(parseAdvertRefs(listing.external_id)).some(
        (uuid) => uuid?.toLowerCase() === shape.advertUuid,
      );
    const known = [
      ...parseStoriaAdIds(listing.external_id),
      ...parseStoriaAdSlugs(listing.external_id),
    ];
    const slugHit = shape.adSlug ? known.includes(shape.adSlug) : false;
    if (!uuidHit && !slugHit) continue;

    const match = await propertyMatch(admin, listing.property_id, listing.external_id);
    if (match) return match;
  }

  // Ultimă punte: slugul din linkul public salvat pe anunț (`...-ID<slug>.html`).
  const slugCandidates = [shape.adSlug].filter(Boolean) as string[];
  for (const slug of slugCandidates) {
    const { data: byUrl } = await admin
      .from("portal_listings")
      .select("property_id, external_id, public_url")
      .eq("portal", "storia")
      .ilike("public_url", `%ID${slug}.html%`)
      .limit(5);
    for (const listing of byUrl ?? []) {
      const match = await propertyMatch(admin, listing.property_id, listing.external_id);
      if (match) return match;
    }
  }
  return null;
}

const SOURCE = "Storia.ro";

/** Cât timp păstrăm textul mesajelor primite din portaluri (date personale). */
export const PORTAL_MESSAGE_RETENTION_DAYS = 180;

export function portalMessageExpiry(sentAt: string): string {
  const base = new Date(sentAt);
  const from = Number.isFinite(base.getTime()) ? base : new Date();
  return new Date(from.getTime() + PORTAL_MESSAGE_RETENTION_DAYS * 86_400_000).toISOString();
}

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
      note: `mesaj Storia fără proprietate identificabilă (slug=${shape.adSlug ?? "-"}, custom_id=${shape.customId ?? "-"})`,
    };
  }

  const name = message.senderName ?? "Contact Storia";
  const now = new Date().toISOString();
  const sentAt = message.sentAt ?? now;
  const bodyText = message.body ? message.body.slice(0, 4000) : null;
  const noteLine = [`Mesaj Storia.ro (${sentAt})`, bodyText].filter(Boolean).join(":\n");

  // Idempotență la nivel de mesaj: dacă OLX reîncearcă aceeași notificare,
  // indexul unic pe (portal, organizație, id mesaj) oprește efectele repetate
  // ÎNAINTE de a atinge lead-ul, deci nu se creează lead-uri duplicate.
  const externalMessageId = message.messageId ?? shape.transactionId ?? null;
  let messageRowId: string | null = null;
  if (externalMessageId) {
    const inserted = await admin
      .from("portal_messages")
      .insert({
        organization_id: match.organizationId,
        portal: "storia",
        property_id: match.propertyId,
        external_message_id: externalMessageId,
        sender_name: message.senderName,
        sender_email: message.email,
        sender_phone: message.phone,
        body: bodyText,
        sent_at: sentAt,
        expires_at: portalMessageExpiry(sentAt),
      })
      .select("id")
      .maybeSingle();
    if (inserted.error) {
      if (inserted.error.code === "23505") {
        return {
          processed: true,
          note: `mesaj Storia deja înregistrat (id ${externalMessageId}) — reîncercare ignorată`,
        };
      }
      throw inserted.error;
    }
    messageRowId = inserted.data?.id ?? null;
  }

  const attachMessageToLead = async (leadId: string) => {
    if (messageRowId) {
      await admin.from("portal_messages").update({ lead_id: leadId }).eq("id", messageRowId);
      return;
    }
    // Fără id de mesaj de la portal nu putem deduplica, dar păstrăm mesajul.
    await admin.from("portal_messages").insert({
      organization_id: match.organizationId,
      portal: "storia",
      property_id: match.propertyId,
      lead_id: leadId,
      sender_name: message.senderName,
      sender_email: message.email,
      sender_phone: message.phone,
      body: bodyText,
      sent_at: sentAt,
      expires_at: portalMessageExpiry(sentAt),
    });
  };

  // Deduplicare: același expeditor, aceeași proprietate, lead încă deschis.
  const query = admin
    .from("leads")
    .select("id, notes")
    .eq("organization_id", match.organizationId)
    .eq("property_id", match.propertyId)
    .eq("source", SOURCE)
    .not("stage", "in", "(won,lost)")
    .limit(1);
  const existing = await (
    message.email
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
    await attachMessageToLead(leadId);
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

  await attachMessageToLead(lead.id);

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

async function processLifecycle(
  admin: Admin,
  shape: StoriaEventShape,
): Promise<StoriaProcessResult> {
  const match = await matchListing(admin, shape);
  if (!match) {
    return {
      processed: false,
      note: `ciclu de viață Storia pentru un anunț necunoscut în CRM (advert=${shape.advertUuid ?? "-"})`,
    };
  }

  const code = pick(shape.data, ["code", "status", "advert.code"]);
  const now = new Date().toISOString();

  // Memorăm doar forma canonică `ADSLUG:`; mesajele folosesc același slug.
  let learned: string | null = null;
  if (shape.adSlug && !parseStoriaAdSlugs(match.externalId).includes(shape.adSlug)) {
    learned = withStoriaAdSlug(learned ?? match.externalId, shape.adSlug);
  }
  const externalId = learned;
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
        note: `link/id anunț Storia memorat (${
          externalId
            ? [
                shape.adSlug ? `ADSLUG:${shape.adSlug}` : null,
              ]
                .filter(Boolean)
                .join(" ")
            : "url"
        })`,
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
      result = {
        processed: true,
        note: `duplicat ignorat (transaction_id ${shape.transactionId})`,
      };
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

  // Curățare oportunistă: mesajele mai vechi decât perioada de păstrare dispar.
  if (admin) {
    try {
      await admin.rpc("purge_expired_portal_messages");
    } catch (error) {
      console.error("[storia] curățarea mesajelor expirate a eșuat", error);
    }
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
