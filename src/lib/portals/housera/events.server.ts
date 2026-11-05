/**
 * Evenimentele Housera în baza de date: jurnalul `portal_webhook_events`
 * (deduplicare după `external_event_id`), rutarea către agenție, aplicarea pe
 * `portal_listings` și notificarea agentului responsabil. Folosit de webhook și de cronuri.
 */
import { applyHouseraEffect, houseraEventConnection, houseraEventEffect, type HouseraEvent, type HouseraListingRow } from "./events";
import { parsePortalOffers } from "../imobiliare/offer-links";
import type { HouseraLeadDeps } from "./leads.server";

const LEAD_TYPES = new Set(["lead.created", "lead.updated", "lead.message_received"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export const HOUSERA_MAX_ATTEMPTS = 5;
export const HOUSERA_INLINE_BUDGET_MS = 1500;

export async function houseraAdmin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Agenția după `connection` → `portal_connections.external_account_id`. */
export async function resolveHouseraOrganization(admin: Admin, e: HouseraEvent): Promise<string | null> {
  const conn = houseraEventConnection(e);
  if (!conn) return null;
  const { data } = await admin.from("portal_connections").select("organization_id")
    .eq("portal", "housera").eq("external_account_id", conn).limit(1).maybeSingle();
  return (data?.organization_id as string | undefined) ?? null;
}

export type RecordInput = {
  organizationId: string | null;
  event: HouseraEvent | null;
  rawBody: string | null;
  headers: Record<string, string>;
  method: string;
  signature: { present: boolean; valid: boolean; note: string };
  processNote: string;
};

/** Inserează rândul; `duplicate: true` dacă `webhook-id` a fost deja văzut. */
export async function recordHouseraEvent(admin: Admin, r: RecordInput): Promise<{ id: string | null; duplicate: boolean }> {
  const { data, error } = await admin.from("portal_webhook_events").insert({
    portal: "housera",
    organization_id: r.organizationId,
    http_method: r.method,
    signature_present: r.signature.present,
    signature_valid: r.signature.valid,
    signature_note: r.signature.note,
    headers: r.headers,
    raw_payload: r.rawBody,
    parsed_payload: r.event,
    // Doar evenimentele autentificate ocupă cheia de deduplicare.
    external_event_id: r.signature.valid && r.event ? r.event.id : null,
    processed: false,
    process_note: r.processNote,
  }).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") return { id: null, duplicate: true };
    throw new Error("Evenimentul Housera nu a putut fi salvat.");
  }
  return { id: (data?.id as string | undefined) ?? null, duplicate: false };
}

async function notifyAgent(admin: Admin, orgId: string, propertyId: string, eventId: string, kind: "published" | "rejected", detail: string | null) {
  const { data: p } = await admin.from("properties").select("title,assigned_to").eq("id", propertyId).eq("organization_id", orgId).maybeSingle();
  if (!p?.assigned_to) return;
  const bytes = new TextEncoder().encode(JSON.stringify(["habitoo-housera-event", eventId, p.assigned_to]));
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  h[6] = (h[6]! & 0x0f) | 0x50; h[8] = (h[8]! & 0x3f) | 0x80;
  const x = Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  const id = `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  await admin.from("notifications").upsert({
    id, organization_id: orgId, user_id: p.assigned_to,
    type: kind === "published" ? "portal_published" : "portal_failure",
    title: kind === "published" ? `Anunțul „${p.title}” este publicat pe Housera` : `Housera a respins anunțul „${p.title}”`,
    body: kind === "rejected" ? detail : null,
    link: `/app/properties/${propertyId}?tab=publishing`,
  }, { onConflict: "id", ignoreDuplicates: true });
}

async function findListingRow(admin: Admin, orgId: string | null, code: string | null, ref: string | null) {
  const pick = async (filter: Record<string, string>) => {
    let q = admin.from("portal_listings").select("id, organization_id, property_id, status, portal_offers, public_url, last_error, last_warning, published_at").eq("portal", "housera").contains("portal_offers", [filter]);
    if (orgId) q = q.eq("organization_id", orgId);
    const { data } = await q.limit(1).maybeSingle();
    return data as (HouseraListingRow & { id: string; organization_id: string; property_id: string }) | null;
  };
  return (code ? await pick({ id: code }) : null) ?? (ref ? await pick({ reference: ref }) : null);
}

/** Aplică evenimentul; întoarce nota de procesare. Aruncă la eroare de DB (se reia). */
export async function applyHouseraEvent(admin: Admin, orgId: string | null, e: HouseraEvent, nowIso = new Date().toISOString(), deps: HouseraLeadDeps = {}): Promise<{ note: string; organizationId: string | null }> {
  if (LEAD_TYPES.has(e.type)) {
    // Fără agenție nu avem cheia cu care să citim cererea.
    if (!orgId) return { note: "conexiune necunoscută", organizationId: null };
    const { processHouseraLeadEvent } = await import("./leads.server");
    return { note: await processHouseraLeadEvent(admin, orgId, e, deps), organizationId: orgId };
  }
  const effect = houseraEventEffect(e);
  if (effect.kind !== "listing") return { note: effect.note, organizationId: orgId };
  const row = await findListingRow(admin, orgId, effect.code, effect.externalRef);
  if (!row) return { note: "anunț necunoscut", organizationId: orgId };
  const patch = applyHouseraEffect({ ...row, portal_offers: parsePortalOffers(row.portal_offers) }, effect, nowIso);
  if (!patch) return { note: "anunț necunoscut", organizationId: row.organization_id };
  const { error } = await admin.from("portal_listings").update({ ...patch, updated_at: nowIso }).eq("id", row.id);
  if (error) throw new Error("Anunțul Housera nu a putut fi actualizat.");
  if (effect.notify) await notifyAgent(admin, row.organization_id, row.property_id, e.id, effect.notify, effect.lastError ?? null);
  return { note: `${e.type} aplicat`, organizationId: row.organization_id };
}

/** Procesează rândul salvat și îl marchează; eșecurile rămân `processed=false`. */
export async function processHouseraEventRow(admin: Admin, rowId: string, orgId: string | null, e: HouseraEvent, attempts: number, deps: HouseraLeadDeps = {}): Promise<boolean> {
  try {
    // `connection` prezent, dar necunoscut: nu ghicim agenția.
    if (!orgId && houseraEventConnection(e)) {
      await admin.from("portal_webhook_events").update({
        processed: true, process_note: "conexiune necunoscută", attempts: attempts + 1, last_attempt_at: new Date().toISOString(), next_attempt_at: null,
      }).eq("id", rowId);
      return true;
    }
    const r = await applyHouseraEvent(admin, orgId, e, undefined, deps);
    const unknownConn = !orgId && !r.organizationId;
    const conn = unknownConn && (r.note === "anunț necunoscut" || r.note === "conexiune necunoscută");
    await admin.from("portal_webhook_events").update({
      processed: true,
      organization_id: r.organizationId,
      process_note: conn ? "conexiune necunoscută" : r.note,
      attempts: attempts + 1, last_attempt_at: new Date().toISOString(), next_attempt_at: null,
    }).eq("id", rowId);
    return true;
  } catch (err) {
    const delay = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000][Math.min(attempts, 3)]!;
    await admin.from("portal_webhook_events").update({
      process_note: `eșec: ${err instanceof Error ? err.message : "eroare"}`,
      attempts: attempts + 1, last_attempt_at: new Date().toISOString(), next_attempt_at: new Date(Date.now() + delay).toISOString(),
    }).eq("id", rowId);
    return false;
  }
}

/** Salvează (cu deduplicare) și procesează un eveniment din `GET events`. */
export async function ingestPulledHouseraEvent(admin: Admin, orgId: string, e: HouseraEvent, deps: HouseraLeadDeps = {}): Promise<boolean> {
  const rec = await recordHouseraEvent(admin, {
    organizationId: orgId, event: e, rawBody: null, headers: {}, method: "PULL",
    signature: { present: false, valid: true, note: "GET events (cheia agenției)" }, processNote: "recuperat",
  });
  if (rec.duplicate || !rec.id) return false;
  await processHouseraEventRow(admin, rec.id, orgId, e, 0, deps);
  return true;
}

/** Reia evenimentele valide neprocesate (webhook sau recuperare). */
export async function retryHouseraEvents(admin: Admin, max = 50): Promise<{ attempted: number; succeeded: number }> {
  const nowIso = new Date().toISOString();
  const { data } = await admin.from("portal_webhook_events").select("id, organization_id, parsed_payload, attempts, next_attempt_at")
    .eq("portal", "housera").eq("processed", false).eq("signature_valid", true).lt("attempts", HOUSERA_MAX_ATTEMPTS)
    .order("received_at", { ascending: true }).limit(max);
  const { parseHouseraEvent } = await import("./events");
  let attempted = 0, succeeded = 0;
  for (const row of (data ?? []) as Array<{ id: string; organization_id: string | null; parsed_payload: unknown; attempts: number; next_attempt_at: string | null }>) {
    if (row.next_attempt_at && row.next_attempt_at > nowIso) continue;
    const e = parseHouseraEvent(row.parsed_payload);
    if (!e) continue;
    attempted++;
    if (await processHouseraEventRow(admin, row.id, row.organization_id, e, row.attempts)) succeeded++;
  }
  return { attempted, succeeded };
}
