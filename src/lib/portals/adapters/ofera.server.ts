import { notSupported, type PortalAdapter, type PortalContext, type PortalFail } from "../adapter";
import { OFERA_MISSING_MESSAGE, oferaConfigured, oferaProviderId, OFERA_SECRET_NAMES } from "../ofera/config";
import { oferaRequest } from "../ofera/client.server";
import { getOferaToken, type OferaAuthDeps } from "../ofera/auth.server";
import { oferaRedact, type OferaResponse } from "../ofera/response";
import { writeOferaBody, withdrawOfera, activateOfera, type OferaState, type OferaWriteResult } from "../ofera/publish";
import type { ListingRef, ListingOutcome, PortalResult } from "../adapter";
import type * as Load from "../ofera/listings.server";
export type OferaAdapterDeps = OferaAuthDeps & { build?: typeof Load.buildOferaBodies; load?: typeof Load.loadOferaStates; save?: typeof Load.saveOferaState; clear?: typeof Load.clearRejectedOferaCreate };
const failure = (result: OferaResponse): PortalFail => ({ ok: false, code: result.status === 401 ? "AUTH_ERROR" : "PORTAL_ERROR", message: result.message, httpStatus: null, portalResponse: result });
export function createOferaAdapter(injected?: OferaAdapterDeps): PortalAdapter {
  const env = () => injected?.env ?? process.env;
  const missing = () => !oferaConfigured(env());
  const dependencies = async (ctx: PortalContext): Promise<OferaAuthDeps> => injected ?? { env: process.env, ...await (await import("../ofera/store.server")).createOferaStore(ctx.organizationId) };
  const loader = () => import("../ofera/listings.server");
  const load = async (input: { organizationId: string; propertyId: string }) => injected?.load ? injected.load(input) : (await loader()).loadOferaStates(input);
  const save = async (input: { organizationId: string; propertyId: string }, state: OferaState) => injected?.save ? injected.save(input, state) : (await loader()).saveOferaState(input, state);
  const result = (r: OferaWriteResult, states: OferaState[]): PortalResult<ListingOutcome> => {
    if (!r.ok) return { ok: false, code: r.unconfirmed ? "INVALID_REQUEST" : "PORTAL_ERROR", message: r.message, portalResponse: r.response, detail: r.unconfirmed ? "ofera_unconfirmed_no_auto_retry" : "ofera_write_failed" };
    const offers = states.flatMap(s => s.status === "active" && s.ofera_id && s.public_url ? [{ transaction: s.transaction, reference: s.external_id, id: String(s.ofera_id), url: s.public_url }] : []);
    return { ok: true, data: { externalId: states.map(s => s.external_id).join(","), live: true, detail: "ofera_confirmed", portalStatus: states.some(s => s.status === "pending_activation") ? "pending" : "published", message: r.message, portalResponse: r.response, ...(offers[0] ? { publicUrl: offers[0].url, offers } : {}), ...(r.promotedConfirmed === false ? { promotedConfirmed: false } : {}) } };
  };
  async function upsert(ctx: PortalContext, ref: ListingRef): Promise<PortalResult<ListingOutcome>> {
    if (missing()) return { ok: false, code: "CONFIG_ERROR", message: OFERA_MISSING_MESSAGE };
    const input = { organizationId: ctx.organizationId, propertyId: ref.propertyId };
    const stored = await load(input);
    const deps = await dependencies(ctx);
    const d = { call: (method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) => oferaRequest(method, path, deps, body), save: (s: OferaState) => save(input, s) };
    // Explicit retry activation must not run mapper or resend any body/images.
    if (ref.oferaIntent === "activate") {
      const pending = stored.filter(s => s.status === "pending_activation");
      if (!pending.length) return { ok: false, code: "INVALID_REQUEST", message: "Anunțul nu mai așteaptă activarea la Ofera." };
      if (!ctx.allowLiveRequests) return { ok: true, data: { externalId: ref.externalId, live: false, detail: "ofera_activation_dry_run" } };
      let last: OferaWriteResult = { ok: true, states: [], message: "" };
      for (const s of pending) { last = await activateOfera(s, d); if (!last.ok) return result(last, last.states); }
      return result(last, await load(input));
    }
    const built = injected?.build ? await injected.build(input) : await (await loader()).buildOferaBodies(input);
    if (!built.ok) return { ok: false, code: "VALIDATION_ERROR", message: built.reasons.join(" ") };
    if (!ctx.allowLiveRequests) return { ok: true, data: { externalId: built.bodies.map(b => b.external_id).join(","), live: false, detail: "ofera_dry_run", message: "Oferta a fost validată local; nu s-a trimis nimic la Ofera." } };
    const done: OferaState[] = [];
    const notes = [...built.warnings];
    let confirmed = true;
    for (const draft of built.bodies) {
      const old = stored.find(s => s.transaction === (draft.external_id.endsWith("-i") ? "rent" : "sale"));
      const r = await writeOferaBody({ ...draft, promoted: ref.promoted === true ? 1 : 0 }, old, d, ref.oferaIntent);
      if (!r.ok) {
        if (!r.unconfirmed && !r.states.length) {
          if (injected?.clear) await injected.clear(input, draft.external_id); else await (await loader()).clearRejectedOferaCreate(input, draft.external_id);
        }
        return result(r, [...done, ...r.states]);
      }
      done.push(...r.states); notes.push(r.message);
      if (r.promotedConfirmed === false) confirmed = false;
    }
    const wanted = new Set(done.map(s => s.transaction));
    const stale = stored.filter(s => !wanted.has(s.transaction) && s.status !== "inactive" && s.status !== "deleted");
    if (stale.length) { const withdrawn = await withdrawOfera(stale, false, d); if (!withdrawn.ok) return result(withdrawn, done); }
    return result({ ok: true, states: done, message: notes.join(" "), ...(confirmed ? {} : { promotedConfirmed: false }) }, done);
  }
  return {
    id: "ofera",
    async getStatus() {
      return { ok: true, data: { configured: !missing(), live: false, detail: missing() ? OFERA_MISSING_MESSAGE : "Credențialele Ofera sunt configurate. Testează conexiunea." } };
    },
    async testConnection(ctx) {
      if (missing()) return { ok: false, code: "CONFIG_ERROR", message: OFERA_MISSING_MESSAGE };
      try {
        const deps = await dependencies(ctx);
        const response = await oferaRequest("GET", "/categories", deps);
        if (!response.ok) return failure(response);
        const token = await getOferaToken(deps);
        const scope = oferaRedact(JSON.stringify(token.scope || "nespecificat"), [...OFERA_SECRET_NAMES.map((name) => env()[name] ?? ""), token.token]).slice(1, -1);
        return { ok: true, data: { configured: true, live: true, detail: `Conectat · Scopuri Ofera: ${scope} · ID furnizor agenție: ${oferaProviderId(ctx.settings["id_furnizor"]) === null ? "necompletat" : "completat"}.${response.logTrackId ? ` Referință Ofera: ${response.logTrackId}.` : ""}`, portalResponse: response } };
      } catch { return { ok: false, code: "CONFIG_ERROR", message: "Conexiunea Ofera nu a putut fi verificată sau jurnalizată." }; }
    },
    publishListing: upsert,
    updateListing: upsert,
    async withdrawListing(ctx, ref) {
      if (missing()) return { ok: false, code: "CONFIG_ERROR", message: OFERA_MISSING_MESSAGE };
      const input = { organizationId: ctx.organizationId, propertyId: ref.propertyId };
      const states = await load(input);
      if (!ctx.allowLiveRequests) return { ok: true, data: { externalId: ref.externalId, live: false, detail: "ofera_withdraw_dry_run" } };
      const deps = await dependencies(ctx);
      // Soft deletion still only deactivates; account-deletion pipeline supplies hard-delete intent before removing the row.
      const r = await withdrawOfera(states, ref.withdrawReason === "account_deleted" || ref.withdrawReason === "hard_deleted", { call: (method, path, body) => oferaRequest(method, path, deps, body), save: s => save(input, s) });
      const out = result(r, r.states);
      return out.ok ? { ...out, data: { ...out.data, portalStatus: "withdrawn" } } : out;
    },
    async sync() { return notSupported("sync"); },
  };
}
export const oferaAdapter = createOferaAdapter();