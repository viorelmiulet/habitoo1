/**
 * Răspunsul agentului către clientul HomeZZ: rândul `portal_messages` de ieșire
 * se salvează înainte de `send-message`. `send-message` nu e idempotent: la
 * timeout sau eroare de rețea mesajul rămâne „netrimis sigur”, cu retrimitere
 * doar manuală; fără retrimitere automată.
 */
import type { HomezzResult } from "./client";
import { HOMEZZ_MESSAGE_TTL_DAYS } from "./leads.server";

export const HOMEZZ_REPLY_MAX = 2000;
export const HOMEZZ_UNCERTAIN = "Netrimis sigur: HomeZZ nu a confirmat primirea. Verifică pe HomeZZ înainte să retrimiți.";

export type HomezzReplyRow = { id: string; organization_id: string; portal: string; direction: string; conversation_id: string | null; body: string | null; delivery_status: string | null; attempts: number };
export type HomezzReplyDeps = {
  insert: (row: Record<string, unknown>) => Promise<void>;
  load: (id: string) => Promise<HomezzReplyRow | null>;
  update: (id: string, patch: Record<string, unknown>) => Promise<void>;
  send: (organizationId: string, params: { message: string; conversation_id: string }) => Promise<HomezzResult>;
};
export type HomezzReplyResult = { id: string; status: "sent" | "failed"; error: string | null; uncertain: boolean };

export async function deliverHomezzReply(deps: HomezzReplyDeps, id: string, now = new Date()): Promise<HomezzReplyResult> {
  const row = await deps.load(id);
  if (!row || row.portal !== "homezz" || row.direction !== "out") throw new Error("Mesajul nu există.");
  if (row.delivery_status === "sent") return { id, status: "sent", error: null, uncertain: false };
  const conversationId = String(row.conversation_id ?? "").replace(/^homezz:/, "");
  const attempts = (row.attempts ?? 0) + 1;
  const nowIso = now.toISOString();
  // Marcat înainte de trimitere: o întrerupere lasă rândul „netrimis sigur”, nu „se trimite” la nesfârșit.
  await deps.update(id, { delivery_status: "sending", delivery_error: null, attempts, updated_at: nowIso });
  const r = await deps.send(row.organization_id, { message: row.body ?? "", conversation_id: conversationId });
  if (r.ok) {
    await deps.update(id, { delivery_status: "sent", delivery_error: null, next_attempt_at: null, updated_at: nowIso });
    return { id, status: "sent", error: null, uncertain: false };
  }
  const uncertain = r.kind === "timeout" || r.kind === "network_error";
  const error = uncertain ? HOMEZZ_UNCERTAIN : `HomeZZ a refuzat mesajul: ${r.message}`;
  await deps.update(id, { delivery_status: "failed", delivery_error: error, next_attempt_at: null, updated_at: nowIso });
  return { id, status: "failed", error, uncertain };
}

export async function sendHomezzReply(deps: HomezzReplyDeps, input: {
  organizationId: string; leadId: string; conversationId: string; propertyId: string | null; userId: string; body: string; id?: string;
}, now = new Date()): Promise<HomezzReplyResult> {
  const body = input.body.trim();
  if (!body) throw new Error("Scrie un mesaj.");
  if (body.length > HOMEZZ_REPLY_MAX) throw new Error(`Mesajul poate avea cel mult ${HOMEZZ_REPLY_MAX} de caractere.`);
  const id = input.id ?? crypto.randomUUID();
  await deps.insert({
    id, organization_id: input.organizationId, portal: "homezz", lead_id: input.leadId, property_id: input.propertyId,
    conversation_id: `homezz:${input.conversationId}`, direction: "out", delivery_status: "sending", sent_by: input.userId, attempts: 0,
    body, sent_at: now.toISOString(), expires_at: new Date(now.getTime() + HOMEZZ_MESSAGE_TTL_DAYS * 86_400_000).toISOString(),
  });
  return deliverHomezzReply(deps, id, now);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
export async function homezzReplyDeps(db: Admin): Promise<HomezzReplyDeps> {
  const { homezzAgentDeps } = await import("./agents.server");
  const agents = await homezzAgentDeps();
  return {
    async insert(row) { const { error } = await db.from("portal_messages").insert(row); if (error) throw new Error("Mesajul nu a putut fi salvat."); },
    async load(id) { const { data } = await db.from("portal_messages").select("id, organization_id, portal, direction, conversation_id, body, delivery_status, attempts").eq("id", id).maybeSingle(); return data ?? null; },
    async update(id, patch) { await db.from("portal_messages").update(patch).eq("id", id); },
    async send(organizationId, params) { return agents.post("send-message", { key: await agents.agencyKey(organizationId), ...params }); },
  };
}
