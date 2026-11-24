/**
 * Răspunsul agentului către clientul Vrexa: rândul de ieșire se salvează înainte
 * de `POST …/replies`. La timeout/rețea nu se retrimite automat: rămâne „în
 * așteptarea confirmării” până apare ca `sent` la preluare; după 15 minute
 * fără confirmare, retrimiterea e doar manuală.
 */
import type { VrexaResult } from "./client";
import type { VrexaEnv } from "./config";
import { VREXA_CONFIRM_WINDOW_MS, vrexaConversationKey, vrexaMessageKey } from "./messages";

export const VREXA_REPLY_MAX = 2000;
export const VREXA_AWAITING = "În așteptarea confirmării de la Vrexa.";
export const VREXA_UNCONFIRMED = "Vrexa nu a confirmat mesajul în 15 minute. Verifică pe Vrexa înainte să retrimiți.";

export type VrexaReplyRow = { id: string; organization_id: string; portal: string; direction: string; conversation_id: string | null; body: string | null; delivery_status: string | null; attempts: number; updated_at?: string | null; external_message_id?: string | null };
export type VrexaReplyDeps = {
  insert: (row: Record<string, unknown>) => Promise<void>;
  load: (id: string) => Promise<VrexaReplyRow | null>;
  update: (id: string, patch: Record<string, unknown>) => Promise<void>;
  send: (conversationId: string, text: string) => Promise<VrexaResult<{ id?: number | string; sentAt?: string } | null>>;
};
export type VrexaReplyResult = { id: string; status: "sent" | "awaiting" | "failed"; error: string | null };

const fmtRo = (iso: string) => new Date(iso).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Starea afișată: un mesaj „awaiting” mai vechi de 15 minute primește retrimitere manuală. */
export function vrexaReplyRetryable(row: { delivery_status: string | null; updated_at?: string | null }, nowMs: number): boolean {
  if (row.delivery_status === "failed") return true;
  if (row.delivery_status !== "sending") return false;
  const t = row.updated_at ? Date.parse(row.updated_at) : NaN;
  return Number.isFinite(t) && nowMs - t >= VREXA_CONFIRM_WINDOW_MS;
}

export async function deliverVrexaReply(deps: VrexaReplyDeps, env: VrexaEnv, id: string, now = new Date()): Promise<VrexaReplyResult> {
  const row = await deps.load(id);
  if (!row || row.portal !== "vrexa" || row.direction !== "out") throw new Error("Mesajul nu există.");
  if (row.delivery_status === "sent") return { id, status: "sent", error: null };
  const prefix = `vrexa:${env}:`;
  if (!String(row.conversation_id ?? "").startsWith(prefix)) throw new Error("Conversația aparține altui mediu Vrexa.");
  const conversationId = String(row.conversation_id).slice(prefix.length);
  const nowIso = now.toISOString();
  await deps.update(id, { delivery_status: "sending", delivery_error: null, attempts: (row.attempts ?? 0) + 1, updated_at: nowIso });
  const r = await deps.send(conversationId, row.body ?? "");
  if (r.ok) {
    const remoteId = r.data && r.data.id !== undefined && r.data.id !== null ? vrexaMessageKey(env, r.data.id) : null;
    await deps.update(id, { delivery_status: "sent", delivery_error: null, updated_at: nowIso, ...(remoteId ? { external_message_id: remoteId } : {}) });
    return { id, status: "sent", error: null };
  }
  if (r.kind === "network") {
    await deps.update(id, { delivery_status: "sending", delivery_error: VREXA_AWAITING, updated_at: nowIso });
    return { id, status: "awaiting", error: VREXA_AWAITING };
  }
  const error = r.problem.code === "daily_reply_limit_reached"
    ? `Vrexa: s-a atins limita zilnică de răspunsuri${r.problem.detail ? ` (${r.problem.detail})` : ""}.${r.retryAt ? ` Se poate relua după ${fmtRo(r.retryAt)}.` : ""}`
    : `Vrexa a refuzat mesajul: ${r.message}`;
  await deps.update(id, { delivery_status: "failed", delivery_error: error, updated_at: nowIso });
  return { id, status: "failed", error };
}

export async function sendVrexaReply(deps: VrexaReplyDeps, env: VrexaEnv, input: {
  organizationId: string; leadId: string; conversationId: string; propertyId: string | null; userId: string; body: string; id?: string;
}, now = new Date()): Promise<VrexaReplyResult> {
  const body = input.body.trim();
  if (!body) throw new Error("Scrie un mesaj.");
  if (body.length > VREXA_REPLY_MAX) throw new Error(`Mesajul poate avea cel mult ${VREXA_REPLY_MAX} de caractere.`);
  const id = input.id ?? crypto.randomUUID();
  await deps.insert({
    id, organization_id: input.organizationId, portal: "vrexa", lead_id: input.leadId, property_id: input.propertyId,
    conversation_id: vrexaConversationKey(env, input.conversationId), direction: "out", delivery_status: "sending", sent_by: input.userId, attempts: 0,
    body, sent_at: now.toISOString(), expires_at: new Date(now.getTime() + 180 * 86_400_000).toISOString(),
  });
  return deliverVrexaReply(deps, env, id, now);
}
