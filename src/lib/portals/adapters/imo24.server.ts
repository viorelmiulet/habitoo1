/**
 * Adaptor imo24.ro: test conexiune (`GET /me`), publicare/actualizare
 * (`PUT /anunturi/by-external/{external_id}`, câte un corp pe tranzacție) și
 * retragere (`DELETE /anunturi/by-external/{external_id}`).
 * Fără credite și fără promovare: `/credite` nu se folosește.
 */
import type {
  ConnectionStatusOutcome,
  ListingOutcome,
  ListingRef,
  PortalAdapter,
  PortalContext,
  PortalFail,
  PortalResult,
} from "../adapter";
import { notSupported } from "../adapter";
import type { PortalErrorCode } from "../errors";
import { IMO24_BASE_URL, describeImo24Account, getImo24Account, type Imo24CallFail, type Imo24Deps } from "../imo24/client";
import { IMO24_KEY_FORMAT_MESSAGE, isValidImo24Key, normalizeImo24Key } from "../imo24/key";
import type { Imo24Anunt } from "../imo24/mapper";
import {
  IMO24_IMAGE_RETRY_DELAY_MS,
  IMO24_IMAGE_RETRY_MAX,
  IMO24_RESULT_LABEL,
  resolveImo24Agent,
  splitExternalIds,
  upsertImo24Bodies,
  withdrawImo24,
} from "../imo24/publish";
import { safePortalUrl } from "../public-links";
import type { PortalOffer } from "../imobiliare/offer-links";

const FAIL_CODE: Record<Imo24CallFail["kind"], PortalErrorCode> = {
  invalid_key_format: "CONFIG_ERROR",
  unauthorized: "AUTH_ERROR",
  auth_cooldown: "AUTH_ERROR",
  forbidden_scope: "AUTH_ERROR",
  rate_limited: "RATE_LIMIT",
  package_limit: "INVALID_REQUEST",
  package_inactive: "INVALID_REQUEST",
  duplicate: "INVALID_REQUEST",
  immutable_field: "INVALID_REQUEST",
  validation: "VALIDATION_ERROR",
  not_found: "NOT_FOUND",
  client_error: "INVALID_REQUEST",
  server_error: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
  blocked_redirect: "CONFIG_ERROR",
};

export function imo24ToPortalFail(failure: Imo24CallFail, prefix = ""): PortalFail {
  return {
    ok: false,
    code: FAIL_CODE[failure.kind],
    message: `${prefix}${failure.message}`,
    detail: `imo24_kind=${failure.kind}${failure.code ? ` code=${failure.code}` : ""}${failure.requestId ? ` request_id=${failure.requestId}` : ""}`,
    httpStatus: failure.status,
    portalResponse: failure.body,
    retryAfterMs: failure.retryAfterMs,
  };
}

function apiKeyOf(ctx: PortalContext): string | PortalFail {
  const key = normalizeImo24Key(ctx.portalCredential);
  if (!key) {
    return { ok: false, code: "CONFIG_ERROR", message: "Lipsește cheia imo24.ro a agenției.", detail: null, httpStatus: null };
  }
  if (!isValidImo24Key(key)) {
    return { ok: false, code: "CONFIG_ERROR", message: IMO24_KEY_FORMAT_MESSAGE, detail: null, httpStatus: null };
  }
  return key;
}

export type Imo24AdapterDeps = Imo24Deps & {
  build?: (
    apiKey: string,
    ctx: PortalContext,
    ref: ListingRef,
  ) => Promise<
    | { ok: true; bodies: Imo24Anunt[]; warnings: string[]; images: string[]; agentEmail: string | null }
    | { ok: false; reasons: string[] }
  >;
  candidateExternalIds?: (ctx: PortalContext, ref: ListingRef) => Promise<string[]>;
  /** Reprogramează un PUT (imagini amânate); întoarce numărul încercării sau 0 dacă s-a atins limita. */
  scheduleImageRetry?: (ctx: PortalContext, ref: ListingRef) => Promise<number>;
  resetImageRetry?: (ctx: PortalContext, ref: ListingRef) => Promise<void>;
};

const TX_LABEL = { vanzare: "vânzare", inchiriere: "închiriere" } as const;

