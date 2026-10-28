/**
 * Adaptor HomeDirect.ro: test conexiune (`GET /stats`), publicare/actualizare (POST/PUT /properties,
 * un anunț per tranzacție, idempotent pe `externalIds.post`), status (PATCH) și ștergere (DELETE,
 * doar pentru proprietăți șterse). Cheia CRM e globală (HOMEDIRECT_CRM_API_KEY).
 */
import type { ConnectionStatusOutcome, ListingOutcome, ListingRef, PortalAdapter, PortalContext, PortalFail, PortalResult } from "../adapter";
import { notSupported } from "../adapter";
import type { PortalErrorCode } from "../errors";
import { describeHomedirectStats, getHomedirectStats, type HomedirectCallFail, type HomedirectDeps } from "../homedirect/client.server";
import { HOMEDIRECT_KEY_MISSING_MESSAGE, hasHomedirectKey, resolveHomedirectBaseUrl } from "../homedirect/config";
import type * as Load from "../homedirect/load.server";
import {
  HOMEDIRECT_AGENCY_LINK_HINT,
  HOMEDIRECT_STATUS_LABEL,
  deleteHomedirect,
  homedirectWithdrawPlan,
  refreshHomedirectAccounts,
  setHomedirectStatus,
  upsertHomedirectBodies,
  type HomedirectStored,
} from "../homedirect/publish";
import type { PortalOffer } from "../imobiliare/offer-links";

const FAIL_CODE: Record<HomedirectCallFail["kind"], PortalErrorCode> = {
  not_configured: "CONFIG_ERROR",
  invalid_base_url: "CONFIG_ERROR",
  validation: "VALIDATION_ERROR",
  unauthorized: "AUTH_ERROR",
  forbidden: "AUTH_ERROR",
  not_found: "NOT_FOUND",
  duplicate: "INVALID_REQUEST",
  rate_limited: "RATE_LIMIT",
  client_error: "INVALID_REQUEST",
  server_error: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
  blocked_redirect: "CONFIG_ERROR",
};

export function homedirectToPortalFail(f: HomedirectCallFail, prefix = ""): PortalFail {
  return { ok: false, code: FAIL_CODE[f.kind], message: `${prefix}${f.message}`, detail: `homedirect_kind=${f.kind}`, httpStatus: f.status, portalResponse: f.body, retryAfterMs: f.retryAfterMs };
}

export type HomedirectAdapterDeps = HomedirectDeps & {
  build?: typeof Load.buildHomedirectBodies;
  loadStored?: typeof Load.loadHomedirectStored;
  save?: typeof Load.saveHomedirectStates;
  propertyState?: typeof Load.loadHomedirectPropertyState;
  loadFingerprints?: typeof Load.loadHomedirectFingerprints;
  saveFingerprints?: typeof Load.saveHomedirectFingerprints;
};

const L = () => import("../homedirect/load.server");
const lazy: Required<Omit<HomedirectAdapterDeps, keyof HomedirectDeps>> = {
  build: async (i) => (await L()).buildHomedirectBodies(i),
  loadStored: async (i) => (await L()).loadHomedirectStored(i),
  save: async (i, s) => (await L()).saveHomedirectStates(i, s),
  propertyState: async (i) => (await L()).loadHomedirectPropertyState(i),
  loadFingerprints: async (o, u) => (await L()).loadHomedirectFingerprints(o, u),
  saveFingerprints: async (o, u, a, b) => (await L()).saveHomedirectFingerprints(o, u, a, b),
};

const TX = { sale: "vânzare", rent: "închiriere" } as const;

