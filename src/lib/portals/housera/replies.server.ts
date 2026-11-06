/**
 * Răspunsurile agentului către clientul Housera (H10): `POST leads/{id}/messages`
 * cu `Idempotency-Key` = id-ul mesajului nostru. Mesajul se salvează întâi
 * („se trimite”), apoi se trimite; la 429 rămâne în coadă și se reia din cron.
 */
import { HouseraError } from "./client.server";
import type { HouseraClientLike } from "./publish";
import { HOUSERA_MESSAGE_TTL_DAYS } from "./leads.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export const HOUSERA_REPLY_MAX = 2000;
export const HOUSERA_REPLY_PER_MINUTE = 20;
export const HOUSERA_REPLY_PER_HOUR = 200;
export const HOUSERA_RATE_WAIT_LABEL = "În așteptare – limită Housera";
export const HOUSERA_RECONNECT_REPLY = "Reconectează Housera din Setări → Portaluri";
const DEFAULT_WAIT_MS = 60_000;

export type HouseraReplyResult = {
  id: string;
  status: "sending" | "sent" | "failed";
  externalId: string | null;
  error: string | null;
  waiting: boolean;
  deduplicated: boolean;
};

const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const idOf = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** Motivul pe înțelesul agentului. */
export function houseraReplyErrorText(err: unknown): string {
  if (err instanceof HouseraError) {
    if (err.kind === "validation") return "Housera a respins mesajul. Verifică textul (fără date de contact sau linkuri) și reîncearcă.";
    if (err.kind === "unauthorized") return `Conexiunea Housera a expirat. ${HOUSERA_RECONNECT_REPLY}.`;
    if (err.status === 404) return "Conversația nu mai există pe Housera.";
    if (err.status === 403) return err.code === "missing_ability" ? `Conexiunea nu are dreptul de a trimite mesaje. ${HOUSERA_RECONNECT_REPLY}.` : "Housera nu a acceptat cererea acum. Reîncearcă peste câteva minute.";
    if (err.kind === "temporary") return "Housera nu a răspuns. Reîncearcă peste câteva minute.";
    return "Housera a refuzat mesajul.";
  }
  return "Mesajul nu a putut fi trimis. Reîncearcă.";
}

async function recentCounts(admin: Admin, orgId: string, now: Date): Promise<{ minute: number; hour: number }> {
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const { data } = await admin.from("portal_messages").select("updated_at, delivery_status")
    .eq("portal", "housera").eq("organization_id", orgId).eq("direction", "out").eq("delivery_status", "sent").gte("updated_at", hourAgo);
  const rows = (data ?? []) as Array<{ updated_at: string }>;
  const minAgo = now.getTime() - 60_000;
  return { hour: rows.length, minute: rows.filter((r) => new Date(r.updated_at).getTime() > minAgo).length };
}

