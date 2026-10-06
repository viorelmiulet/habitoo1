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
import {
  isStoriaErrorEvent,
  isStoriaRemovalSuccess,
  isStoriaSuccessEvent,
  readStoriaAdvertError,
  storiaInfoMessage,
  storiaNotificationId,
} from "./advert-errors";
import { normalizeStoriaPhone } from "./phone";
import {
  findConversationLead,
  notifyAgentOfStoriaMessage,
  saveUnmatchedStoriaMessage,
} from "./messages.server";
import { isStaleStoriaEvent, storiaEventTimestampMs } from "./notifications.server";

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
  /** `event_timestamp` (sau `timestamp`) normalizat în milisecunde. */
  eventTimestampMs: number | null;
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
    eventTimestampMs: storiaEventTimestampMs(root),
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
  conversationId: string | null;
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
    phone: normalizeStoriaPhone(pick(d, [
      "sender_phone",
      "sender.phone",
      "user.phone",
      "contact.phone",
      "phone",
      "phone_number",
    ])),
    email: pick(d, ["sender_email", "sender.email", "user.email", "contact.email", "email"]),
    // Payloadul real folosește obiectul `message: { name, text }`.
    // Căutăm explicit câmpurile imbricate înaintea variantelor legacy plate.
    body: pick(d, ["message.text", "message.body", "text", "body", "content", "message"]),
    // Documentație: `uuid` identifică mesajul, `conversation_id` grupează conversația.
    messageId: pick(d, ["uuid", "id", "message_id", "message.id"]),
    conversationId: pick(d, ["conversation_id", "conversation.id"]),
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
/** Ultima variantă: identificatorul propriu trimis la publicare (`HBT-<id>-SALE`). */
async function matchByCustomId(admin: Admin, shape: StoriaEventShape): Promise<MatchedListing | null> {
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

  return null;
}

async function matchListing(admin: Admin, shape: StoriaEventShape): Promise<MatchedListing | null> {
  // Forma canonică este `ADSLUG:`. `AD:` rămâne doar fallback pentru date vechi.
  const needles = [
    shape.advertUuid,
    shape.adSlug ? `ADSLUG:${shape.adSlug}` : null,
    shape.adSlug ? `AD:${shape.adSlug}` : null,
  ].filter(Boolean) as string[];
  if (!needles.length) return matchByCustomId(admin, shape);

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
  return matchByCustomId(admin, shape);
}

const SOURCE = "Storia.ro";

/** Cât timp păstrăm textul mesajelor primite din portaluri (date personale). */
export const PORTAL_MESSAGE_RETENTION_DAYS = 180;

export function portalMessageExpiry(sentAt: string): string {
  const base = new Date(sentAt);
  const from = Number.isFinite(base.getTime()) ? base : new Date();
  return new Date(from.getTime() + PORTAL_MESSAGE_RETENTION_DAYS * 86_400_000).toISOString();
}