const defaultBuild: NonNullable<Imo24AdapterDeps["build"]> = async (apiKey, ctx, ref) => {
  const { buildImo24Bodies } = await import("../imo24/load.server");
  return buildImo24Bodies(apiKey, { organizationId: ctx.organizationId, propertyId: ref.propertyId });
};
const defaultCandidates: NonNullable<Imo24AdapterDeps["candidateExternalIds"]> = async (ctx, ref) => {
  const { imo24CandidateExternalIds } = await import("../imo24/load.server");
  return imo24CandidateExternalIds({ organizationId: ctx.organizationId, propertyId: ref.propertyId });
};
const defaultSchedule: NonNullable<Imo24AdapterDeps["scheduleImageRetry"]> = async (ctx, ref) => {
  if (!ref.actorId) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("schedule_imo24_image_retry" as never, {
    _org: ctx.organizationId,
    _property: ref.propertyId,
    _actor: ref.actorId,
    _max: IMO24_IMAGE_RETRY_MAX,
    _delay_seconds: Math.round(IMO24_IMAGE_RETRY_DELAY_MS / 1000),
  } as never);
  if (error) return 0;
  return Number(data) || 0;
};
const defaultReset: NonNullable<Imo24AdapterDeps["resetImageRetry"]> = async (ctx, ref) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("imo24_image_retries" as never).delete()
    .eq("property_id", ref.propertyId).eq("organization_id", ctx.organizationId);
};

