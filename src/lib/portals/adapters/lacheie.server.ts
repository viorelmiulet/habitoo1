/**
 * Adaptor La Cheie — API de publicare a ofertelor (portal publication only).
 *
 * Contract implementat conform documentației La Cheie v1 pentru furnizori CRM:
 *   GET    {base}/account                    verificarea conexiunii agenției
 *   GET    {base}/options|/counties|/cities  catalogul de id-uri (cheia CRM)
 *   GET    {base}/properties                 listare
 *   GET    {base}/properties/{external_id}   citire
 *   POST   {base}/properties                 creare (stare completă)
 *   PUT    {base}/properties/{external_id}   actualizare (stare completă, fără PATCH)
 *   DELETE {base}/properties/{external_id}   retragere
 *
 * Autentificare: `Authorization: Bearer <cheia unică de furnizor CRM>`, citită
 * din secretul de server. Agențiile nu primesc și nu văd această cheie; ele
 * sunt identificate prin `X-Agency-External-ID`, după activarea conexiunii.
 * Scrierile trimit `Content-Type: application/json` și `X-Source-Version`
 * (text zecimal, separat per external_id de ofertă).
 *
 * La Cheie are un singur mediu real: production. Adresa API este fixată
 * server-side; scrierile reale rămân în spatele fluxului normal de publicare
 * cu aprobare. Nu există lead import, bulk import, pull periodic sau
 * webhook-uri în această etapă.
 */

import type {
  ConnectionStatusOutcome,
  ListingDiagnostics,
  ListingOutcome,
  ListingRef,
  PortalAdapter,
  PortalContext,
  PortalResult,
} from "../adapter";
import { toPortalError } from "../errors";
import {
  activeBaseUrl,
  laCheiePropertiesPath,
  readLaCheieSettings,
  type LaCheieSettings,
} from "../lacheie/config";
import { laCheieRequest, withLaCheieWriteLock } from "../lacheie/client.server";
import type { LaCheieRequestConfig } from "../lacheie/client.server";
import { readLaCheieCatalog, refreshLaCheieCatalog } from "../lacheie/catalog.server";
import { buildLaCheiePayload } from "../lacheie/payload.server";
import { laCheieExternalId, type LaCheieOffer, type LaCheieTransaction } from "../lacheie/mapper";
import {
  readVersionRecord,
  recordVersionOutcome,
  reserveNextVersion,
} from "../lacheie/version.server";
import { nextSourceVersion } from "../lacheie/version";
import { laCheieAgencyBlockReason, readLaCheieAgencyState } from "../lacheie/agency";
import { hasLaCheieCrmApiKey, laCheieCrmApiKey } from "../lacheie/credentials.server";


type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function settingsOf(ctx: PortalContext): LaCheieSettings {
  return readLaCheieSettings(ctx.settings as Record<string, unknown>);
}

type Ready =
  | { ok: true; config: LaCheieRequestConfig; settings: LaCheieSettings }
  | { ok: false; result: PortalFailShape };

type PortalFailShape = Extract<PortalResult<never>, { ok: false }>;

/**
 * Verifică o singură dată: cheia de furnizor CRM există server-side și agenția
 * are o conexiune activă (`external_id` + status `active`).
 */
function prepare(ctx: PortalContext): Ready {
  const settings = settingsOf(ctx);
  const agency = readLaCheieAgencyState(ctx.settings as Record<string, unknown>);
  let apiKey: string;
  try {
    apiKey = laCheieCrmApiKey();
  } catch (error) {
    const normalized = toPortalError(error);
    return {
      ok: false,
      result: {
        ok: false,
        code: "CONFIG_ERROR",
        message: normalized.message,
        detail: "missing_crm_api_key",
      },
    };
  }
  const blocked = laCheieAgencyBlockReason(agency);
  if (blocked || !agency.externalId) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "CONFIG_ERROR",
        message: blocked ?? "Conexiunea agenției la La Cheie nu este activă.",
        detail: `agency_${agency.status}`,
      },
    };
  }
  // Un singur mediu real (production), cu adresa API fixată server-side.
  const base = activeBaseUrl(settings);
  return {
    ok: true,
    settings,
    config: {
      baseUrl: base,
      apiKey,
      environment: settings.environment,
      agencyExternalId: agency.externalId,
      connectionKey: `${ctx.organizationId}:${settings.environment}`,
    },
  };
}


