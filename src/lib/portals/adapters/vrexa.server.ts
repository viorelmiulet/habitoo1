/** Adaptor Vrexa.ro: test conexiune, publicare/actualizare/retragere prin coada existentă. */
import { notSupported, type PortalAdapter, type PortalContext, type PortalResult, type PortalFail, type ConnectionStatusOutcome, type ListingOutcome, type ListingRef } from "../adapter";
import { vrexaBaseUrl, vrexaConnectionEnv, vrexaEnvLabel, VREXA_NO_PRODUCTION_URL, type VrexaEnv } from "../vrexa/config";
import { vrexaRequest, type VrexaCredentials, type VrexaResult, type VrexaTransport } from "../vrexa/client";
import { publishVrexa, vrexaListingState, VrexaPublishError, vrexaOfferEnv, withdrawVrexa, type VrexaOffer, type VrexaPublishClient, type VrexaRemote } from "../vrexa/publish";
import type { VrexaListingData } from "../vrexa/listing.server";

type Fail = PortalFail;
type Env = Record<string, string | undefined>;

export function vrexaCredentialsFrom(parts: { organizationId: string; clientId: string | null; clientSecret: string | null; settings: unknown }, env: Env): VrexaCredentials | Fail {
  const mode = vrexaConnectionEnv(parts.settings, env);
  const baseUrl = vrexaBaseUrl(mode, env);
  if (!baseUrl) return { ok: false, code: "CONFIG_ERROR", message: VREXA_NO_PRODUCTION_URL, detail: "vrexa_no_production_url", httpStatus: null };
  const clientId = (parts.clientId ?? "").trim();
  const clientSecret = (parts.clientSecret ?? "").trim();
  if (!clientId || !clientSecret) return { ok: false, code: "CONFIG_ERROR", message: "Lipsesc client id sau client secret Vrexa ale agenției.", detail: "vrexa_no_credentials", httpStatus: null };
  return { organizationId: parts.organizationId, env: mode, baseUrl, clientId, clientSecret };
}

export function vrexaCredentials(ctx: PortalContext, env: Env): VrexaCredentials | Fail {
  return vrexaCredentialsFrom({ organizationId: ctx.organizationId, clientId: ctx.externalAccountId, clientSecret: ctx.portalCredential, settings: ctx.settings }, env);
}

const enc = (id: string) => encodeURIComponent(id);
export function vrexaPublishClient(c: VrexaCredentials, transport?: VrexaTransport): VrexaPublishClient {
  const deps = transport ? { transport } : {};
  return {
    put: (id, body) => vrexaRequest<VrexaRemote>(c, "PUT", `/partner/v1/listings/${enc(id)}`, body, deps),
    get: (id) => vrexaRequest<VrexaRemote>(c, "GET", `/partner/v1/listings/${enc(id)}`, undefined, deps),
    del: (id) => vrexaRequest(c, "DELETE", `/partner/v1/listings/${enc(id)}`, undefined, deps),
  };
}

export function vrexaClientFromParts(parts: { organizationId: string; clientId: string; clientSecret: string; settings: unknown }, env: Env): { client: VrexaPublishClient; env: VrexaEnv } | null {
  const c = vrexaCredentialsFrom(parts, env);
  return "ok" in c ? null : { client: vrexaPublishClient(c), env: c.env };
}

function toFail(e: unknown): Fail {
  if (e instanceof VrexaPublishError) {
    const r = e.result;
    const code = r.kind === "rate_limited" ? "RATE_LIMIT" : r.kind === "network" ? "NETWORK_ERROR" : r.kind === "auth" || r.kind === "agency_inactive" ? "AUTH_ERROR"
      : r.kind === "validation" ? "VALIDATION_ERROR" : r.status !== null && r.status >= 500 ? "PORTAL_ERROR" : "INVALID_REQUEST";
    return { ok: false, code, message: e.message, detail: `vrexa_kind=${r.kind} code=${r.problem.code ?? "-"}`, httpStatus: r.status, ...(r.retryAfterMs ? { retryAfterMs: r.retryAfterMs } : {}) };
  }
  return { ok: false, code: "PORTAL_ERROR", message: e instanceof Error ? e.message : "Eroare Vrexa.", detail: "vrexa_exception", httpStatus: null };
}

export type VrexaAdapterDeps = {
  transport?: VrexaTransport;
  env?: () => Env;
  load?: (organizationId: string, propertyId: string, opts: { withdraw: boolean }) => Promise<VrexaListingData>;
  onRejected?: (organizationId: string, propertyId: string, offers: VrexaOffer[]) => Promise<void>;
  now?: () => number;
};

