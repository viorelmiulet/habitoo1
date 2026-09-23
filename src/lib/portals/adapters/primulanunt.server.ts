/**
 * Adaptor PrimulAnunț.ro — construit de la zero după documentația oficială
 * https://www.primulanunt.ro/api-agentii
 *
 * Model: PUSH direct, cu cheia statică a agenției (pa_live_…), emisă din contul
 * PrimulAnunț.ro, secțiunea „Integrare CRM”. Fără reînnoire de token.
 *   GET    /api/public/v1/ping                verificarea cheii (testConnection)
 *   POST   /api/public/v1/listings            creare SAU actualizare (upsert pe external_id)
 *   PATCH  /api/public/v1/listings/{id}       modificare parțială
 *   DELETE /api/public/v1/listings/{id}       arhivare (retragere)
 *
 * Pozele merg separat, DUPĂ ce anunțul există pe portal:
 *   POST /api/public/v1/listings/{id}/media   multipart/form-data, câmpul `file`
 *   (max. 20 imagini, 10 MB fiecare; prima devine coperta; `?replace=true`
 *   înlocuiește tot setul).
 *
 * Adaptorul NU construiește payload-ul anunțului și nu citește pozele din baza
 * de date: primește ambele de la sursele injectate la construire.
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
import {
  PRIMULANUNT_BASE_URL,
  createOrUpdateListing,
  deleteListing,
  ping,
  uploadListingMedia,
} from "../primulanunt/client.server";
import type {
  PrimulAnuntCallFail,
  PrimulAnuntListing,
  PrimulAnuntListingDto,
  PrimulAnuntMediaFile,
} from "../primulanunt/types";

/** Sursa payload-ului: se injectează la construirea adaptorului (pasul de mapare). */
export type PrimulAnuntListingBuilder = (
  ctx: PortalContext,
  ref: ListingRef,
) => Promise<
  { ok: true; dto: PrimulAnuntListingDto; warnings?: string[] } | { ok: false; reasons: string[] }
>;

/** Sursa pozelor: fișierele deja filtrate, ordonate și cu watermark aplicat. */
export type PrimulAnuntMediaSource = (
  ctx: PortalContext,
  ref: ListingRef,
) => Promise<{ files: PrimulAnuntMediaFile[]; warnings: string[] }>;


const FAIL_CODE: Record<PrimulAnuntCallFail["kind"], PortalErrorCode> = {
  invalid_api_key: "AUTH_ERROR",
  not_found: "NOT_FOUND",
  invalid_data: "INVALID_REQUEST",
  processing_error: "INVALID_REQUEST",
  server_error: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
  blocked_host: "CONFIG_ERROR",
};

function toPortalFail(failure: PrimulAnuntCallFail): PortalFail {
  return {
    ok: false,
    code: FAIL_CODE[failure.kind],
    message: failure.message,
    detail: `primulanunt_kind=${failure.kind}`,
    httpStatus: failure.status,
    portalResponse: failure.body,
  };
}

function configFail(message: string): PortalFail {
  return { ok: false, code: "CONFIG_ERROR", message, detail: null, httpStatus: null };
}

/** Cheia API decriptată, verificată înainte de orice apel. */
function apiKeyOf(ctx: PortalContext): string | PortalFail {
  const apiKey = ctx.portalCredential?.trim();
  if (!apiKey) {
    return configFail(
      "Lipsește cheia API PrimulAnunț.ro. Completează-o în setările portalului.",
    );
  }
  return apiKey;
}

function dryRun(externalId: string | null, action: string): PortalResult<ListingOutcome> {
  return {
    ok: true,
    data: {
      externalId,
      live: false,
      detail: `primulanunt_dry_run action=${action} external_id=${externalId ?? "-"}`,
      message:
        "Trimiterile reale către PrimulAnunț.ro sunt oprite: cererea a fost doar validată local.",
    },
  };
}

/** Anunțul acceptat, dar aflat în moderare (conturi neverificate). */
function statusMessage(listing: PrimulAnuntListing, base: string): string {
  if (listing.status === "pending") {
    return `${base} Contul nu are publicare directă, deci anunțul trece prin moderare.`;
  }
  if (listing.status === "rejected") {
    const reason = listing.rejection_reason ? ` Motiv: ${listing.rejection_reason}.` : "";
    return `Anunțul a fost respins la moderarea PrimulAnunț.ro.${reason}`;
  }
  return base;
}

