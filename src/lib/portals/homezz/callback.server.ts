/**
 * Notificările HomeZZ (moderare): rutare după `data.key` (comparat în timp
 * constant cu cheile salvate), jurnal `portal_webhook_events` fără cheie,
 * deduplicare pe hash-ul corpului și efect pe oferta cu `internal_id` din
 * acea agenție. Orchestrarea are dependențe injectabile (teste fără DB).
 */
import {
  HOMEZZ_CALLBACK_MAX_BYTES, constantTimeEqual, decodeHomezzBody, homezzCallbackEffect, parseHomezzCallback,
  redactHomezzCallback, sha256Hex, type HomezzCallback,
} from "./callback";

export const HOMEZZ_EVENT_MAX_ATTEMPTS = 5;
export const HOMEZZ_INLINE_BUDGET_MS = 1500;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export type HomezzListingHit = { id: string; propertyId: string };
export type HomezzCallbackDeps = {
  /** Agenția a cărei cheie are acest hash SHA-256; `null` = necunoscută. */
  resolveOrg: (keyHash: string) => Promise<string | null>;
  record: (row: { organizationId: string; bodyHash: string; payload: Record<string, unknown>; headers: Record<string, string> }) => Promise<{ id: string | null; duplicate: boolean }>;
  findListing: (organizationId: string, internalId: string) => Promise<HomezzListingHit | null>;
  markError: (listingId: string, message: string) => Promise<void>;
  notify: (n: { organizationId: string; propertyId: string; eventId: string; title: string; body: string }) => Promise<void>;
  /** 503: mesajul devine lead (`homezz/leads.server.ts`). */
  importMessage: (e: { organizationId: string; internalId: string | null; conversationId: string | null; message: string | null; receivedAt: string }) => Promise<string>;
  finish: (eventId: string, r: { processed: boolean; note: string; attempts: number; nextAttemptAt: string | null }) => Promise<void>;
};

export type HomezzCallbackResponse = { status: number; body: Record<string, unknown> };

/** Aplică efectul unui eveniment salvat; aruncă la eroare de DB (se reia). */
export async function applyHomezzEvent(deps: HomezzCallbackDeps, organizationId: string, eventId: string, c: HomezzCallback, receivedAt = new Date().toISOString()): Promise<string> {
  const effect = homezzCallbackEffect(c);
  if (effect.kind === "none") return effect.note;
  if (effect.kind === "message") return deps.importMessage({ organizationId, internalId: c.internalId, conversationId: c.conversationId, message: c.text, receivedAt });
  if (!c.internalId) return "fără internal_id";
  const hit = await deps.findListing(organizationId, c.internalId);
  if (!hit) return "anunț necunoscut în agenție";
  await deps.markError(hit.id, effect.lastError);
  await deps.notify({ organizationId, propertyId: hit.propertyId, eventId, title: effect.title, body: effect.lastError });
  return `${effect.code} aplicat`;
}

/** Procesează rândul și îl marchează; eșecurile rămân `processed=false` cu reluare programată. */
export async function processHomezzEventRow(deps: HomezzCallbackDeps, eventId: string, organizationId: string, c: HomezzCallback, attempts: number, now = Date.now(), receivedAt = new Date(now).toISOString()): Promise<boolean> {
  try {
    const note = await applyHomezzEvent(deps, organizationId, eventId, c, receivedAt);
    await deps.finish(eventId, { processed: true, note, attempts: attempts + 1, nextAttemptAt: null });
    return true;
  } catch (err) {
    const delay = RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)]!;
    await deps.finish(eventId, { processed: false, note: `eșec: ${err instanceof Error ? err.message : "eroare"}`, attempts: attempts + 1, nextAttemptAt: new Date(now + delay).toISOString() }).catch(() => undefined);
    return false;
  }
}

/** Ruta: corp brut → 401/413/400 fără salvare, altfel salvare, procesare în buget și 200. */
export async function handleHomezzCallback(
  input: { raw: string; contentType: string | null; userAgent?: string | null },
  deps: HomezzCallbackDeps,
  runWithinBudget: (fn: () => Promise<boolean>) => Promise<string> = async (fn) => { await fn(); return "done"; },
): Promise<HomezzCallbackResponse> {
  if (new TextEncoder().encode(input.raw).length > HOMEZZ_CALLBACK_MAX_BYTES) return { status: 413, body: { status: "too_large" } };
  const decoded = decodeHomezzBody(input.raw, input.contentType);
  const c = decoded ? parseHomezzCallback(decoded) : null;
  if (!decoded || !c?.key) return { status: 401, body: { status: "unauthorized" } };
  const organizationId = await deps.resolveOrg(await sha256Hex(c.key));
  if (!organizationId) return { status: 401, body: { status: "unauthorized" } };
  const rec = await deps.record({
    organizationId, bodyHash: await sha256Hex(input.raw), payload: redactHomezzCallback(decoded),
    headers: { "content-type": input.contentType ?? "", "user-agent": input.userAgent ?? "" },
  });
  if (rec.duplicate) return { status: 200, body: { status: "ok", duplicate: true } };
  if (!rec.id) return { status: 503, body: { status: "retry" } };
  let processed = false;
  const outcome = await runWithinBudget(async () => (processed = await processHomezzEventRow(deps, rec.id!, organizationId, c, 0)));
  return { status: 200, body: { status: "ok", processed: outcome === "done" && processed } };
}