async function processMessage(
  admin: Admin,
  shape: StoriaEventShape,
  eventId: string | null = null,
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
    // Nu ghicim agenția: mesajul merge doar în lista SuperAdmin de atribuire.
    return saveUnmatchedStoriaMessage(admin, {
      webhookEventId: eventId,
      adRef: shape.adSlug ?? shape.advertUuid ?? shape.customId,
      message,
      externalMessageId: message.messageId ?? shape.transactionId ?? null,
    });
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
        conversation_id: message.conversationId,
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
        const { data: savedMessage, error: savedMessageError } = await admin
          .from("portal_messages")
          .select("id, lead_id")
          .eq("organization_id", match.organizationId)
          .eq("portal", "storia")
          .eq("external_message_id", externalMessageId)
          .maybeSingle();
        if (savedMessageError) throw savedMessageError;

        if (savedMessage) {
          await admin
            .from("portal_messages")
            .update({
              sender_name: message.senderName,
              sender_email: message.email,
              sender_phone: message.phone,
              body: bodyText,
              sent_at: sentAt,
              expires_at: portalMessageExpiry(sentAt),
            })
            .eq("id", savedMessage.id);

          if (savedMessage.lead_id) {
            const { data: savedLead } = await admin
              .from("leads")
              .select("notes")
              .eq("id", savedMessage.lead_id)
              .maybeSingle();
            const notes = savedLead?.notes?.includes(noteLine)
              ? savedLead.notes
              : [savedLead?.notes, noteLine].filter(Boolean).join("\n---\n").slice(0, 8000);
            await admin
              .from("leads")
              .update({
                name,
                phone: message.phone,
                email: message.email,
                notes,
                last_interaction_at: sentAt,
              })
              .eq("id", savedMessage.lead_id);
            return {
              processed: true,
              note: `mesaj Storia actualizat pe lead-ul existent ${savedMessage.lead_id}`,
            };
          }
        }
        return {
          processed: true,
          note: `mesaj Storia deja înregistrat (id ${externalMessageId}) — reîncercare ignorată`,
        };
      }
      throw inserted.error;
    }
    messageRowId = inserted.data?.id ?? null;
  }

  const messageKey = externalMessageId ?? messageRowId ?? `${sentAt}:${name}`;

  // Același `conversation_id` → același lead, chiar dacă expeditorul nu a
  // trimis din nou email/telefon.
  const conversationLeadId = await findConversationLead(
    admin,
    match.organizationId,
    message.conversationId,
    messageRowId,
  );
  if (conversationLeadId) {
    const { data: lead } = await admin
      .from("leads")
      .select("notes")
      .eq("id", conversationLeadId)
      .maybeSingle();
    await admin
      .from("leads")
      .update({
        last_interaction_at: sentAt,
        notes: [lead?.notes, noteLine].filter(Boolean).join("\n---\n").slice(0, 8000),
      })
      .eq("id", conversationLeadId);
    await admin.from("lead_events").insert({
      organization_id: match.organizationId,
      lead_id: conversationLeadId,
      to_stage: "new",
      note: noteLine.slice(0, 2000),
    });
    if (messageRowId) {
      await admin.from("portal_messages").update({ lead_id: conversationLeadId }).eq("id", messageRowId);
    } else {
      await admin.from("portal_messages").insert({
        organization_id: match.organizationId,
        portal: "storia",
        property_id: match.propertyId,
        lead_id: conversationLeadId,
        conversation_id: message.conversationId,
        sender_name: message.senderName,
        sender_email: message.email,
        sender_phone: message.phone,
        body: bodyText,
        sent_at: sentAt,
        expires_at: portalMessageExpiry(sentAt),
      });
    }
    await notifyAgentOfStoriaMessage(admin, {
      organizationId: match.organizationId,
      assignedTo: match.assignedTo,
      propertyTitle: match.propertyTitle,
      leadId: conversationLeadId,
      senderName: name,
      body: bodyText,
      messageKey,
      inApp: true,
    });
    return {
      processed: true,
      note: `mesaj Storia adăugat în conversația lead-ului ${conversationLeadId}`,
    };
  }

  const { ingestPortalLead } = await import("@/lib/portals/lead-ingest.server");
  const outcome = await ingestPortalLead(admin, {
    portal: "storia",
    source: SOURCE,
    match,
    name,
    email: message.email,
    phone: message.phone,
    senderName: message.senderName,
    bodyText,
    noteLine,
    sentAt,
    now,
    messageRowId,
    expiresAt: portalMessageExpiry(sentAt),
    createdEventNote: `Lead creat din mesaj Storia.ro. ${bodyText ?? ""}`.trim().slice(0, 2000),
    notificationTitle: "Lead nou din Storia.ro",
    notificationBody: `${name} a trimis un mesaj pentru „${match.propertyTitle}”.`,
    auditAction: "storia.message_lead_created",
    auditValues: {
      property_id: match.propertyId,
      transaction_id: shape.transactionId,
      message_id: message.messageId,
      assigned_to: match.assignedTo,
    },
  });
  // Lead nou: notificarea în aplicație o face deja `ingestPortalLead`;
  // mesaj ulterior pe lead existent: notificăm explicit. Email în ambele cazuri.
  await notifyAgentOfStoriaMessage(admin, {
    organizationId: match.organizationId,
    assignedTo: match.assignedTo,
    propertyTitle: match.propertyTitle,
    leadId: outcome.leadId,
    senderName: name,
    body: bodyText,
    messageKey,
    inApp: !outcome.created,
  });
  return outcome.created
    ? { processed: true, note: `lead nou din mesaj Storia (${outcome.leadId})` }
    : { processed: true, note: `mesaj Storia adăugat pe lead-ul existent ${outcome.leadId}` };
}