export function createPrimulAnuntAdapter(
  build: PrimulAnuntListingBuilder,
  loadMedia?: PrimulAnuntMediaSource,
): PortalAdapter {
  /**
   * Pasul de poze: rulează doar după ce anunțul există pe portal. Orice eșec
   * rămâne avertisment — anunțul publicat NU se retrage din cauza pozelor.
   */
  async function sendMedia(
    apiKey: string,
    ctx: PortalContext,
    ref: ListingRef,
    listingId: string,
    action: "publish" | "update",
  ): Promise<{ warnings: string[]; uploaded: number }> {
    if (!loadMedia) return { warnings: [], uploaded: 0 };
    const media = await loadMedia(ctx, ref);
    const warnings = [...media.warnings];
    if (media.files.length === 0) return { warnings, uploaded: 0 };

    const result = await uploadListingMedia(apiKey, listingId, media.files, {
      replace: action === "update",
    });
    if (!result.ok) {
      warnings.push(
        `Anunțul a rămas publicat, dar pozele nu au putut fi încărcate: ${result.message}`,
      );
      return { warnings, uploaded: 0 };
    }
    const uploaded = result.data.uploaded || media.files.length;
    if (uploaded < media.files.length) {
      warnings.push(
        `PrimulAnunț.ro a preluat doar ${uploaded} din ${media.files.length} poze trimise.`,
      );
    }
    return { warnings, uploaded };
  }

  async function upsert(
    ctx: PortalContext,
    ref: ListingRef,
    action: "publish" | "update",
  ): Promise<PortalResult<ListingOutcome>> {
    const apiKey = apiKeyOf(ctx);
    if (typeof apiKey !== "string") return apiKey;

    const built = await build(ctx, ref);
    if (!built.ok) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `Anunțul nu poate fi trimis la PrimulAnunț.ro: ${built.reasons.join(", ")}.`,
        detail: `primulanunt_missing=${built.reasons.join("|")}`,
        httpStatus: null,
      };
    }

    const dto = built.dto;
    const warnings = built.warnings ?? [];
    if (!ctx.allowLiveRequests) return dryRun(dto.external_id, action);

    const result = await createOrUpdateListing(apiKey, dto);
    if (!result.ok) return toPortalFail(result);

    const listingId = result.data.id ?? result.data.external_id ?? dto.external_id;
    const media = await sendMedia(apiKey, ctx, ref, listingId, action);
    warnings.push(...media.warnings);

    const base =
      action === "publish"
        ? "Anunțul a fost trimis pe PrimulAnunț.ro."
        : "Anunțul a fost actualizat pe PrimulAnunț.ro.";
    const message = statusMessage(result.data, base);
    return {
      ok: true,
      data: {
        externalId: result.data.external_id ?? dto.external_id,
        live: true,
        detail:
          `primulanunt_${action} external_id=${dto.external_id} media=${media.uploaded}` +
          (warnings.length > 0 ? ` warnings=${warnings.length}` : ""),
        message: warnings.length > 0 ? `${message} ${warnings.join(" ")}` : message,
        portalStatus: result.data.status ?? null,
        publicUrl: result.data.url ?? null,
        httpStatus: result.status,
        portalResponse: result.data,
      },
    };
  }


  return {
    id: "primulanunt",

    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const apiKey = apiKeyOf(ctx);
      if (typeof apiKey !== "string") return apiKey;
      if (!ctx.allowLiveRequests) {
        return {
          ok: true,
          data: {
            configured: true,
            live: false,
            detail: "primulanunt_dry_run action=test_connection",
          },
        };
      }
      const result = await ping(apiKey);
      if (!result.ok) return toPortalFail(result);
      return {
        ok: true,
        data: {
          configured: true,
          live: true,
          detail: `primulanunt_ping ok base=${PRIMULANUNT_BASE_URL}`,
        },
      };
    },

    async getStatus(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const apiKey = apiKeyOf(ctx);
      if (typeof apiKey !== "string") {
        return { ok: true, data: { configured: false, live: false, detail: apiKey.message } };
      }
      return {
        ok: true,
        data: {
          configured: true,
          live: ctx.allowLiveRequests,
          detail: "Conexiune PrimulAnunț.ro configurată (cheie API).",
        },
      };
    },

    publishListing(ctx, ref) {
      return upsert(ctx, ref, "publish");
    },

    updateListing(ctx, ref) {
      return upsert(ctx, ref, "update");
    },

    async withdrawListing(ctx, ref): Promise<PortalResult<ListingOutcome>> {
      const apiKey = apiKeyOf(ctx);
      if (typeof apiKey !== "string") return apiKey;
      const externalId = ref.externalId?.trim();
      if (!externalId) {
        return {
          ok: true,
          data: {
            externalId: null,
            live: false,
            detail: "primulanunt_withdraw skipped: fără identificator de anunț",
            message: "Anunțul nu a fost publicat pe PrimulAnunț.ro.",
          },
        };
      }
      if (!ctx.allowLiveRequests) return dryRun(externalId, "withdraw");

      const result = await deleteListing(apiKey, externalId);
      if (!result.ok) {
        if (result.kind === "not_found") {
          return {
            ok: true,
            data: {
              externalId,
              live: true,
              detail: `primulanunt_withdraw external_id=${externalId} missing`,
              message: "Anunțul nu a fost găsit pe PrimulAnunț.ro: nu mai există pe portal.",
              httpStatus: result.status,
              portalResponse: result.body,
            },
          };
        }
        return toPortalFail(result);
      }
      return {
        ok: true,
        data: {
          externalId,
          live: true,
          detail: `primulanunt_withdraw external_id=${externalId}`,
          message: "Anunțul a fost arhivat pe PrimulAnunț.ro.",
          httpStatus: result.status,
          portalResponse: result.data,
        },
      };
    },

    async sync() {
      return notSupported("sync");
    },
  };
}

/**
 * Builder-ul real: citește proprietatea din DB și o trece prin mapper-ul
 * PrimulAnunț.ro. Nicio regulă de business aici — doar legătura dintre date și
 * mapper.
 */
export const buildPrimulAnuntListing: PrimulAnuntListingBuilder = async (ctx, ref) => {
  const [{ loadPrimulAnuntMapperInput }, { mapPropertyToPrimulAnunt }] = await Promise.all([
    import("../primulanunt/loadProperty.server"),
    import("../primulanunt/mapper"),
  ]);

  const loaded = await loadPrimulAnuntMapperInput(ref.propertyId, {
    organizationId: ctx.organizationId,
  });
  if (!loaded.ok) return { ok: false, reasons: loaded.reasons };

  const mapped = await mapPropertyToPrimulAnunt(loaded.property, loaded.context);
  if (!mapped.ok) return { ok: false, reasons: mapped.reasons };

  return { ok: true, dto: mapped.dto, warnings: mapped.warnings };
};

/** Adaptorul înregistrat, alimentat cu date reale din baza de date. */
export const primulanuntAdapter: PortalAdapter = createPrimulAnuntAdapter(buildPrimulAnuntListing);