// ---------------------------------------------------------------- dependențe reale

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function homezzCallbackDeps(admin?: Admin): Promise<HomezzCallbackDeps> {
  const db: Admin = admin ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  let leadDeps: import("./leads.server").HomezzLeadDeps | null = null;
  return {
    async importMessage(e) {
      const m = await import("./leads.server");
      leadDeps ??= await m.homezzLeadDeps(db);
      return m.importHomezzMessage(leadDeps, e);
    },
    async resolveOrg(keyHash) {
      const { data, error } = await db.from("portal_connections").select("organization_id, portal_credentials_encrypted, settings")
        .eq("portal", "homezz").not("portal_credentials_encrypted", "is", null);
      if (error) throw new Error("Conexiunile HomeZZ nu au putut fi citite.");
      const { decryptPortalCredential } = await import("../crypto.server");
      let found: string | null = null;
      for (const r of (data ?? []) as Array<{ organization_id: string; portal_credentials_encrypted: string | null; settings: Record<string, unknown> | null }>) {
        let h = typeof r.settings?.["key_sha256"] === "string" ? (r.settings["key_sha256"] as string) : null;
        if (!h) {
          const key = decryptPortalCredential(r.portal_credentials_encrypted)?.trim();
          if (!key) continue;
          h = await sha256Hex(key);
        }
        // Parcurgem toate rândurile: timpul nu depinde de poziția potrivirii.
        if (constantTimeEqual(h, keyHash) && !found) found = r.organization_id;
      }
      return found;
    },
    async record(r) {
      const { data, error } = await db.from("portal_webhook_events").insert({
        portal: "homezz", organization_id: r.organizationId, http_method: "POST",
        signature_present: false, signature_valid: true, signature_note: "cheia agenției (data.key)",
        headers: r.headers, raw_payload: JSON.stringify(r.payload), parsed_payload: r.payload,
        external_event_id: `body:${r.bodyHash}`, processed: false, process_note: "primit; procesare",
      }).select("id").maybeSingle();
      if (error) {
        if (error.code === "23505") return { id: null, duplicate: true };
        throw new Error("Evenimentul HomeZZ nu a putut fi salvat.");
      }
      return { id: (data?.id as string | undefined) ?? null, duplicate: false };
    },
    async findListing(organizationId, internalId) {
      const { data } = await db.from("portal_listings").select("id, property_id").eq("organization_id", organizationId).eq("portal", "homezz")
        .contains("portal_offers", [{ internal_id: internalId }]).limit(2);
      const rows = (data ?? []) as Array<{ id: string; property_id: string }>;
      return rows.length === 1 ? { id: rows[0]!.id, propertyId: rows[0]!.property_id } : null;
    },
    async markError(listingId, message) {
      const now = new Date().toISOString();
      const { error } = await db.from("portal_listings").update({ status: "error", last_error: message, last_event_at: now, updated_at: now }).eq("id", listingId);
      if (error) throw new Error("Anunțul HomeZZ nu a putut fi actualizat.");
    },
    async notify(n) {
      const { data: p } = await db.from("properties").select("title, assigned_to").eq("id", n.propertyId).eq("organization_id", n.organizationId).maybeSingle();
      if (!p?.assigned_to) return;
      // ID stabil per eveniment + agent: o reluare nu dublează notificarea.
      const x = await sha256Hex(JSON.stringify(["habitoo-homezz-event", n.eventId, p.assigned_to]));
      const id = `${x.slice(0, 8)}-${x.slice(8, 12)}-5${x.slice(13, 16)}-${((parseInt(x[16]!, 16) & 0x3) | 0x8).toString(16)}${x.slice(17, 20)}-${x.slice(20, 32)}`;
      const { error } = await db.from("notifications").upsert({
        id, organization_id: n.organizationId, user_id: p.assigned_to, type: "portal_failure",
        title: `${n.title}: „${p.title}”`, body: n.body, link: `/app/properties/${n.propertyId}?tab=publishing`,
      }, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw new Error("Notificarea HomeZZ nu a putut fi salvată.");
    },
    async finish(eventId, r) {
      await db.from("portal_webhook_events").update({
        processed: r.processed, process_note: r.note, attempts: r.attempts, last_attempt_at: new Date().toISOString(), next_attempt_at: r.nextAttemptAt,
      }).eq("id", eventId);
    },
  };
}

/** Reia evenimentele HomeZZ neprocesate (cel mult 5 încercări). */
export async function retryHomezzEvents(admin?: Admin, max = 50): Promise<{ attempted: number; succeeded: number }> {
  const deps = await homezzCallbackDeps(admin);
  const db: Admin = admin ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const nowIso = new Date().toISOString();
  const { data } = await db.from("portal_webhook_events").select("id, organization_id, parsed_payload, attempts, next_attempt_at, received_at")
    .eq("portal", "homezz").eq("processed", false).eq("signature_valid", true).not("organization_id", "is", null)
    .lt("attempts", HOMEZZ_EVENT_MAX_ATTEMPTS).order("received_at", { ascending: true }).limit(max);
  let attempted = 0, succeeded = 0;
  for (const row of (data ?? []) as Array<{ id: string; organization_id: string; parsed_payload: unknown; attempts: number; next_attempt_at: string | null; received_at: string }>) {
    if (row.next_attempt_at && row.next_attempt_at > nowIso) continue;
    if (!row.parsed_payload || typeof row.parsed_payload !== "object") continue;
    attempted++;
    if (await processHomezzEventRow(deps, row.id, row.organization_id, parseHomezzCallback(row.parsed_payload as Record<string, unknown>), row.attempts, Date.now(), row.received_at)) succeeded++;
  }
  return { attempted, succeeded };
}
