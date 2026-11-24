/**
 * Mesajele Vrexa (pur, dependențe injectate): preluare paginată de la cursor,
 * lead-uri din mesajele `received`, potrivirea răspunsurilor `sent`.
 */
import type { VrexaEnv } from "./config";
import type { VrexaResult } from "./client";

export const VREXA_SOURCE = "Vrexa.ro";
export const VREXA_MESSAGES_DISABLED = "Mesajele sunt oprite în Vrexa. Pornește-le din Configurare agenție → Integrare API.";
export const VREXA_MAX_PAGES = 5;
export const VREXA_DISABLED_RETRY_MS = 60 * 60_000;
export const VREXA_CONFIRM_WINDOW_MS = 15 * 60_000;

export type VrexaMessage = {
  id: number | string; conversationId: string | number; externalId: string; direction: "received" | "sent";
  text: string; sentAt: string; lead?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  agent?: { name?: string | null; email?: string | null } | null;
};
export type VrexaMessagesPage = { items: VrexaMessage[]; next: string | number | null; hasMore: boolean };

export const vrexaMessageKey = (env: VrexaEnv, id: string | number) => `${env}:${id}`;
export const vrexaConversationKey = (env: VrexaEnv, conversationId: string | number) => `vrexa:${env}:${conversationId}`;

export type VrexaOfferMatch = { propertyId: string; assignedTo: string | null; title: string | null };
export type VrexaSyncDeps = {
  env: VrexaEnv;
  organizationId: string;
  /** settings curente ale conexiunii. */
  settings: Record<string, unknown>;
  fetchPage: (after: string) => Promise<VrexaResult<VrexaMessagesPage>>;
  saveSettings: (patch: Record<string, unknown>) => Promise<void>;
  findOffer: (externalId: string) => Promise<VrexaOfferMatch | null>;
  /** `null` = deja salvat (aceeași cheie). */
  insertMessage: (row: { key: string; conversation: string; propertyId: string; leadId: string | null; direction: "in" | "out"; name: string | null; email: string | null; phone: string | null; body: string; sentAt: string }) => Promise<string | null>;
  /** Răspuns din Habitoo în așteptare, din aceeași conversație, cu același text (fără ID Vrexa). */
  findPendingReply: (conversation: string, text: string) => Promise<string | null>;
  confirmReply: (rowId: string, key: string, sentAt: string) => Promise<void>;
  loadLink: (conversationId: string) => Promise<string | null>;
  createLead: (input: { match: VrexaOfferMatch; conversationId: string; name: string; email: string | null; phone: string | null; body: string; sentAt: string; messageRowId: string }) => Promise<string>;
  saveLink: (conversationId: string, leadId: string) => Promise<void>;
  appendNote: (leadId: string, note: string) => Promise<void>;
  notify: (input: { userId: string; leadId: string; title: string; body: string; key: string }) => Promise<void>;
  unmatched: (m: VrexaMessage, key: string) => Promise<void>;
  now: () => number;
};

/** Cursorul per mediu, în `settings.vrexa_messages_cursor = { test, production }`. */
export function vrexaCursor(settings: Record<string, unknown>, env: VrexaEnv): string {
  const c = settings["vrexa_messages_cursor"];
  const v = c && typeof c === "object" ? (c as Record<string, unknown>)[env] : null;
  return v === null || v === undefined ? "0" : String(v);
}
const noteLine = (sentAt: string, body: string) => `[${VREXA_SOURCE} · mesaj · ${sentAt.slice(0, 16).replace("T", " ")}]\n${body}`;
const iso = (v: string, fallback: number) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : new Date(fallback).toISOString());

/** Salvează un mesaj; aruncă la eroare de DB (pagina nu avansează cursorul). */
export async function ingestVrexaMessage(deps: VrexaSyncDeps, m: VrexaMessage): Promise<"saved" | "duplicate" | "unmatched" | "confirmed"> {
  const key = vrexaMessageKey(deps.env, m.id);
  const conv = String(m.conversationId);
  const conversation = vrexaConversationKey(deps.env, conv);
  const sentAt = iso(m.sentAt, deps.now());
  const text = String(m.text ?? "");
  if (m.direction === "sent") {
    const pending = await deps.findPendingReply(conversation, text);
    if (pending) { await deps.confirmReply(pending, key, sentAt); return "confirmed"; }
  }
  const match = m.externalId ? await deps.findOffer(String(m.externalId)) : null;
  if (!match) { await deps.unmatched(m, key); return "unmatched"; }
  const linked = await deps.loadLink(conv);
  const incoming = m.direction === "received";
  const rowId = await deps.insertMessage({
    key, conversation, propertyId: match.propertyId, leadId: linked, direction: incoming ? "in" : "out",
    name: incoming ? (m.lead?.name ?? null) : (m.agent?.name ?? null), email: incoming ? (m.lead?.email ?? null) : null, phone: incoming ? (m.lead?.phone ?? null) : null,
    body: text, sentAt,
  });
  if (!rowId) return "duplicate";
  if (!incoming) return "saved";
  if (!linked) {
    const leadId = await deps.createLead({
      match, conversationId: conv, name: m.lead?.name?.trim() || `Client ${VREXA_SOURCE} (#${conv})`,
      email: m.lead?.email ?? null, phone: m.lead?.phone ?? null, body: noteLine(sentAt, text), sentAt, messageRowId: rowId,
    });
    await deps.saveLink(conv, leadId);
    return "saved";
  }
  await deps.appendNote(linked, noteLine(sentAt, text));
  if (match.assignedTo) await deps.notify({ userId: match.assignedTo, leadId: linked, key, title: `Mesaj nou din ${VREXA_SOURCE}${match.title ? ` pentru „${match.title}”` : ""}`, body: text.slice(0, 200) });
  return "saved";
}

/** O rulare: cel mult 5 pagini; cursorul avansează doar după salvarea paginii. */
export async function syncVrexaMessages(deps: VrexaSyncDeps): Promise<{ pages: number; saved: number; skipped?: "disabled_wait"; disabled?: boolean; error?: string }> {
  const disabledAt = typeof deps.settings["vrexa_messages_disabled_at"] === "string" ? Date.parse(deps.settings["vrexa_messages_disabled_at"] as string) : NaN;
  if (Number.isFinite(disabledAt) && deps.now() - disabledAt < VREXA_DISABLED_RETRY_MS) return { pages: 0, saved: 0, skipped: "disabled_wait" };
  let cursor = vrexaCursor(deps.settings, deps.env);
  let pages = 0, saved = 0;
  while (pages < VREXA_MAX_PAGES) {
    const r = await deps.fetchPage(cursor);
    if (!r.ok) {
      if (r.problem.code === "messages_disabled") {
        await deps.saveSettings({ vrexa_messages_disabled_at: new Date(deps.now()).toISOString() });
        return { pages, saved, disabled: true };
      }
      return { pages, saved, error: r.message };
    }
    if (pages === 0 && Number.isFinite(disabledAt)) await deps.saveSettings({ vrexa_messages_disabled_at: null });
    const page = r.data ?? { items: [], next: null, hasMore: false };
    for (const m of page.items ?? []) if ((await ingestVrexaMessage(deps, m)) !== "duplicate") saved++;
    pages++;
    if (page.next !== null && page.next !== undefined && String(page.next) !== cursor) {
      cursor = String(page.next);
      const prev = deps.settings["vrexa_messages_cursor"];
      await deps.saveSettings({ vrexa_messages_cursor: { ...(prev && typeof prev === "object" ? prev : {}), [deps.env]: cursor } });
    }
    if (!page.hasMore) break;
  }
  return { pages, saved };
}