/** Notificare în aplicație pentru agentul responsabil, o singură dată per tranzacție. */
async function notifyStoriaAgent(
  admin: Admin,
  match: MatchedListing,
  shape: StoriaEventShape,
  input: { kind: string; title: string; body: string },
): Promise<void> {
  if (!match.assignedTo) return;
  const txKey =
    shape.transactionId ?? `${shape.advertUuid ?? "-"}:${shape.eventType ?? "-"}:${input.body}`;
  const id = await storiaNotificationId([input.kind, match.organizationId, txKey, match.assignedTo]);
  await admin.from("notifications").upsert(
    {
      id,
      organization_id: match.organizationId,
      user_id: match.assignedTo,
      type: input.kind === "storia_error" ? "portal_failure" : "portal_info",
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 500),
      link: `/app/properties/${match.propertyId}?tab=publishing`,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
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

  // Ordinea nu e garantată: un eveniment mai vechi decât ultimul aplicat pe
  // anunț nu suprascrie o stare mai nouă.
  if (shape.eventTimestampMs !== null) {
    const { data: row } = await admin
      .from("portal_listings")
      .select("last_event_at")
      .eq("portal", "storia")
      .eq("organization_id", match.organizationId)
      .eq("property_id", match.propertyId)
      .maybeSingle();
    if (isStaleStoriaEvent(shape.eventTimestampMs, row?.last_event_at ?? null)) {
      return {
        processed: true,
        note: `eveniment Storia mai vechi decât ultimul aplicat (${shape.eventType ?? "-"}) — ignorat`,
      };
    }
    await admin
      .from("portal_listings")
      .update({ last_event_at: new Date(shape.eventTimestampMs).toISOString() })
      .eq("portal", "storia")
      .eq("organization_id", match.organizationId)
      .eq("property_id", match.propertyId);
  }
  const urlPatch = shape.publicUrl ? { public_url: shape.publicUrl } : {};
  const scope = (q: any) =>
    q.eq("organization_id", match.organizationId).eq("property_id", match.propertyId);

  // Erori de publicare (`*_error`, inclusiv erorile de imagine): nu au `data.code`.
  if (isStoriaErrorEvent(shape.eventType)) {
    const error = readStoriaAdvertError(shape.data, shape.eventType);
    await scope(
      admin
        .from("portal_listings")
        .update({ status: "error", last_error: error.message, last_sync_at: now })
        .eq("portal", "storia"),
    );
    await scope(
      admin
        .from("portal_publications")
        .update({ status: "error", last_error: error.message, last_synced_at: now })
        .eq("portal_key", "storia"),
    );
    await notifyStoriaAgent(admin, match, shape, {
      kind: "storia_error",
      title: `Storia a respins anunțul „${match.propertyTitle}”`,
      body: error.message,
    });
    const rawNote = error.recognized ? "" : ` | brut: ${error.raw}`;
    return {
      processed: true,
      note: `eroare Storia (${shape.eventType}): ${error.message}${rawNote}`.slice(0, 500),
    };
  }

  // Succes fără cod de status: ștergem eroarea rămasă de la o încercare anterioară.
  if (!code && isStoriaSuccessEvent(shape.eventType)) {
    const removed = isStoriaRemovalSuccess(shape.eventType);
    const { data: current } = await scope(
      admin.from("portal_listings").select("status").eq("portal", "storia"),
    ).maybeSingle();
    await scope(
      admin
        .from("portal_listings")
        .update({
          last_error: null,
          last_sync_at: now,
          ...(current?.status === "error" ? { status: removed ? "withdrawn" : "pending" } : {}),
          ...(externalId ? { external_id: externalId } : {}),
          ...urlPatch,
        })
        .eq("portal", "storia"),
    );
    await scope(
      admin
        .from("portal_publications")
        .update({ status: removed ? "disabled" : "synced", last_error: null, last_synced_at: now })
        .eq("portal_key", "storia")
        .eq("status", "error"),
    );
    return { processed: true, note: `succes Storia (${shape.eventType}); eroarea anterioară a fost ștearsă` };
  }

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

  // Expirarea anunțului: notificăm agentul întotdeauna și republicăm automat
  // DOAR dacă agenția a bifat opțiunea și oferta mai este publicabilă.
  if (status === "expired") {
    const { handleStoriaExpiry } = await import("./auto-republish.server");
    const outcome = await handleStoriaExpiry(admin, {
      organizationId: match.organizationId,
      propertyId: match.propertyId,
      propertyTitle: match.propertyTitle,
      assignedTo: match.assignedTo,
    });
    return {
      processed: true,
      note: `anunț Storia expirat („${code}”) — ${outcome.note}`,
    };
  }

  // Stări de așteptare (new/unpaid/blocked): mesaj informativ, nu eroare.
  const info = storiaInfoMessage(code);
  if (info) {
    await notifyStoriaAgent(admin, match, shape, {
      kind: "storia_info",
      title: `Storia: „${match.propertyTitle}”`,
      body: info,
    });
    return { processed: true, note: `status anunț Storia „${code}” → ${status}: ${info}` };
  }

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
  /** Încercări deja făcute pentru acest eveniment (0 la prima procesare). */
  attempts?: number;
}): Promise<StoriaProcessResult> {
  let result: StoriaProcessResult = { processed: false, note: "payload nerecunoscut" };
  /** false = eșec permanent (payload gol, flux necunoscut): nu se reîncearcă. */
  let retryable = true;
  let admin: Admin | null = null;
  try {
    admin = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const shape = readEventShape(args.parsed);

    if (!shape) {
      result = { processed: false, note: "payload gol sau non-JSON" };
      retryable = false;
    } else if (
      shape.transactionId &&
      (await alreadyProcessed(admin, shape.transactionId, args.eventId))
    ) {
      result = {
        processed: true,
        note: `duplicat ignorat (transaction_id ${shape.transactionId})`,
      };
    } else if (isMessageEvent(shape)) {
      result = await processMessage(admin, shape, args.eventId);
    } else if (isLifecycleEvent(shape)) {
      result = await processLifecycle(admin, shape);
    } else {
      result = {
        processed: false,
        note: `flux Storia neprocesat (flow=${shape.flow ?? "-"}, event=${shape.eventType ?? "-"})`,
      };
      retryable = false;
    }
  } catch (error) {
    console.error("[storia] procesarea notificării a eșuat", error);
    result = { processed: false, note: `eroare la procesare: ${String(error).slice(0, 300)}` };
  }

  if (args.eventId && admin) {
    const { STORIA_MAX_ATTEMPTS, storiaRetryDelayMs } = await import("./notifications.server");
    const attempts = result.processed || !retryable
      ? Math.max((args.attempts ?? 0) + 1, retryable ? 0 : STORIA_MAX_ATTEMPTS)
      : (args.attempts ?? 0) + 1;
    const delay = result.processed || !retryable ? null : storiaRetryDelayMs(attempts);
    const now = Date.now();
    try {
      // `processed = true` se scrie doar după succes: idempotența după
      // `transaction_id` ia în calcul numai rândurile reușite.
      await admin
        .from("portal_webhook_events")
        .update({
          processed: result.processed,
          process_note: result.note.slice(0, 500),
          attempts,
          last_attempt_at: new Date(now).toISOString(),
          next_attempt_at: delay === null ? null : new Date(now + delay).toISOString(),
        })
        .eq("id", args.eventId);
      if (delay !== null) await admin.rpc("storia_webhook_retry_arm");
    } catch (error) {
      console.error("[storia] marcarea evenimentului a eșuat", error);
    }
  }
  return result;
}