async function loadRow(admin: Admin, id: string) {
  const { data } = await admin.from("portal_messages").select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

function toResult(row: Record<string, unknown>, deduplicated = false): HouseraReplyResult {
  const ext = typeof row["external_message_id"] === "string" ? (row["external_message_id"] as string).replace(/^housera:msg:/, "") : null;
  return {
    id: row["id"] as string, status: (row["delivery_status"] as HouseraReplyResult["status"]) ?? "sending",
    externalId: ext, error: (row["delivery_error"] as string | null) ?? null,
    waiting: row["delivery_status"] === "sending" && row["delivery_error"] === HOUSERA_RATE_WAIT_LABEL, deduplicated,
  };
}

/** Trimite (sau retrimite) un mesaj deja salvat. Aceeași cheie de idempotență la fiecare încercare. */
export async function deliverHouseraReply(admin: Admin, client: HouseraClientLike, messageId: string, now = new Date()): Promise<HouseraReplyResult> {
  const row = await loadRow(admin, messageId);
  if (!row || row["direction"] !== "out" || row["portal"] !== "housera") throw new Error("Mesajul nu există.");
  if (row["delivery_status"] === "sent") return toResult(row, true);
  const orgId = row["organization_id"] as string;
  const externalLeadId = String(row["conversation_id"] ?? "").replace(/^housera:/, "");
  const nowIso = now.toISOString();
  const wait = async (ms: number) => {
    const patch = { delivery_status: "sending", delivery_error: HOUSERA_RATE_WAIT_LABEL, next_attempt_at: new Date(now.getTime() + ms).toISOString(), updated_at: nowIso };
    await admin.from("portal_messages").update(patch).eq("id", messageId);
    return toResult({ ...row, ...patch });
  };
  const c = await recentCounts(admin, orgId, now);
  if (c.minute >= HOUSERA_REPLY_PER_MINUTE) return wait(DEFAULT_WAIT_MS);
  if (c.hour >= HOUSERA_REPLY_PER_HOUR) return wait(15 * 60_000);

  const attempts = Number(row["attempts"] ?? 0) + 1;
  try {
    const res = await client.requestMeta<unknown>(`leads/${encodeURIComponent(externalLeadId)}/messages`, {
      method: "POST", body: { body: row["body"] }, headers: { "Idempotency-Key": messageId.slice(0, 64) }, noRateRetry: true,
    });
    const d = obj(res.data);
    const ext = idOf(obj(d["data"])["id"]) ?? idOf(d["id"]);
    const patch: Record<string, unknown> = { delivery_status: "sent", delivery_error: null, next_attempt_at: null, attempts, updated_at: nowIso };
    if (ext) patch["external_message_id"] = `housera:msg:${ext}`;
    const { error } = await admin.from("portal_messages").update(patch).eq("id", messageId);
    // Mesajul a revenit deja prin evenimente: păstrăm rândul nostru, fără id dublat.
    if (error && ext) await admin.from("portal_messages").update({ ...patch, external_message_id: undefined }).eq("id", messageId);
    return toResult({ ...row, ...patch }, res.status === 200);
  } catch (err) {
    if (err instanceof HouseraError && err.kind === "rate_limited") {
      await admin.from("portal_messages").update({ attempts }).eq("id", messageId);
      return wait(err.retryAfterMs ?? DEFAULT_WAIT_MS);
    }
    const patch = { delivery_status: "failed", delivery_error: houseraReplyErrorText(err), next_attempt_at: null, attempts, updated_at: nowIso };
    await admin.from("portal_messages").update(patch).eq("id", messageId);
    return toResult({ ...row, ...patch });
  }
}

/** Salvează mesajul („se trimite”) și îl trimite imediat. */
export async function sendHouseraReply(admin: Admin, client: HouseraClientLike, input: {
  organizationId: string; leadId: string; externalLeadId: string; propertyId: string | null; userId: string; body: string; id?: string;
}, now = new Date()): Promise<HouseraReplyResult> {
  const body = input.body.trim();
  if (!body) throw new Error("Scrie un mesaj.");
  if (body.length > HOUSERA_REPLY_MAX) throw new Error(`Mesajul poate avea cel mult ${HOUSERA_REPLY_MAX} de caractere.`);
  const id = input.id ?? crypto.randomUUID();
  const { error } = await admin.from("portal_messages").insert({
    id, organization_id: input.organizationId, portal: "housera", lead_id: input.leadId, property_id: input.propertyId,
    conversation_id: `housera:${input.externalLeadId}`, direction: "out", delivery_status: "sending", sent_by: input.userId,
    body, sent_at: now.toISOString(), expires_at: new Date(now.getTime() + HOUSERA_MESSAGE_TTL_DAYS * 86_400_000).toISOString(),
  });
  if (error) throw new Error("Mesajul nu a putut fi salvat.");
  return deliverHouseraReply(admin, client, id, now);
}

/** Reia mesajele aflate în așteptare (după limită), pentru cron. */
export async function drainHouseraReplies(admin: Admin, orgId: string, client: HouseraClientLike, now = new Date()): Promise<number> {
  const { data } = await admin.from("portal_messages").select("id, next_attempt_at")
    .eq("portal", "housera").eq("organization_id", orgId).eq("direction", "out").eq("delivery_status", "sending")
    .order("sent_at", { ascending: true }).limit(50);
  let sent = 0;
  for (const r of (data ?? []) as Array<{ id: string; next_attempt_at: string | null }>) {
    if (r.next_attempt_at && new Date(r.next_attempt_at).getTime() > now.getTime()) continue;
    const res = await deliverHouseraReply(admin, client, r.id, now);
    if (res.status === "sent") sent++;
    if (res.waiting) break;
  }
  return sent;
}
