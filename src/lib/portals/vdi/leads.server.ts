/**
 * Lead-uri VDI.ro: salvare durabilă în `portal_webhook_events` (dedupe pe
 * `lead.id` prin `external_event_id`), procesare comună pentru webhook și
 * pentru tragerea de rezervă `GET /apileaduri`, reîncercări prin cron.
 */
import {
  VDI_LEADS_PAGE_LIMIT,
  VDI_MAX_ATTEMPTS,
  VDI_RETRY_DELAYS_MS,
  parseVdiLead,
  processVdiLead,
  vdiLeadNote,
  type VdiLead,
  type VdiLeadDeps,
} from "./leads";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

async function loadAdmin(): Promise<Admin> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export function vdiRetryDelayMs(attempts: number): number | null {
  return attempts >= VDI_MAX_ATTEMPTS ? null : (VDI_RETRY_DELAYS_MS[Math.min(attempts - 1, VDI_RETRY_DELAYS_MS.length - 1)] ?? null);
}

/** Salvează lead-ul (o singură dată per `lead.id`). `duplicate` = exista deja. */
export async function recordVdiLeadEvent(
  admin: Admin,
  input: {
    organizationId: string;
    rawLead: unknown;
    leadId: string;
    source: "webhook" | "poll";
    headers?: Record<string, string>;
    rawBody?: string | null;
  },
): Promise<{ eventId: string | null; duplicate: boolean; processed: boolean }> {
  const row = {
    portal: "vdi",
    organization_id: input.organizationId,
    http_method: input.source === "webhook" ? "POST" : "GET",
    signature_present: input.source === "webhook",
    signature_valid: true,
    signature_note: input.source === "webhook" ? "semnătură validă" : "preluat cu cheia agenției",
    headers: (input.headers ?? {}) as never,
    raw_payload: input.rawBody ? input.rawBody.slice(0, 8000) : null,
    parsed_payload: { organization_id: input.organizationId, lead: input.rawLead } as never,
    external_event_id: input.leadId,
    process_note: "primit",
  };
  const { data, error } = await admin
    .from("portal_webhook_events")
    .upsert(row as never, { onConflict: "portal,external_event_id", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return { eventId: data.id, duplicate: false, processed: false };
  const { data: existing } = await admin
    .from("portal_webhook_events")
    .select("id, processed")
    .eq("portal", "vdi")
    .eq("external_event_id", input.leadId)
    .maybeSingle();
  return { eventId: existing?.id ?? null, duplicate: true, processed: existing?.processed === true };
}

function liveDeps(admin: Admin): VdiLeadDeps {
  return {
    async findListing(organizationId, idintern) {
      const { data } = await admin
        .from("portal_listings")
        .select("property_id")
        .eq("organization_id", organizationId)
        .eq("portal", "vdi")
        .eq("external_id", idintern)
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const { data: p } = await admin
        .from("properties")
        .select("id, title, assigned_to")
        .eq("id", data.property_id)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle();
      return p ? { propertyId: p.id, assignedTo: p.assigned_to ?? null, title: p.title ?? null } : null;
    },
    async findAgent(organizationId, idintern) {
      const { data } = await admin
        .from("portal_agent_links")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("portal", "vdi")
        .eq("external_id", idintern as never)
        .maybeSingle();
      return data?.user_id ?? null;
    },
    async saveUnmatched(lead, eventId) {
      const { saveUnmatchedStoriaMessage } = await import("../storia/messages.server");
      await saveUnmatchedStoriaMessage(admin, {
        webhookEventId: eventId,
        adRef: lead.offerIdintern,
        externalMessageId: lead.id,
        message: {
          senderName: lead.name,
          email: lead.email,
          phone: lead.phone,
          body: vdiLeadNote(lead),
          messageId: lead.id,
          conversationId: null,
          sentAt: lead.sentAt,
        },
      }, "vdi");
    },
    async ingest({ organizationId, propertyId, assignedTo, propertyTitle, lead }) {
      const { ingestPortalLead } = await import("../lead-ingest.server");
      const now = new Date().toISOString();
      const { data: msg } = await admin
        .from("portal_messages")
        .upsert(
          {
            organization_id: organizationId,
            portal: "vdi",
            property_id: propertyId,
            external_message_id: lead.id,
            sender_name: lead.name,
            sender_email: lead.email,
            sender_phone: lead.phone,
            body: vdiLeadNote(lead),
            sent_at: lead.sentAt,
          },
          { onConflict: "portal,organization_id,external_message_id" },
        )
        .select("id, lead_id")
        .maybeSingle();
      // Mesajul are deja lead: nu se creează a doua oară.
      if (msg?.lead_id) return { leadId: msg.lead_id, created: false };
      const name = lead.name ?? lead.phone ?? lead.email ?? "Contact VDI.ro";
      return ingestPortalLead(admin, {
        portal: "vdi",
        source: "vdi",
        match: { organizationId, propertyId, assignedTo, propertyTitle },
        name,
        email: lead.email,
        phone: lead.phone,
        senderName: lead.name,
        bodyText: lead.message,
        noteLine: vdiLeadNote(lead),
        sentAt: lead.sentAt,
        now,
        messageRowId: msg?.id ?? null,
        expiresAt: new Date(Date.now() + 180 * 86400_000).toISOString(),
        createdEventNote: `Lead nou din VDI.ro (${lead.typeLabel})`,
        notificationTitle: `${lead.typeLabel} din VDI.ro de la ${name}`,
        notificationBody: propertyTitle ? `Pentru „${propertyTitle}”.` : "Pentru agenție.",
        auditAction: "portal.lead_received",
        auditValues: { portal: "vdi", vdi_lead_id: lead.id, tip: lead.tip },
      });
    },
    async notify({ organizationId, assignedTo, leadId, created, lead, propertyTitle }) {
      // Lead nou cu agent: notificarea a pus-o deja pasul comun.
      if (created && assignedTo) return;
      let users: string[] = assignedTo ? [assignedTo] : [];
      if (users.length === 0) {
        const { data } = await admin
          .from("user_roles")
          .select("user_id")
          .eq("organization_id", organizationId)
          .eq("role", "agency_admin");
        users = Array.from(new Set((data ?? []).map((r) => r.user_id)));
      }
      const name = lead.name ?? lead.phone ?? "contact necunoscut";
      for (const userId of users) {
        await admin.from("notifications").insert({
          organization_id: organizationId,
          user_id: userId,
          type: "lead",
          title: `${lead.typeLabel} din VDI.ro de la ${name}`,
          body: propertyTitle ? `Pentru „${propertyTitle}”.` : "Pentru agenție.",
          link: `/app/leads`,
        } as never);
      }
      void leadId;
    },
  };
}

/** Procesează un eveniment salvat; reține încercarea și programează reluarea. */
export async function processVdiLeadEvent(args: {
  eventId: string;
  parsed: unknown;
  attempts: number;
}): Promise<{ processed: boolean }> {
  const admin = await loadAdmin();
  const payload = (args.parsed ?? {}) as { organization_id?: string; lead?: unknown };
  const attempts = args.attempts + 1;
  const now = new Date();
  try {
    if (!payload.organization_id) throw new Error("agenție lipsă");
    const out = await processVdiLead(liveDeps(admin), payload.organization_id, parseVdiLead(payload.lead), args.eventId);
    await admin
      .from("portal_webhook_events")
      .update({
        processed: true,
        attempts,
        last_attempt_at: now.toISOString(),
        next_attempt_at: null,
        process_note: out.status === "lead" ? `lead ${out.created ? "nou" : "existent"}` : out.status === "unmatched" ? "anunț negăsit — păstrat pentru atribuire SuperAdmin" : "lead invalid — ignorat",
      } as never)
      .eq("id", args.eventId);
    return { processed: true };
  } catch (e) {
    const delay = vdiRetryDelayMs(attempts);
    await admin
      .from("portal_webhook_events")
      .update({
        attempts,
        last_attempt_at: now.toISOString(),
        next_attempt_at: delay === null ? null : new Date(now.getTime() + delay).toISOString(),
        process_note: `eroare: ${(e as Error).message}`.slice(0, 500),
      } as never)
      .eq("id", args.eventId);
    return { processed: false };
  }
}

/** Reia evenimentele VDI neprocesate și scadente. */
export async function retryVdiLeadEvents(admin: Admin, budgetMs: number) {
  const started = Date.now();
  const { data } = await admin
    .from("portal_webhook_events")
    .select("id, parsed_payload, attempts, next_attempt_at, received_at")
    .eq("portal", "vdi")
    .eq("processed", false)
    .eq("signature_valid", true)
    .lt("attempts", VDI_MAX_ATTEMPTS)
    .order("received_at", { ascending: true })
    .limit(50);
  let done = 0;
  for (const row of data ?? []) {
    if (Date.now() - started > budgetMs) break;
    const due = row.next_attempt_at ? Date.parse(row.next_attempt_at) : Date.parse(row.received_at) + 60_000;
    if (due > Date.now()) continue;
    if ((await processVdiLeadEvent({ eventId: row.id, parsed: row.parsed_payload, attempts: row.attempts })).processed) done++;
  }
  return done;
}

export type VdiLeadsPage = {
  leads: unknown[];
  nextCursor: string | null;
  more: boolean;
};

export type VdiPollDeps = {
  fetchPage: (apiKey: string, cursor: string | null) => Promise<
    { ok: true; page: VdiLeadsPage } | { ok: false; rateLimited: boolean; retryAfterMs: number | null; error: string }
  >;
  record: (organizationId: string, rawLead: unknown, leadId: string) => Promise<{ eventId: string | null; duplicate: boolean; processed: boolean }>;
  process: (eventId: string, rawLead: unknown, organizationId: string) => Promise<void>;
  saveCursor: (cursor: string | null, pollAfter: string | null) => Promise<void>;
};

/**
 * Tragerea de rezervă pentru o agenție: pagini până la `mai_sunt = false`
 * (max `maxPages`), cursorul salvat după fiecare pagină înregistrată; 429 →
 * pauză `Retry-After`, fără eroare finală.
 */
export async function pollVdiLeadsForConnection(
  deps: VdiPollDeps,
  input: { organizationId: string; apiKey: string; cursor: string | null; maxPages?: number },
): Promise<{ recorded: number; rateLimited: boolean; error: string | null }> {
  let cursor = input.cursor;
  let recorded = 0;
  for (let i = 0; i < (input.maxPages ?? 5); i++) {
    const res = await deps.fetchPage(input.apiKey, cursor);
    if (!res.ok) {
      if (res.rateLimited) {
        await deps.saveCursor(cursor, new Date(Date.now() + (res.retryAfterMs ?? 60_000)).toISOString());
        return { recorded, rateLimited: true, error: null };
      }
      return { recorded, rateLimited: false, error: res.error };
    }
    for (const raw of res.page.leads) {
      const lead: VdiLead | null = parseVdiLead(raw);
      if (!lead) continue;
      const r = await deps.record(input.organizationId, raw, lead.id);
      if (!r.duplicate) recorded++;
      if (r.eventId && !r.processed) await deps.process(r.eventId, raw, input.organizationId);
    }
    cursor = res.page.nextCursor ?? cursor;
    await deps.saveCursor(cursor, null);
    if (!res.page.more) break;
  }
  return { recorded, rateLimited: false, error: null };
}

/** Rulează tragerea pentru toate conexiunile VDI active care au cheie. */
export async function pollAllVdiLeads(admin: Admin, budgetMs: number) {
  const started = Date.now();
  const { decryptPortalCredential } = await import("../crypto.server");
  const { vdiGetLeads } = await import("./client.server");
  const { data: conns } = await admin
    .from("portal_connections")
    .select("id, organization_id, settings, portal_credentials_encrypted")
    .eq("portal", "vdi")
    .eq("activated", true)
    .not("portal_credentials_encrypted", "is", null);
  let recorded = 0;
  for (const c of conns ?? []) {
    if (Date.now() - started > budgetMs) break;
    const settings = { ...((c.settings ?? {}) as Record<string, unknown>) };
    const after = typeof settings["leads_poll_after"] === "string" ? Date.parse(settings["leads_poll_after"] as string) : 0;
    if (after > Date.now()) continue;
    let apiKey: string | null = null;
    try {
      apiKey = decryptPortalCredential(c.portal_credentials_encrypted);
    } catch {
      apiKey = null;
    }
    if (!apiKey) continue;
    const out = await pollVdiLeadsForConnection(
      {
        fetchPage: async (key, cursor) => {
          const r = await vdiGetLeads(key, cursor, VDI_LEADS_PAGE_LIMIT);
          if (!r.ok) return { ok: false, rateLimited: r.code === "RATE_LIMIT", retryAfterMs: r.retryAfterMs ?? null, error: r.message };
          const b = (r.body ?? {}) as Record<string, unknown>;
          return {
            ok: true,
            page: {
              leads: Array.isArray(b["leaduri"]) ? (b["leaduri"] as unknown[]) : [],
              nextCursor: typeof b["urmatorul_cursor"] === "string" ? (b["urmatorul_cursor"] as string) : null,
              more: b["mai_sunt"] === true,
            },
          };
        },
        record: (organizationId, rawLead, leadId) =>
          recordVdiLeadEvent(admin, { organizationId, rawLead, leadId, source: "poll" }),
        process: async (eventId, rawLead, organizationId) => {
          await processVdiLeadEvent({ eventId, parsed: { organization_id: organizationId, lead: rawLead }, attempts: 0 });
        },
        saveCursor: async (cursor, pollAfter) => {
          if (cursor) settings["leads_cursor"] = cursor;
          if (pollAfter) settings["leads_poll_after"] = pollAfter;
          else delete settings["leads_poll_after"];
          await admin.from("portal_connections").update({ settings } as never).eq("id", c.id);
        },
      },
      {
        organizationId: c.organization_id,
        apiKey,
        cursor: typeof settings["leads_cursor"] === "string" ? (settings["leads_cursor"] as string) : null,
      },
    );
    recorded += out.recorded;
    if (out.error) console.error("[vdi] tragerea lead-urilor a eșuat", out.error);
  }
  return recorded;
}