export function createImo24Adapter(deps: Imo24AdapterDeps = {}): PortalAdapter {
  const build = deps.build ?? defaultBuild;
  const candidates = deps.candidateExternalIds ?? defaultCandidates;
  const schedule = deps.scheduleImageRetry ?? defaultSchedule;
  const reset = deps.resetImageRetry ?? defaultReset;

  async function upsert(ctx: PortalContext, ref: ListingRef, action: "publish" | "update"): Promise<PortalResult<ListingOutcome>> {
    const key = apiKeyOf(ctx);
    if (typeof key !== "string") return key;
    const built = await build(key, ctx, ref);
    if (!built.ok) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `Anunțul nu poate fi trimis la imo24.ro: ${built.reasons.join(" ")}`,
        detail: "imo24_not_eligible",
        httpStatus: null,
      };
    }
    if (!ctx.allowLiveRequests) {
      return {
        ok: true,
        data: {
          externalId: built.bodies.map((b) => b.external_id).join(","),
          live: false,
          detail: `imo24_dry_run action=${action} listings=${built.bodies.length} images=${built.images.length}`,
          message: "Trimiterile reale către imo24.ro sunt oprite: anunțul a fost doar validat local.",
        },
      };
    }

    const agent = await resolveImo24Agent(key, built.agentEmail, deps);
    const bodies = built.bodies.map((b) => ({ ...b, imagini: built.images, agent }));
    const result = await upsertImo24Bodies(key, bodies, splitExternalIds(ref.externalId), deps);
    if (!result.ok) {
      const done = result.done.map((d) => TX_LABEL[d.body.tranzactie]).join(", ");
      const prefix = result.recreatedFailed
        ? "S-a schimbat tranzacția, categoria sau numărul de camere: anunțul vechi a fost dezactivat, dar cel nou nu a putut fi publicat. "
        : done
          ? `Anunțul de ${done} a fost trimis, dar următorul a eșuat. `
          : "";
      return imo24ToPortalFail(result.fail, prefix);
    }

    const offers: PortalOffer[] = [];
    const parts: string[] = [];
    for (const r of result.results) {
      const url = safePortalUrl(r.written.url, "imo24.ro");
      if (url) {
        offers.push({
          transaction: r.body.tranzactie === "vanzare" ? "sale" : "rent",
          reference: r.body.external_id,
          id: String(r.written.id ?? r.written.cod ?? r.body.external_id),
          url,
        });
      }
      const label = r.written.rezultat ? IMO24_RESULT_LABEL[r.written.rezultat] : r.status === 201 ? "publicat" : "actualizat";
      parts.push(bodies.length > 1 ? `${TX_LABEL[r.body.tranzactie]}: ${label}` : label);
    }
    const notes: string[] = [];
    if (result.results.some((r) => r.recreated)) {
      notes.push("S-a schimbat tranzacția, categoria sau numărul de camere: anunțul vechi a fost dezactivat și a fost publicat unul nou.");
    }
    if (result.staleWithdrawn.length > 0) notes.push(`Dezactivat pe imo24.ro: ${result.staleWithdrawn.join(", ")}.`);
    if (result.imagesDeferred) {
      const attempt = await schedule(ctx, ref).catch(() => 0);
      notes.push(
        attempt > 0
          ? `imo24.ro preia pozele mai târziu; Habitoo retrimite anunțul peste 10 minute (încercarea ${attempt} din ${IMO24_IMAGE_RETRY_MAX}).`
          : `imo24.ro nu a preluat încă toate pozele după ${IMO24_IMAGE_RETRY_MAX} retrimiteri; apasă din nou „Actualizează” mai târziu.`,
      );
    } else {
      await reset(ctx, ref).catch(() => undefined);
    }
    const info = [...built.warnings, ...result.warnings, ...notes];
    const message = `imo24.ro: ${parts.join(", ")}.${info.length ? ` ${info.join(" ")}` : ""}`;

    return {
      ok: true,
      data: {
        externalId: bodies.map((b) => b.external_id).join(","),
        live: true,
        processed: result.results.length,
        detail: `imo24_${action} results=${result.results.map((r) => `${r.body.external_id}:${r.written.rezultat ?? r.status}`).join(",")}${result.imagesDeferred ? " images_deferred" : ""}`,
        message,
        portalStatus: "published",
        ...(offers[0] ? { publicUrl: offers[0].url, offers } : {}),
        httpStatus: result.results.at(-1)?.status ?? null,
        portalResponse: result.results.map((r) => r.written),
      },
    };
  }

  return {
    id: "imo24",
    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const key = apiKeyOf(ctx);
      if (typeof key !== "string") return key;
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { configured: true, live: false, detail: "imo24_dry_run action=test_connection" } };
      }
      const result = await getImo24Account(key, deps);
      if (!result.ok) return imo24ToPortalFail(result);
      const { ok, summary } = describeImo24Account(result.data);
      if (!ok) {
        return { ok: false, code: "AUTH_ERROR", message: summary, detail: "imo24_scope_missing=scriere", httpStatus: result.status };
      }
      return { ok: true, data: { configured: true, live: true, detail: summary } };
    },

    async getStatus(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const key = apiKeyOf(ctx);
      if (typeof key !== "string") return { ok: true, data: { configured: false, live: false, detail: key.message } };
      return { ok: true, data: { configured: true, live: ctx.allowLiveRequests, detail: `imo24 base=${IMO24_BASE_URL}` } };
    },

    publishListing(ctx, ref) {
      return upsert(ctx, ref, "publish");
    },
    updateListing(ctx, ref) {
      return upsert(ctx, ref, "update");
    },

    async withdrawListing(ctx, ref): Promise<PortalResult<ListingOutcome>> {
      const key = apiKeyOf(ctx);
      if (typeof key !== "string") return key;
      const ids = [...new Set([...splitExternalIds(ref.externalId), ...(await candidates(ctx, ref).catch(() => []))])];
      if (ids.length === 0) {
        return { ok: true, data: { externalId: null, live: false, detail: "imo24_withdraw skipped", message: "Anunțul nu a fost publicat pe imo24.ro." } };
      }
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { externalId: ids.join(","), live: false, detail: `imo24_dry_run action=withdraw ids=${ids.join(",")}`, message: "Verificat local: retragerea ar dezactiva anunțul pe imo24.ro." } };
      }
      const result = await withdrawImo24(key, ids, deps);
      if (!result.ok) return imo24ToPortalFail(result.fail);
      await reset(ctx, ref).catch(() => undefined);
      return {
        ok: true,
        data: {
          externalId: ref.externalId ?? (result.withdrawn.join(",") || null),
          live: true,
          processed: result.withdrawn.length,
          detail: `imo24_withdraw withdrawn=${result.withdrawn.join(",") || "-"} missing=${result.missing.length}`,
          message: result.withdrawn.length
            ? "Anunțul a fost dezactivat pe imo24.ro."
            : "imo24.ro nu a găsit anunțul: nu mai era activ pe portal.",
        },
      };
    },

    async sync() {
      return notSupported("sync");
    },
  };
}

export const imo24Adapter = createImo24Adapter();
