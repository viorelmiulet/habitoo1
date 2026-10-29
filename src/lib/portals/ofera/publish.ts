import type { OferaBody } from "./mapper";
import { object, type OferaResponse } from "./response";

export const OFERA_UNCONFIRMED = "Nu știm dacă Ofera a creat anunțul. Verifică pe Ofera.ro înainte de a retrimite.";
export type OferaState = { transaction: "sale" | "rent"; external_id: string; ofera_id: number | null; public_url: string | null; valid_until: string | null; status: "pending_activation" | "active" | "inactive" | "deleted" | "unconfirmed"; images_fingerprint: string | null; last_log_track_id: string | null; last_message: string | null };
export type OferaCall = (method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) => Promise<OferaResponse>;
export type OferaWriteDeps = { call: OferaCall; save: (state: OferaState) => Promise<void>; now?: () => Date; imagesFingerprint?: string };
export type OferaWriteResult = { ok: boolean; states: OferaState[]; message: string; response?: OferaResponse; promotedConfirmed?: boolean; unconfirmed?: boolean };
export function oferaValidUntil(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}
export function oferaExpired(state: Pick<OferaState, "valid_until">, now = new Date()): boolean { return !!state.valid_until && state.valid_until < now.toISOString().slice(0, 10); }
export async function oferaImagesFingerprint(images: OferaBody["images"]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(images));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
}
function positiveId(value: unknown): number | null { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; }
function url(value: unknown): string | null { try { return typeof value === "string" && new URL(value).protocol === "https:" ? value : null; } catch { return null; } }
function stateFor(body: OferaBody): OferaState { return { transaction: body.external_id.endsWith("-i") ? "rent" : "sale", external_id: body.external_id, ofera_id: null, public_url: null, valid_until: null, status: "unconfirmed", images_fingerprint: null, last_log_track_id: null, last_message: null }; }
function responsePatch(state: OferaState, response: OferaResponse): OferaState {
  const data = object(response.data);
  return { ...state, public_url: url(data?.url) ?? state.public_url, valid_until: oferaValidUntil(data?.valabilitate) ?? state.valid_until, last_log_track_id: response.logTrackId, last_message: response.message };
}
export async function activateOfera(state: OferaState, deps: OferaWriteDeps): Promise<OferaWriteResult> {
  if (!state.ofera_id) return { ok: false, states: [state], message: "ID-ul anunțului Ofera lipsește." };
  const response = await deps.call("POST", `/activate-product/${state.ofera_id}`);
  const next = { ...responsePatch(state, response), status: response.ok ? "active" as const : "pending_activation" as const };
  await deps.save(next);
  return { ok: response.ok, states: [next], message: response.message, response };
}
export async function writeOferaBody(body: OferaBody, previous: OferaState | undefined, deps: OferaWriteDeps, intent?: "activate" | "resend"): Promise<OferaWriteResult> {
  if (intent === "activate") return previous?.status === "pending_activation" ? activateOfera(previous, deps) : { ok: false, states: [], message: "Anunțul nu mai așteaptă activarea la Ofera." };
  if (previous?.status === "pending_activation") return activateOfera(previous, deps);
  if (previous?.status === "unconfirmed" && !previous.ofera_id && intent !== "resend") return { ok: false, states: [previous], message: OFERA_UNCONFIRMED, unconfirmed: true };
  let state = previous && previous.status !== "deleted" ? { ...previous, external_id: body.external_id } : stateFor(body);
  const fingerprint = deps.imagesFingerprint ?? await oferaImagesFingerprint(body.images);
  let creating = !state.ofera_id;
  let wasCreated = creating;
  let promotionRefused = false;
  let promotionMessage = "";
  const request = async (promoted: 0 | 1) => {
    const payload: Partial<OferaBody> = { ...body, promoted };
    if (!creating && state.images_fingerprint === fingerprint) delete payload.images;
    return deps.call(creating ? "POST" : "PUT", creating ? "/create-product" : `/update-product/${state.ofera_id}`, payload);
  };
  // Fence the non-idempotent POST before sending: interrupted Workers must never recreate silently.
  const armCreate = async () => { state = { ...state, ofera_id: null, status: "unconfirmed", last_message: OFERA_UNCONFIRMED }; await deps.save(state); };
  if (creating) await armCreate();
  let response = await request(body.promoted);
  if (!response.ok && response.status === 404 && !creating) { creating = true; wasCreated = true; await armCreate(); response = await request(body.promoted); }
  if (!response.ok && response.status === 406 && body.promoted === 1) {
    promotionRefused = true; promotionMessage = response.message;
    // Some responses identify an already-saved advert. Never create it a second time.
    const returnedId = positiveId(object(response.data)?.id);
    if (creating && returnedId) { state.ofera_id = returnedId; creating = false; }
    response = await request(0);
  }
  if (!response.ok) {
    if (creating && response.status === null) {
      state = { ...responsePatch(state, response), status: "unconfirmed", last_message: OFERA_UNCONFIRMED };
      await deps.save(state);
      return { ok: false, states: [state], message: OFERA_UNCONFIRMED, response, unconfirmed: true };
    }
    // Definitive rejected creates have no remote state; remove the pre-send fence through caller.
    return { ok: false, states: creating ? [] : [state], message: response.message, response };
  }
  if (creating) {
    const id = positiveId(object(response.data)?.id);
    if (!id) { await deps.save({ ...state, status: "unconfirmed", last_message: OFERA_UNCONFIRMED }); return { ok: false, states: [state], message: OFERA_UNCONFIRMED, unconfirmed: true, response }; }
    state.ofera_id = id;
  }
  const shouldActivate = wasCreated || previous?.status === "inactive" || previous?.status === "deleted" || oferaExpired(state, deps.now?.());
  state = { ...responsePatch(state, response), images_fingerprint: fingerprint, status: shouldActivate ? "pending_activation" : "active" };
  await deps.save(state);
  const activated = shouldActivate ? await activateOfera(state, deps) : { ok: true, states: [state], message: response.message, response };
  return { ...activated, message: [activated.message, promotionMessage].filter(Boolean).join(" "), ...(promotionRefused ? { promotedConfirmed: false } : {}) };
}
export async function withdrawOfera(states: OferaState[], hardDelete: boolean, deps: OferaWriteDeps): Promise<OferaWriteResult> {
  const changed: OferaState[] = [];
  for (const state of states) {
    if (state.status === "deleted" || (!hardDelete && state.status === "inactive")) continue;
    if (!state.ofera_id) { if (state.status === "unconfirmed") return { ok: false, states: changed, message: OFERA_UNCONFIRMED }; continue; }
    const response = await deps.call(hardDelete ? "DELETE" : "POST", `/${hardDelete ? "delete" : "deactivate"}-product/${state.ofera_id}`);
    if (!response.ok && !(hardDelete && response.status === 404)) return { ok: false, states: changed, message: response.message, response };
    const next = { ...responsePatch(state, response), status: hardDelete ? "deleted" as const : "inactive" as const };
    await deps.save(next); changed.push(next);
  }
  return { ok: true, states: changed, message: hardDelete ? "Anunțurile au fost șterse definitiv la Ofera." : "Anunțurile au fost dezactivate la Ofera." };
}