function failFrom(
  response: {
    status: number;
    body?: unknown;
    classification: { code: string; message: string } | null;
  },
  operation: string,
): PortalFailShape {
  const code = (response.classification?.code ?? "PORTAL_ERROR") as PortalFailShape["code"];
  return {
    ok: false,
    code,
    message: response.classification?.message ?? `La Cheie a răspuns HTTP ${response.status}.`,
    detail: `${operation} http_${response.status}`,
    httpStatus: response.status,
    portalResponse: response.body ?? null,
  };
}

/* ------------------------------ test connection --------------------------- */

async function status(
  ctx: PortalContext,
  live: boolean,
): Promise<PortalResult<ConnectionStatusOutcome>> {
  const settings = settingsOf(ctx);
  const agency = readLaCheieAgencyState(ctx.settings as Record<string, unknown>);
  if (!hasLaCheieCrmApiKey()) {
    return {
      ok: true,
      data: {
        configured: false,
        live: false,
        detail: "Cheia de furnizor La Cheie nu este configurată pe server.",
      },
    };
  }
  const blocked = laCheieAgencyBlockReason(agency);
  if (blocked) {
    return { ok: true, data: { configured: false, live: false, detail: blocked } };
  }
  // GET /account este read-only: testarea explicită a conexiunii de producție
  // nu depinde de comutatorul care permite scrierile reale.
  if (!live) {
    return {
      ok: true,
      data: {
        configured: true,
        live: false,
        detail: "Agenție activată la La Cheie; testează conexiunea pentru confirmare.",
      },
    };
  }


  const ready = prepare(ctx);
  if (!ready.ok) return ready.result;

  try {
    const response = await laCheieRequest(ready.config, { method: "GET", path: "/account" });
    if (!response.ok) return failFrom(response, "test_connection");
    const body = (response.body ?? {}) as Record<string, unknown>;
    const account = (body["account"] ?? body["data"] ?? body) as Record<string, unknown>;
    const name = typeof account["name"] === "string" ? account["name"] : null;
    return {
      ok: true,
      data: {
        configured: true,
        live: true,
        detail:
          `Cheie validă${name ? ` — cont ${name}` : ""}, mediu production.` +
          (ready.settings.catalogFetchedAt
            ? ` Catalog sincronizat la ${ready.settings.catalogFetchedAt}.`
            : " Catalogul nu este încă sincronizat."),
      },
    };
  } catch (error) {
    const normalized = toPortalError(error);
    return {
      ok: false,
      code: normalized.code,
      message: normalized.message,
      detail: normalized.detail,
    };
  }
}

/* --------------------------------- scriere -------------------------------- */

type WriteMode = "create" | "update";

async function sendOffer(input: {
  ctx: PortalContext;
  config: LaCheieRequestConfig;
  settings: LaCheieSettings;
  offer: LaCheieOffer;
  propertyId: string;
  mode: WriteMode;
}): Promise<
  | { ok: true; publicUrl: string | null; portalStatus: string | null; version: string }
  | { ok: false; fail: PortalFailShape }