export function createHomedirectAdapter(deps: HomedirectAdapterDeps = {}): PortalAdapter {
  const env = () => deps.env ?? process.env;
  const d = { ...lazy, ...Object.fromEntries(Object.entries(deps).filter(([k, v]) => k in lazy && v)) } as typeof lazy;

  function keyFail(): PortalFail | null {
    return hasHomedirectKey(env()) ? null : { ok: false, code: "CONFIG_ERROR", message: HOMEDIRECT_KEY_MISSING_MESSAGE, detail: "homedirect_kind=not_configured", httpStatus: null };
  }

  async function upsert(ctx: PortalContext, ref: ListingRef, action: "publish" | "update"): Promise<PortalResult<ListingOutcome>> {
    const kf = keyFail();
    if (kf) return kf;
    const input = { organizationId: ctx.organizationId, propertyId: ref.propertyId };
    const built = await d.build(input);
    if (!built.ok) {
      return { ok: false, code: "VALIDATION_ERROR", message: `Anunțul nu poate fi trimis la HomeDirect: ${built.reasons.join(" ")}`, detail: "homedirect_not_eligible", httpStatus: null };
    }
    if (!ctx.allowLiveRequests) {
      return { ok: true, data: { externalId: built.bodies.map((b) => b.externalPostId).join(","), live: false, detail: `homedirect_dry_run action=${action} listings=${built.bodies.length}`, message: "Trimiterile reale către HomeDirect sunt oprite: anunțul a fost doar validat local." } };
    }

    const stored = await d.loadStored(input).catch(() => [] as HomedirectStored[]);
    const prints = await d.loadFingerprints(ctx.organizationId, built.agent.userId).catch(() => ({ agency: null, agent: null }));
    await refreshHomedirectAccounts({
      organizationId: ctx.organizationId,
      agency: { ...built.agency, previous: prints.agency },
      agent: { ...built.agent, previous: prints.agent },
    }, deps);

    const result = await upsertHomedirectBodies(built.bodies, stored, deps);
    if (!result.ok) {
      await d.save(input, result.done.map((w) => w.state)).catch(() => undefined);
      const done = result.done.map((w) => TX[w.state.transaction]).join(", ");
      const prefix = done ? `Anunțul de ${done} a fost trimis, dar următorul a eșuat. ` : "";
      const fail = homedirectToPortalFail(result.fail, prefix);
      return result.agencyLink ? { ...fail, message: `${fail.message} ${HOMEDIRECT_AGENCY_LINK_HINT}`, detail: `${fail.detail} agency_link` } : fail;
    }
    const states = result.results.map((w) => w.state);

    // Tranzacție dezactivată → `inactive` pe codul ei.
    const sent = new Set(built.bodies.map((b) => b.externalPostId));
    const stale = stored.filter((s) => !sent.has(s.external_id) && s.status === "active" && s.homedirect_id);
    let staleNote = "";
    if (stale.length) {
      const r = await setHomedirectStatus(stale.map((s) => ({ state: s, status: "inactive" as const })), deps);
      if (r.ok) { states.push(...r.changed); staleNote = ` Dezactivat pe HomeDirect: ${stale.map((s) => s.external_id).join(", ")}.`; }
    }
    await d.save(input, states).catch(() => undefined);
    await d.saveFingerprints(ctx.organizationId, built.agent.userId, built.agency.fingerprint, built.agent.fingerprint).catch(() => undefined);

    const offers: PortalOffer[] = result.results
      .filter((w) => w.state.url)
      .map((w) => ({ transaction: w.state.transaction, reference: w.state.external_id, id: w.state.short_id ?? w.state.homedirect_id ?? w.state.external_id, url: w.state.url! }));
    const label = { created: "publicat", updated: "actualizat", existing: "actualizat", reactivated: "republicat", recreated: "republicat (fusese șters la HomeDirect)" } as const;
    const parts = result.results.map((w) => (built.bodies.length > 1 ? `${TX[w.state.transaction]}: ${label[w.action]}` : label[w.action]));
    const message = `HomeDirect: ${parts.join(", ")}.${built.warnings.length ? ` ${built.warnings.join(" ")}` : ""}${staleNote}`;
    return {
      ok: true,
      data: {
        externalId: built.bodies.map((b) => b.externalPostId).join(","),
        live: true,
        processed: result.results.length,
        detail: `homedirect_${action} results=${result.results.map((w) => `${w.state.external_id}:${w.action}`).join(",")}`,
        message,
        portalStatus: "published",
        ...(offers[0] ? { publicUrl: offers[0].url, offers } : {}),
        httpStatus: result.results.at(-1)?.httpStatus ?? null,
        portalResponse: states,
      },
    };
  }

  return {
    id: "homedirect",
    async testConnection(): Promise<PortalResult<ConnectionStatusOutcome>> {
      const result = await getHomedirectStats(deps);
      if (!result.ok) return homedirectToPortalFail(result);
      return { ok: true, data: { configured: true, live: true, detail: describeHomedirectStats(result.data, result.environment), portalResponse: result.data } };
    },
    async getStatus(): Promise<PortalResult<ConnectionStatusOutcome>> {
      if (!hasHomedirectKey(env())) return { ok: true, data: { configured: false, live: false, detail: HOMEDIRECT_KEY_MISSING_MESSAGE } };
      const base = resolveHomedirectBaseUrl(env()["HOMEDIRECT_API_BASE_URL"]);
      if (!base.ok) return { ok: true, data: { configured: false, live: false, detail: base.message } };
      return { ok: true, data: { configured: true, live: true, detail: `homedirect env=${base.environment}` } };
    },
    publishListing(ctx, ref) {
      return upsert(ctx, ref, "publish");
    },
    updateListing(ctx, ref) {
      return upsert(ctx, ref, "update");
    },
    async withdrawListing(ctx, ref): Promise<PortalResult<ListingOutcome>> {
      const kf = keyFail();
      if (kf) return kf;
      const input = { organizationId: ctx.organizationId, propertyId: ref.propertyId };
      const [stored, property] = await Promise.all([
        d.loadStored(input).catch(() => [] as HomedirectStored[]),
        d.propertyState(input).catch(() => null),
      ]);
      const plan = homedirectWithdrawPlan(property, stored);
      const count = plan.mode === "delete" ? plan.states.length : plan.targets.length;
      if (count === 0) {
        return { ok: true, data: { externalId: ref.externalId, live: false, detail: "homedirect_withdraw skipped", message: "Anunțul nu este activ pe HomeDirect.", portalStatus: "withdrawn" } };
      }
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { externalId: ref.externalId, live: false, detail: `homedirect_dry_run action=withdraw mode=${plan.mode}`, message: "Verificat local: retragerea ar schimba statusul anunțului pe HomeDirect." } };
      }
      if (plan.mode === "delete") {
        const r = await deleteHomedirect(plan.states, deps);
        if (!r.ok) return homedirectToPortalFail(r.fail);
        await d.save(input, r.deleted).catch(() => undefined);
        return { ok: true, data: { externalId: ref.externalId, live: true, processed: r.deleted.length, portalStatus: "withdrawn", detail: `homedirect_delete ids=${r.deleted.map((s) => s.external_id).join(",")}`, message: "Proprietatea a fost ștearsă în Habitoo: anunțul a fost șters definitiv de pe HomeDirect." } };
      }
      const r = await setHomedirectStatus(plan.targets, deps);
      if (!r.ok) return homedirectToPortalFail(r.fail);
      await d.save(input, r.changed).catch(() => undefined);
      const parts = r.changed.map((s) => `${TX[s.transaction]}: ${HOMEDIRECT_STATUS_LABEL[s.status]}`);
      return { ok: true, data: { externalId: ref.externalId, live: true, processed: r.changed.length, portalStatus: "withdrawn", detail: `homedirect_status ${r.changed.map((s) => `${s.external_id}:${s.status}`).join(",")}`, message: `HomeDirect: ${parts.join(", ")}. Anunțul poate fi republicat oricând.` } };
    },
    async sync() {
      return notSupported("sync");
    },
  };
}

export const homedirectAdapter = createHomedirectAdapter();
