/**
 * Adaptor HomeZZ.ro + Lajumate.ro: test conexiune (`details-agency`) și
 * publicare/actualizare/retragere per tranzacție (`homezz/publish.ts`).
 * Fără promovări. `key`/`token` nu apar în mesaje, detalii sau jurnal.
 */
import type { ConnectionStatusOutcome, PortalAdapter, PortalContext, PortalFail, PortalResult } from "../adapter";
import type { ListingOutcome, ListingRef } from "../adapter";
import { notSupported } from "../adapter";
import type { PortalErrorCode } from "../errors";
import { describeHomezzAgency, homezzPost, redactHomezz, type HomezzFailKind, type HomezzResult, type HomezzTransport } from "../homezz/client";
import { relayFetch } from "../relay.server";
import {
  HOMEZZ_AGENT_NOT_LINKED, HomezzPublishError, homezzPublicUrl, parseHomezzOffers, publishHomezz, withdrawHomezz,
  type HomezzOffer, type HomezzPublishClient,
} from "../homezz/publish";
import type { HomezzMapResult } from "../homezz/mapper";
import { homezzImageLogUrl } from "../homezz/images.server";

const FAIL_CODE: Record<HomezzFailKind, PortalErrorCode> = {
  action_error: "INVALID_REQUEST",
  forbidden: "AUTH_ERROR",
  redirect: "CONFIG_ERROR",
  server_error: "PORTAL_ERROR",
  http_error: "PORTAL_ERROR",
  invalid_response: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
};

export const homezzRelayTransport: HomezzTransport = (url, init) => relayFetch("homezz", url, init);

export type HomezzListingData = {
  mapping: HomezzMapResult;
  reference: string | null;
  assignedTo: string | null;
  /** `portal_agent_links.external_key` al agentului responsabil (email HomeZZ). */
  agentEmail: string | null;
  stored: HomezzOffer[];
  images: { ids: string[]; urls: string[]; warnings: string[] };
};
export type HomezzAdapterDeps = {
  load?: (organizationId: string, propertyId: string, opts: { withdraw: boolean }) => Promise<HomezzListingData>;
  /** Rulează o acțiune cu token-ul agentului cu acest email HomeZZ (reînnoit o dată la eroare de token). */
  withToken?: (organizationId: string, email: string, run: (token: string) => Promise<import("../homezz/client").HomezzResult>) => Promise<import("../homezz/client").HomezzResult>;
};

function publishFail(e: unknown): PortalFail {
  if (e instanceof HomezzPublishError) {
    const r = e.result;
    return { ok: false, code: FAIL_CODE[r.kind], message: r.message, detail: `homezz_action=${e.action} homezz_kind=${r.kind}`, httpStatus: r.status, portalResponse: { action: e.action, http_status: r.status, body: r.raw } };
  }
  return { ok: false, code: "PORTAL_ERROR", message: e instanceof Error ? e.message : "Publicarea pe HomeZZ nu a putut fi finalizată.", detail: null };
}