> {
  const { ctx, config, settings, offer, propertyId, mode } = input;
  const db = await admin();
  const path = laCheiePropertiesPath();

  // O operație NOUĂ primește o versiune nouă; retry-urile din client refolosesc
  // exact aceeași versiune și același corp.
  let version = await reserveNextVersion(db, {
    organizationId: ctx.organizationId,
    propertyId,
    externalId: offer.external_id,
    environment: settings.environment,
    operation: mode,
  });

  // La PUT, `external_id` face parte din URL, iar corpul îl respinge explicit
  // („external_id: Unknown field."). Îl trimitem doar la POST (creare).
  const updateBody = (() => {
    const { external_id: _omit, ...rest } = offer as Record<string, unknown> & {
      external_id: string;
    };
    return rest;
  })();

  const attemptSend = async (sourceVersion: string) =>
    mode === "create"
      ? laCheieRequest(config, { method: "POST", path, body: offer, sourceVersion })
      : laCheieRequest(config, {
          method: "PUT",
          path: laCheiePropertiesPath(offer.external_id),
          body: updateBody,
          sourceVersion,
        });

  let response = await attemptSend(version);

  // PUT pe un external_id necunoscut: creăm anunțul, păstrând aceeași versiune.
  if (mode === "update" && response.status === 404) {
    response = await laCheieRequest(config, {
      method: "POST",
      path,
      body: offer,
      sourceVersion: version,
    });
  }

  // 409: nu incrementăm orb. Marcăm conflictul, reconciliem versiunea acceptată
  // și abia apoi generăm următoarea versiune, o singură dată.
  if (response.status === 409) {
    const accepted = response.conflict?.acceptedVersion ?? null;
    await recordVersionOutcome(db, {
      organizationId: ctx.organizationId,
      externalId: offer.external_id,
      environment: settings.environment,
      status: "conflict",
      error: response.classification?.message ?? "Conflict de versiune.",
      conflict: true,
      acceptedVersion: accepted,
    });
    if (!accepted) {
      return {
        ok: false,
        fail: {
          ok: false,
          code: "PORTAL_ERROR",
          message:
            "La Cheie a raportat un conflict de versiune fără să indice versiunea acceptată. Reia operația după verificarea anunțului pe portal.",
          detail: `${mode} http_409`,
        },
      };
    }
    const current = await readVersionRecord(db, {
      organizationId: ctx.organizationId,
      propertyId,
      externalId: offer.external_id,
      environment: settings.environment,
    });
    version = nextSourceVersion({
      current: current?.sourceVersion ?? version,
      accepted,
    });
    await db
      .from("portal_listing_versions")
      .update({ source_version: version, conflict: false })
      .eq("organization_id", ctx.organizationId)
      .eq("portal", "lacheie")
      .eq("external_id", offer.external_id)
      .eq("environment", settings.environment);
    response = await attemptSend(version);
  }

  if (!response.ok) {
    await recordVersionOutcome(db, {
      organizationId: ctx.organizationId,
      externalId: offer.external_id,
      environment: settings.environment,
      status: "error",
      error: response.classification?.message ?? `HTTP ${response.status}`,
    });
    return { ok: false, fail: failFrom(response, mode) };
  }

  await recordVersionOutcome(db, {
    organizationId: ctx.organizationId,
    externalId: offer.external_id,
    environment: settings.environment,
    status: mode === "create" ? "created" : "updated",
    error: null,
    acceptedVersion: version,
  });

  const body = (response.body ?? {}) as Record<string, unknown>;
  const echo = (body["offer"] ?? body["data"] ?? body) as Record<string, unknown>;
  const publicUrl =
    typeof echo["url"] === "string"
      ? echo["url"]
      : typeof echo["public_url"] === "string"
        ? (echo["public_url"] as string)
        : null;
  const portalStatus =
    typeof echo["status"] === "string"
      ? echo["status"]
      : typeof echo["state"] === "string"
        ? (echo["state"] as string)
        : null;
  return { ok: true, publicUrl, portalStatus, version };
}

