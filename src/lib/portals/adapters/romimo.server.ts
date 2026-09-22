/**
 * Adaptor Romimo (Romimo.ro + Publi24.ro) — construit de la zero după
 * documentația oficială Romimo API v2.
 *
 * Model: PUSH direct, cu ApiKey-ul agenției și emailul contului Romimo.
 *   POST   /api/Token?ApiKey=…        token JWT (24h)
 *   GET    /api/User/Package?Email=   pachetul contului
 *   POST   /api/Article               creare SAU actualizare (upsert pe externalid)
 *   DELETE /api/Article?Email=&ExternalId=   retragere
 *
 * Adaptorul NU construiește payload-ul anunțului: primește un `SaveArticleDto`
 * gata făcut și completează doar `user.email`. Nu expune sincronizare în masă,
 * preluare de anunțuri sau webhook-uri, fiindcă portalul nu le documentează.
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
  ROMIMO_BASE_URL,
  deleteArticle,
  getPackage,
  saveArticle,
  withRomimoToken,
} from "../romimo/client.server";
import type { RomimoCallFail, SaveArticleDto } from "../romimo/types";

/** Sursa payload-ului: se injectează la construirea adaptorului (pasul de mapare). */
export type RomimoArticleBuilder = (
  ctx: PortalContext,
  ref: ListingRef,
) => Promise<{ ok: true; dto: SaveArticleDto } | { ok: false; reasons: string[] }>;

const FAIL_CODE: Record<RomimoCallFail["kind"], PortalErrorCode> = {
  invalid_request: "INVALID_REQUEST",
  invalid_api_key: "AUTH_ERROR",
  token_expired: "AUTH_ERROR",
  unsupported_media_type: "INVALID_REQUEST",
  not_found: "NOT_FOUND",
  server_error: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
  blocked_host: "CONFIG_ERROR",
};

function toPortalFail(failure: RomimoCallFail): PortalFail {
  return {
    ok: false,
    code: FAIL_CODE[failure.kind],
    message: failure.message,
    detail: `romimo_kind=${failure.kind}`,
    httpStatus: failure.status,
    portalResponse: failure.body,
  };
}

function configFail(message: string): PortalFail {
  return { ok: false, code: "CONFIG_ERROR", message, detail: null, httpStatus: null };
}

/** ApiKey-ul decriptat și emailul contului, verificate înainte de orice apel. */
function credentials(ctx: PortalContext): { apiKey: string; email: string } | PortalFail {
  const apiKey = ctx.portalCredential?.trim();
  if (!apiKey) return configFail("Lipsește ApiKey-ul Romimo. Completează-l în setările portalului.");
  const email = ctx.externalAccountId?.trim();
  if (!email) {
    return configFail("Lipsește emailul contului Romimo. Completează-l în setările portalului.");
  }
  return { apiKey, email };
}

function dryRun(externalId: string | null, action: string): PortalResult<ListingOutcome> {
  return {
    ok: true,
    data: {
      externalId,
      live: false,
      detail: `romimo_dry_run action=${action} external_id=${externalId ?? "-"}`,
      message: "Trimiterile reale către Romimo sunt oprite: cererea a fost doar validată local.",
    },
  };
}

export function createRomimoAdapter(buildArticle: RomimoArticleBuilder): PortalAdapter {
  async function upsert(
    ctx: PortalContext,
    ref: ListingRef,
    action: "publish" | "update",
  ): Promise<PortalResult<ListingOutcome>> {
    const creds = credentials(ctx);
    if ("ok" in creds) return creds;

    const built = await buildArticle(ctx, ref);
    if (!built.ok) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `Anunțul nu poate fi trimis la Romimo: ${built.reasons.join(", ")}.`,
        detail: `romimo_missing=${built.reasons.join("|")}`,
        httpStatus: null,
      };
    }

    const dto: SaveArticleDto = { ...built.dto, user: { email: creds.email } };
    const externalId = dto.ad.externalid;
    if (!ctx.allowLiveRequests) return dryRun(externalId, action);

    const result = await withRomimoToken(creds.apiKey, (token) => saveArticle(token, dto));
    if (!result.ok) return toPortalFail(result);
    return {
      ok: true,
      data: {
        externalId,
        live: true,
        detail: `romimo_${action} external_id=${externalId}`,
        message:
          action === "publish"
            ? "Anunțul a fost trimis la Romimo. Apare pe Romimo.ro și Publi24.ro."
            : "Anunțul a fost actualizat pe Romimo.",
        httpStatus: result.status,
        portalResponse: result.data,
      },
    };
  }

  return {
    id: "romimo",

    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const creds = credentials(ctx);
      if ("ok" in creds) return creds;
      if (!ctx.allowLiveRequests) {
        return {
          ok: true,
          data: {
            configured: true,
            live: false,
            detail: "romimo_dry_run action=test_connection",
          },
        };
      }

      const result = await withRomimoToken(creds.apiKey, (token) =>
        getPackage(token, creds.email),
      );
      if (!result.ok) {
        const failure = toPortalFail(result);
        if (result.kind === "invalid_api_key") {
          return { ...failure, message: "ApiKey Romimo invalid." };
        }
        if (result.kind === "invalid_request" || result.kind === "not_found") {
          return {
            ...failure,
            message: `${result.message} Verifică dacă emailul contului Romimo are pachet activ.`,
          };
        }
        return failure;
      }
      if (!result.data) {
        return {
          ok: false,
          code: "CONFIG_ERROR",
          message:
            "Romimo nu a returnat niciun pachet pentru acest email: contul nu are pachet Romimo activ.",
          detail: "romimo_package_missing",
          httpStatus: result.status,
          portalResponse: null,
        };
      }
      return {
        ok: true,
        data: {
          configured: true,
          live: true,
          detail: `romimo_package ok base=${ROMIMO_BASE_URL}`,
        },
      };
    },

    async getStatus(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const creds = credentials(ctx);
      if ("ok" in creds) {
        return { ok: true, data: { configured: false, live: false, detail: creds.message } };
      }
      return {
        ok: true,
        data: {
          configured: true,
          live: ctx.allowLiveRequests,
          detail: "Conexiune Romimo configurată (ApiKey + email cont).",
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
      const creds = credentials(ctx);
      if ("ok" in creds) return creds;
      const externalId = ref.externalId?.trim();
      if (!externalId) {
        return {
          ok: true,
          data: {
            externalId: null,
            live: false,
            detail: "romimo_withdraw skipped: fără identificator de anunț",
            message: "Anunțul nu a fost publicat pe Romimo.",
          },
        };
      }
      if (!ctx.allowLiveRequests) return dryRun(externalId, "withdraw");

      const result = await withRomimoToken(creds.apiKey, (token) =>
        deleteArticle(token, creds.email, externalId),
      );
      if (!result.ok) {
        if (result.kind === "not_found") {
          return {
            ok: true,
            data: {
              externalId,
              live: true,
              detail: `romimo_withdraw external_id=${externalId} missing`,
              message: "Romimo nu a găsit acest anunț: nu mai există pe portal.",
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
          detail: `romimo_withdraw external_id=${externalId}`,
          message: "Anunțul a fost retras de pe Romimo și Publi24.",
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
 * Adaptorul înregistrat. Payload-ul anunțului vine din pasul de mapare, care nu
 * există încă: până atunci publicarea este refuzată explicit, fără presupuneri.
 */
export const romimoAdapter: PortalAdapter = createRomimoAdapter(async () => ({
  ok: false,
  reasons: ["maparea câmpurilor Romimo nu este încă implementată"],
}));