export function createHomezzAdapter(transport: HomezzTransport = homezzRelayTransport, deps: HomezzAdapterDeps = {}): PortalAdapter {
  const load = deps.load ?? (async (o: string, p: string, opts: { withdraw: boolean }) => (await import("../homezz/listing.server")).loadHomezzListing(o, p, opts));
  const withToken = deps.withToken ?? (async (o: string, email: string, run: (t: string) => Promise<import("../homezz/client").HomezzResult>) => {
    const a = await import("../homezz/agents.server");
    return a.withHomezzEmailToken(o, email, await a.homezzAgentDeps(), run);
  });
  const clientFor = (ctx: PortalContext, key: string, defaultEmail: string | null): HomezzPublishClient => ({
    agency: (action, params) => homezzPost(action, { key, ...params }, transport),
    agent: (action, params, email) => {
      const who = (email ?? defaultEmail ?? "").trim().toLowerCase();
      if (!who) throw new Error(HOMEZZ_AGENT_NOT_LINKED);
      return withToken(ctx.organizationId, who, (token) => homezzPost(action, { token, ...params }, transport));
    },
  });

  async function upsert(ctx: PortalContext, ref: ListingRef, action: "publish" | "update"): Promise<PortalResult<ListingOutcome>> {
    const responses: { action: string; http_status: number | null; body: string; photos_sent: number; photo_urls: string[] }[] = [];
    const imageSecrets: string[] = [];
    try {
      const key = (ctx.portalCredential ?? "").trim();
      if (!key) return { ok: false, code: "CONFIG_ERROR", message: "Lipsește cheia API HomeZZ.ro a agenției.", detail: "homezz_no_key" };
      const data = await load(ctx.organizationId, ref.propertyId, { withdraw: false });
      if (!data.mapping.ok) return { ok: false, code: "VALIDATION_ERROR", message: `Anunțul nu poate fi trimis la HomeZZ: ${data.mapping.reasons.join(" ")}`, detail: "homezz_mapping_errors" };
      if (!data.assignedTo || !data.agentEmail) return { ok: false, code: "VALIDATION_ERROR", message: HOMEZZ_AGENT_NOT_LINKED, detail: "homezz_agent_not_linked" };
      const ads = data.mapping.ads;
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { externalId: null, live: false, processed: 0, detail: `homezz_dry_run action=${action} ads=${ads.length} images=${data.images.urls.length}`, message: `Trimiterile reale către HomeZZ sunt oprite. S-ar trimite ${ads.length} anunțuri cu ${data.images.urls.length} poze.` } };
      }
      const baseClient = clientFor(ctx, key, data.agentEmail);
      for (const raw of data.images.urls) {
        try { for (const [name, value] of new URL(raw).searchParams) if (/token|signature|key/i.test(name)) imageSecrets.push(value); } catch { /* no capability */ }
      }
      const record = async (step: string, params: Record<string, import("../homezz/client").HomezzValue>, request: Promise<HomezzResult>) => {
        const result = await request;
        const photos = Array.isArray(params["images"]) ? params["images"].filter((v): v is string => typeof v === "string") : [];
        const body = redactHomezz(result.raw, [key, ...imageSecrets]);
        responses.push({ action: step, http_status: result.status, body, photos_sent: photos.length, photo_urls: photos.slice(0, 3).map(homezzImageLogUrl) });
        return result.ok ? { ...result, raw: body } : { ...result, raw: body, message: redactHomezz(result.message, imageSecrets), adError: result.adError ? redactHomezz(result.adError, imageSecrets) : null };
      };
      const client: HomezzPublishClient = {
        agency: (step, params) => record(step, params, baseClient.agency(step, params)),
        agent: (step, params, email) => record(step, params, baseClient.agent(step, params, email)),
      };
      const r = await publishHomezz({ ads, stored: data.stored, reference: data.reference, agentEmail: data.agentEmail, images: data.images, client });
      const warnings = [...data.mapping.warnings, ...data.images.warnings];
      const active = r.offers.filter((o) => !o.deleted);
      return { ok: true, data: {
        externalId: active.map((o) => o.homezz_id ?? o.internal_id).join(",") || null,
        live: true, processed: active.length,
        detail: `homezz_${action} ${r.actions.join(" ")}`,
        httpStatus: responses.at(-1)?.http_status ?? null,
        portalResponse: { actions: responses.map((response) => response.action), responses },
        message: "Anunțul a fost trimis la HomeZZ.",
        publicUrl: homezzPublicUrl(r.offers),
        offers: r.offers,
        mediaWarning: warnings.length ? warnings.join(" · ") : null,
      } };
    } catch (e) {
      const failure = publishFail(e);
      const fail = { ...failure, message: redactHomezz(failure.message, imageSecrets) };
      if (!responses.length) return fail;
      return { ...fail, detail: `${fail.detail ?? ""} actions=${responses.map((response) => response.action).join(" ")}`, portalResponse: { actions: responses.map((response) => response.action), responses } };
    }
  }

  const keyOf = (ctx: PortalContext): string | PortalFail => {
    const key = (ctx.portalCredential ?? "").trim();
    return key || { ok: false, code: "CONFIG_ERROR", message: "Lipsește cheia API HomeZZ.ro a agenției.", detail: null, httpStatus: null };
  };
  return {
    id: "homezz",
    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const key = keyOf(ctx);
      if (typeof key !== "string") return key;
      if (!ctx.allowLiveRequests) return { ok: true, data: { configured: true, live: false, detail: "homezz_dry_run action=details-agency" } };
      const result = await homezzPost("details-agency", { key }, transport);
      const portalResponse = { action: "details-agency", http_status: result.status, body: result.raw };
      if (!result.ok) {
        return { ok: false, code: FAIL_CODE[result.kind], message: result.message, detail: `homezz_kind=${result.kind}`, httpStatus: result.status, portalResponse };
      }
      return { ok: true, data: { configured: true, live: true, detail: describeHomezzAgency(result.data), portalResponse } };
    },
    async getStatus(ctx) {
      const key = keyOf(ctx);
      return { ok: true, data: { configured: typeof key === "string", live: false, detail: typeof key === "string" ? "homezz configured" : key.message } };
    },
    publishListing: (ctx, ref) => upsert(ctx, ref, "publish"),
    updateListing: (ctx, ref) => upsert(ctx, ref, "update"),
    async withdrawListing(ctx, ref) {
      try {
        const data = await load(ctx.organizationId, ref.propertyId, { withdraw: true });
        const active = data.stored.filter((o) => !o.deleted);
        if (!active.length) return { ok: true, data: { externalId: null, live: false, processed: 0, portalStatus: "withdrawn", detail: "homezz_withdraw nothing_stored", message: "Anunțul nu este publicat pe HomeZZ." } };
        const key = (ctx.portalCredential ?? "").trim();
        if (!key) return { ok: false, code: "CONFIG_ERROR", message: "Lipsește cheia API HomeZZ.ro a agenției.", detail: "homezz_no_key" };
        // Retragerea folosește agentul salvat pe ofertă; agentul curent neactivat nu o blochează.
        if (active.some((o) => !o.agent_email) && !data.agentEmail) return { ok: false, code: "VALIDATION_ERROR", message: HOMEZZ_AGENT_NOT_LINKED, detail: "homezz_agent_not_linked" };
        if (!ctx.allowLiveRequests) return { ok: true, data: { externalId: null, live: false, processed: 0, detail: `homezz_withdraw_dry_run ads=${active.length}`, message: "Trimiterile reale către HomeZZ sunt oprite; nimic nu a fost retras." } };
        const r = await withdrawHomezz({ stored: data.stored, agentEmail: data.agentEmail, client: clientFor(ctx, key, data.agentEmail) });
        return { ok: true, data: {
          externalId: null, live: true, processed: active.length, portalStatus: "withdrawn",
          detail: `homezz_withdraw reason=${ref.withdrawReason ?? "user"} ${r.actions.join(" ")}`,
          message: "Anunțul a fost retras de pe HomeZZ.", publicUrl: null, offers: r.offers,
        } };
      } catch (e) {
        return publishFail(e);
      }
    },
    async sync() { return notSupported("sync"); },
  };
}

export const homezzAdapter = createHomezzAdapter();