export function createVrexaAdapter(opts: VrexaAdapterDeps = {}): PortalAdapter {
  const env = opts.env ?? (() => process.env);
  const load = opts.load ?? (async (o: string, p: string, x: { withdraw: boolean }) => (await import("../vrexa/listing.server")).loadVrexaListing(o, p, x));
  const onRejected = opts.onRejected ?? (async (o: string, p: string, offers: VrexaOffer[]) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { handleVrexaRejections } = await import("../vrexa/status.server");
    await handleVrexaRejections(supabaseAdmin, o, p, offers);
  });
  const nowIso = () => new Date((opts.now ?? Date.now)()).toISOString();

  function outcome(offers: VrexaOffer[], all: VrexaOffer[], env: VrexaEnv, detail: string, warnings: string[]): ListingOutcome {
    const mine = all.filter((o) => vrexaOfferEnv(o) === env);
    const st = vrexaListingState(mine);
    const imageWarnings = mine.map((o) => o.image_warning).filter((x): x is string => !!x);
    const mediaWarning = [...warnings, ...imageWarnings].join(" · ") || null;
    return {
      externalId: mine.filter((o) => o.status !== "deleted").map((o) => o.external_id).join(",") || null,
      live: true, processed: offers.length, detail, portalStatus: st.status,
      message: st.status === "error" ? st.message! : st.status === "pending" ? "Anunțul a ajuns la Vrexa și este în verificare." : st.status === "published" ? "Anunțul este publicat pe Vrexa." : "Anunțul este oprit pe Vrexa.",
      publicUrl: st.publicUrl, offers: offers as never, mediaWarning,
    };
  }

  async function upsert(ctx: PortalContext, ref: ListingRef, action: "publish" | "update"): Promise<PortalResult<ListingOutcome>> {
    const c = vrexaCredentials(ctx, env());
    if ("ok" in c) return c;
    try {
      const data = await load(ctx.organizationId, ref.propertyId, { withdraw: false });
      if (!data.mapping.ok) return { ok: false, code: "VALIDATION_ERROR", message: `Anunțul nu poate fi trimis la Vrexa: ${data.mapping.reasons.join(" ")}`, detail: "vrexa_mapping_errors" };
      if (!ctx.allowLiveRequests) return { ok: true, data: { externalId: null, live: false, processed: 0, detail: `vrexa_dry_run action=${action} listings=${data.mapping.listings.length} images=${data.images.length}`, message: `Trimiterile reale către Vrexa sunt oprite. S-ar trimite ${data.mapping.listings.length} anunțuri cu ${data.images.length} poze.` } };
      const r = await publishVrexa({ listings: data.mapping.listings, stored: data.stored, reference: data.reference, propertyId: ref.propertyId, images: data.images, env: c.env, client: vrexaPublishClient(c, opts.transport), nowIso: nowIso() });
      await onRejected(ctx.organizationId, ref.propertyId, r.offers);
      const others = data.stored.filter((o) => vrexaOfferEnv(o) !== c.env);
      return { ok: true, data: outcome(r.offers, [...others, ...r.offers], c.env, `vrexa_${action} env=${c.env} ${r.actions.join(" ")}`, [...data.mapping.warnings, ...data.imageWarnings]) };
    } catch (e) {
      return toFail(e);
    }
  }

  return {
    id: "vrexa",
    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const c = vrexaCredentials(ctx, env());
      if ("ok" in c) return c;
      if (!ctx.allowLiveRequests) return { ok: true, data: { configured: true, live: false, detail: `vrexa_dry_run env=${c.env}` } };
      const r: VrexaResult<{ totalCount?: number }> = await vrexaRequest<{ totalCount?: number }>(c, "GET", "/partner/v1/listings?pageSize=1", undefined, opts.transport ? { transport: opts.transport } : {});
      if (!r.ok) {
        return { ok: false, code: r.kind === "auth" || r.kind === "agency_inactive" ? "AUTH_ERROR" : r.kind === "rate_limited" ? "RATE_LIMIT" : "PORTAL_ERROR", message: r.message, detail: `vrexa_kind=${r.kind} code=${r.problem.code ?? "-"}${r.retryAt ? ` retry_at=${r.retryAt}` : ""}`, httpStatus: r.status };
      }
      const total = typeof r.data?.totalCount === "number" ? r.data.totalCount : 0;
      return { ok: true, data: { configured: true, live: true, detail: `Conectat la Vrexa (${vrexaEnvLabel(c.env)}). Anunțuri prin API: ${total}.` } };
    },
    async getStatus(ctx) {
      const c = vrexaCredentials(ctx, env());
      return { ok: true, data: { configured: !("ok" in c), live: false, detail: "ok" in c ? c.message : `vrexa configured env=${c.env}` } };
    },
    publishListing: (ctx, ref) => upsert(ctx, ref, "publish"),
    updateListing: (ctx, ref) => upsert(ctx, ref, "update"),
    async withdrawListing(ctx, ref) {
      const c = vrexaCredentials(ctx, env());
      if ("ok" in c) return c;
      try {
        const data = await load(ctx.organizationId, ref.propertyId, { withdraw: true });
        const active = data.stored.filter((o) => vrexaOfferEnv(o) === c.env && o.status !== "deleted");
        if (!active.length) return { ok: true, data: { externalId: null, live: false, processed: 0, portalStatus: "withdrawn", detail: "vrexa_withdraw nothing_stored", message: "Anunțul nu este publicat pe Vrexa." } };
        if (!ctx.allowLiveRequests) return { ok: true, data: { externalId: null, live: false, processed: 0, detail: `vrexa_withdraw_dry_run listings=${active.length}`, message: "Trimiterile reale către Vrexa sunt oprite; nimic nu a fost retras." } };
        const r = await withdrawVrexa(data.stored, c.env, vrexaPublishClient(c, opts.transport), nowIso());
        return { ok: true, data: { externalId: null, live: true, processed: r.offers.length, portalStatus: "withdrawn", detail: `vrexa_withdraw reason=${ref.withdrawReason ?? "user"} ${r.actions.join(" ")}`, message: "Anunțul a fost retras de pe Vrexa.", publicUrl: null, offers: r.offers as never } };
      } catch (e) {
        return toFail(e);
      }
    },
    sync: async () => notSupported("sync"),
  };
}

export const vrexaAdapter = createVrexaAdapter();