async function push(
  ctx: PortalContext,
  ref: ListingRef,
  mode: WriteMode,
): Promise<PortalResult<ListingOutcome>> {
  const ready = prepare(ctx);
  if (!ready.ok) return ready.result;

  const db = await admin();
  let catalog = await readLaCheieCatalog(db, {
    organizationId: ctx.organizationId,
    environment: ready.settings.environment,
  });
  if (!catalog) {
    // Catalogul lipsește: îl sincronizăm automat prin GET-uri read-only.
    // Acest pas nu depinde de comutatorul pentru POST/PUT/DELETE reale.
    const refreshed = await refreshLaCheieCatalog(db, ready.config, {
      organizationId: ctx.organizationId,
      environment: ready.settings.environment,
      actorId: null,
    });
    if (refreshed.ok) catalog = refreshed.catalog;
    else
      return {
        ok: false,
        code: "CONFIG_ERROR",
        message: `Catalogul La Cheie nu a putut fi sincronizat automat: ${refreshed.message}`,
        detail: "missing_catalog",
      };
  }
  const build = await buildLaCheiePayload({
    organizationId: ctx.organizationId,
    propertyId: ref.propertyId,
    catalog,
  });
  if (!build.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Oferta nu poate fi trimisă la La Cheie: ${build.reasons.join(" ")}`,
      detail: `${mode} not_eligible`,
    };
  }

  if (!ctx.allowLiveRequests) {
    return {
      ok: true,
      data: {
        externalId: build.offers.map((entry) => entry.offer.external_id).join(","),
        live: false,
        processed: build.offers.length,
        detail: `dry_run ${mode} offers=${build.offers.length}`,
        message:
          `Verificat local: ${build.offers.length} anunț(uri) valide, ${build.offers[0]?.offer.images?.length ?? 0} imagini.` +
          (build.warnings.length ? ` ${build.warnings.join(" ")}` : ""),
      },
    };
  }

  const urls: string[] = [];
  const states: string[] = [];
  let processed = 0;

  try {
    for (const entry of build.offers) {
      // Scrierile pe același external_id sunt serializate: fără race conditions.
      const result = await withLaCheieWriteLock(
        `${ctx.organizationId}:${entry.offer.external_id}`,
        () =>
          sendOffer({
            ctx,
            config: ready.config,
            settings: ready.settings,
            offer: entry.offer,
            propertyId: ref.propertyId,
            mode,
          }),
      );
      if (!result.ok) return result.fail;
      processed += 1;
      if (result.publicUrl) urls.push(result.publicUrl);
      if (result.portalStatus) states.push(result.portalStatus);
    }
  } catch (error) {
    const normalized = toPortalError(error);
    return {
      ok: false,
      code: normalized.code,
      message: normalized.message,
      detail: normalized.detail,
    };
  }

  return {
    ok: true,
    data: {
      externalId: build.offers.map((entry) => entry.offer.external_id).join(","),
      live: true,
      processed,
      detail: `${mode} ok offers=${processed} env=${ready.settings.environment}`,
      message:
        `La Cheie a acceptat ${processed} anunț(uri).` +
        (build.warnings.length ? ` ${build.warnings.join(" ")}` : ""),
      ...(urls[0] ? { publicUrl: urls[0] } : {}),
      ...(states[0] ? { portalStatus: states[0] } : {}),
    },
  };
}

async function withdraw(
  ctx: PortalContext,
  ref: ListingRef,
): Promise<PortalResult<ListingOutcome>> {
  const ready = prepare(ctx);
  if (!ready.ok) return ready.result;

  const transactions: LaCheieTransaction[] = ["sale", "rent"];
  const ids = transactions.map((transaction) => laCheieExternalId(ref.propertyId, transaction));

  if (!ctx.allowLiveRequests) {
    return {
      ok: true,
      data: {
        externalId: ids.join(","),
        live: false,
        processed: ids.length,
        detail: `dry_run withdraw ${ids.join(",")}`,
        message: "Verificat local: retragerea ar șterge anunțurile de la La Cheie.",
      },
    };
  }

  const db = await admin();
  const removed: string[] = [];
  const missing: string[] = [];

  try {
    for (const id of ids) {
      const result = await withLaCheieWriteLock(`${ctx.organizationId}:${id}`, async () => {
        const version = await reserveNextVersion(db, {
          organizationId: ctx.organizationId,
          propertyId: ref.propertyId,
          externalId: id,
          environment: ready.settings.environment,
          operation: "withdraw",
        });
        return laCheieRequest(ready.config, {
          method: "DELETE",
          path: laCheiePropertiesPath(id),
          sourceVersion: version,
        });
      });
      if (result.ok) {
        removed.push(id);
        await recordVersionOutcome(db, {
          organizationId: ctx.organizationId,
          externalId: id,
          environment: ready.settings.environment,
          status: "withdrawn",
          error: null,
        });
        continue;
      }
      // 404 = anunțul nu există la portal, deci nu e nimic de retras.
      if (result.status === 404) {
        missing.push(id);
        continue;
      }
      return failFrom(result, "withdraw");
    }
  } catch (error) {
    const normalized = toPortalError(error);
    return {
      ok: false,
      code: normalized.code,
      message: normalized.message,
      detail: normalized.detail,
    };
  }

  return {
    ok: true,
    data: {
      externalId: (removed.length ? removed : ids).join(","),
      live: true,
      processed: removed.length,
      detail: `withdraw removed=${removed.length} missing=${missing.length}`,
      message: removed.length
        ? `La Cheie a retras ${removed.length} anunț(uri). La o nouă publicare se folosește o versiune mai mare, cu același identificator.`
        : "Oferta nu era publicată la La Cheie; nu a fost nimic de retras.",
    },
  };
}

export const lacheieAdapter: PortalAdapter = {
  id: "lacheie",

  async testConnection(ctx) {
    return status(ctx, true);
  },

  async getStatus(ctx) {
    return status(ctx, false);
  },

  async publishListing(ctx, ref) {
    return push(ctx, ref, "create");
  },

  async updateListing(ctx, ref) {
    return push(ctx, ref, "update");
  },

  async withdrawListing(ctx, ref) {
    return withdraw(ctx, ref);
  },

  async sync(ctx, refs) {
    let processed = 0;
    let failed = 0;
    for (const ref of refs) {
      const result = await push(ctx, ref, "update");
      if (result.ok) processed += 1;
      else failed += 1;
    }
    return { ok: true, data: { processed, failed } };
  },

  /** Diagnoză locală: exact ce ar refuza La Cheie, înainte de orice request. */
  async diagnoseListing(ctx, ref): Promise<PortalResult<ListingDiagnostics>> {
    const settings = settingsOf(ctx);
    const db = await admin();
    const catalog = await readLaCheieCatalog(db, {
      organizationId: ctx.organizationId,
      environment: settings.environment,
    });
    if (!catalog) {
      return {
        ok: true,
        data: {
          feedVisible: false,
          externalId: null,
          offerUrl: null,
          agentId: null,
          agentName: null,
          images: { total: 0, resolvable: 0, broken: 0, primary: false },
          updatedAt: null,
          notes: ["Catalogul La Cheie nu este sincronizat."],
        },
      };
    }
    const build = await buildLaCheiePayload({
      organizationId: ctx.organizationId,
      propertyId: ref.propertyId,
      catalog,
    });
    const first = build.ok ? build.offers[0]?.offer : null;
    const images = first?.images ?? [];
    return {
      ok: true,
      data: {
        feedVisible: build.ok,
        externalId: build.ok
          ? build.offers.map((entry) => entry.offer.external_id).join(",")
          : null,
        offerUrl: null,
        agentId: first?.agent.external_id ?? null,
        agentName: first?.agent.full_name ?? null,
        images: {
          total: images.length,
          resolvable: images.length,
          broken: 0,
          primary: images.length > 0,
        },
        updatedAt: null,
        notes: build.ok ? build.warnings : build.reasons,
      },
    };
  },
};
