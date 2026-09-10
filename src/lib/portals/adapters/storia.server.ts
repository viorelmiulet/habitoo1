/**
 * Adaptor Storia.ro (OLX Group RE API).
 *
 * Conexiunea este OAuth2 per agenție (vezi `../storia/oauth.server.ts`), iar
 * publicarea anunțurilor este ASINCRONĂ: cererea de creare/actualizare este
 * doar acceptată, statusul real venind din `/meta` sau prin notificări. De
 * aceea adaptorul nu raportează niciodată „publicat” fără status confirmat.
 *
 * O ofertă cu ambele tranzacții active produce două anunțuri Storia, iar
 * identificatorii lor se păstrează împreună în `portal_listings.external_id`
 * sub forma `SALE:uuid|RENT:uuid`.
 */
import {
  notSupported,
  type ConnectionStatusOutcome,
  type ListingOutcome,
  type ListingRef,
  type PortalAdapter,
  type PortalContext,
  type PortalResult,
} from "../adapter";
import { PortalError, codeFromHttpStatus, toPortalError } from "../errors";
import { loadStoriaTokens, olxAuthorizedRequest, readStoriaOAuthMeta, storiaAppConfigured } from "../storia/oauth.server";
import { buildStoriaPayload } from "../storia/payload.server";
import {
  activateAdvert,
  createAdvert,
  deactivateAdvert,
  parseAdvertRefs,
  readAdvertMeta,
  serializeAdvertRefs,
  storiaListingStatus,
  storiaReactivationPlan,
  STORIA_STATUS_MESSAGE,
  updateAdvert,
  type AdvertRefs,
} from "../storia/adverts.server";

import type { StoriaTransaction } from "../storia/taxonomy";

/** Endpoint minim, folosit doar ca să confirmăm că tokenul este acceptat. */
const PROBE_PATH = "/advert/v1/adverts?limit=1";

const TX_LABEL: Record<StoriaTransaction, string> = { sale: "vânzare", rent: "închiriere" };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function connectedState(ctx: PortalContext): { hasTokens: boolean; expiresAt: string | null } {

  const meta = readStoriaOAuthMeta(ctx.settings);
  return { hasTokens: Boolean(ctx.portalCredential), expiresAt: meta?.expires_at ?? null };
}

function fail(error: unknown) {
  const portalError = error instanceof PortalError ? error : toPortalError(error);
  return {
    ok: false as const,
    code: portalError.code,
    message: portalError.message,
    detail: portalError.detail,
  };
}

async function requireConnection(ctx: PortalContext) {
  if (!storiaAppConfigured()) {
    return {
      ok: false as const,
      code: "CONFIG_ERROR" as const,
      message:
        "Integrarea Storia nu este configurată la nivel de platformă: lipsesc credențialele de aplicație OLX.",
      detail: "missing_app_credentials",
    };
  }
  const tokens = await loadStoriaTokens(ctx.organizationId);
  if (!tokens) {
    return {
      ok: false as const,
      code: "AUTH_ERROR" as const,
      message: "Contul Storia al agenției nu este conectat. Pornește autorizarea contului Storia.",
      detail: "not_connected",
    };
  }
  return { ok: true as const };
}

async function probe(ctx: PortalContext): Promise<PortalResult<ConnectionStatusOutcome>> {
  const ready = await requireConnection(ctx);
  if (!ready.ok) return ready;

  if (!ctx.allowLiveRequests) {
    return {
      ok: true,
      data: {
        configured: true,
        live: false,
        detail: "storia oauth configurat; trimiterile reale sunt oprite (mod simulare)",
      },
    };
  }

  try {
    const res = await olxAuthorizedRequest(ctx.organizationId, "GET", PROBE_PATH);
    // Orice răspuns care nu este 401/403 confirmă că tokenul agenției e acceptat.
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        code: "AUTH_ERROR",
        message: "Storia a refuzat tokenul agenției. Reia conectarea contului Storia.",
        detail: `probe_http_${res.status}`,
      };
    }
    if (res.status >= 500) {
      return {
        ok: false,
        code: codeFromHttpStatus(res.status),
        message: "Storia nu a răspuns corect. Reîncearcă în câteva minute.",
        detail: `probe_http_${res.status}`,
      };
    }
    return {
      ok: true,
      data: { configured: true, live: true, detail: `storia oauth valid (http_${res.status})` },
    };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Creează sau actualizează anunțurile ofertei. `mode` decide doar mesajele:
 * pentru un anunț deja existent trimitem PUT în ambele cazuri, iar dacă
 * portalul nu îl mai găsește îl recreăm.
 */
async function pushListing(
  ctx: PortalContext,
  ref: ListingRef,
  mode: "publish" | "update",
): Promise<PortalResult<ListingOutcome>> {
  const ready = await requireConnection(ctx);
  if (!ready.ok) return ready;

  const build = await buildStoriaPayload({
    organizationId: ctx.organizationId,
    propertyId: ref.propertyId,
  });
  if (!build.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Storia nu poate primi oferta: ${build.reasons.join(" ")}`,
      detail: "local_validation",
    };
  }

  const refs: AdvertRefs = parseAdvertRefs(ref.externalId);

  if (!ctx.allowLiveRequests) {
    return {
      ok: true,
      data: {
        externalId: serializeAdvertRefs(refs),
        live: false,
        detail: `storia dry-run: ${build.listings.length} anunț(uri) validate local`,
        portalStatus: "pending",
        message: [
          `Validare locală trecută pentru ${build.listings.length} anunț(uri) Storia; trimiterile reale sunt oprite.`,
          ...build.warnings,
        ].join(" "),
      },
    };
  }

  const notes: string[] = [...build.warnings];
  const statuses: string[] = [];

  try {
    for (const listing of build.listings) {
      const label = TX_LABEL[listing.transaction];
      let uuid = refs[listing.transaction] ?? null;
      let created = false;
      let reactivated = false;
      let recreated = false;

      // Un PUT actualizează datele, dar NU readuce online un anunț dezactivat:
      // portalul cere explicit `activate`, iar dacă starea nu mai permite
      // reactivarea (moderare, șters din profil) trebuie creat un anunț nou.
      if (uuid) {
        const before = await readAdvertMeta(ctx.organizationId, uuid).catch(() => null);
        const plan = before ? storiaReactivationPlan(before) : "none";
        if (plan === "activate") {
          let outcome = await activateAdvert(ctx.organizationId, uuid);
          if (outcome === "not_allowed") {
            // Portalul procesează asincron: o operațiune încă în curs poate
            // refuza activarea. Reîncercăm o singură dată.
            await delay(4000);
            outcome = await activateAdvert(ctx.organizationId, uuid);
          }
          if (outcome === "activated") reactivated = true;
          else recreated = true;
        } else if (plan === "recreate") {
          recreated = true;
        }

        if (recreated) {
          uuid = await createAdvert(ctx.organizationId, listing.advert);
        } else {
          const outcome = await updateAdvert(ctx.organizationId, uuid, listing.advert);
          if (outcome === "missing") {
            uuid = await createAdvert(ctx.organizationId, listing.advert);
            created = true;
          }
        }
      } else {
        uuid = await createAdvert(ctx.organizationId, listing.advert);
        created = true;
      }
      refs[listing.transaction] = uuid;

      // Statusul real: `/meta` best-effort; confirmarea finală vine prin notificări.
      if (reactivated) await delay(3000);
      const meta = await readAdvertMeta(ctx.organizationId, uuid).catch(() => null);
      const code = meta?.code ?? null;
      // După o reactivare, portalul poate raporta încă starea veche câteva
      // secunde: nu o marcăm „retras”, ci „în procesare”.
      const status = storiaListingStatus(code);
      statuses.push(reactivated && status === "withdrawn" ? "pending" : status);

      const prefix = recreated
        ? `Anunțul de ${label} nu mai putea fi reactivat pe Storia, așa că a fost publicat ca anunț nou.`
        : reactivated
          ? `Anunțul de ${label} a fost reactivat pe Storia.`
          : null;
      notes.push(
        [
          prefix,
          code && !(reactivated && status === "withdrawn")
            ? `Anunțul de ${label} este ${STORIA_STATUS_MESSAGE[code] ?? `în starea „${code}”`}.` +
              (meta?.moderationReason ? ` Motiv moderare: ${meta.moderationReason}.` : "")
            : `Anunțul de ${label} a fost ${created || recreated ? "trimis" : reactivated ? "reactivat" : "actualizat"} și este în procesare la Storia; statusul final vine prin notificare.`,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
  } catch (error) {


    const failed = fail(error);
    const partial = serializeAdvertRefs(refs);
    return partial ? { ...failed, detail: `${failed.detail ?? ""} refs_saved`.trim() } : failed;
  }

  // Starea agregată: cea mai puțin favorabilă dintre anunțurile trimise.
  const portalStatus = statuses.includes("error")
    ? "error"
    : statuses.includes("withdrawn")
      ? "withdrawn"
      : statuses.includes("pending") || statuses.length === 0
        ? "pending"
        : "published";


  return {
    ok: true,
    data: {
      externalId: serializeAdvertRefs(refs),
      live: true,
      detail: `storia ${mode}: ${build.listings.length} anunț(uri), stare ${portalStatus}`,
      processed: build.listings.length,
      portalStatus,
      message: notes.join(" "),
    },
  };
}

export const storiaAdapter: PortalAdapter = {
  id: "storia",

  async testConnection(ctx) {
    return probe(ctx);
  },

  async getStatus(ctx) {
    const state = connectedState(ctx);
    if (!state.hasTokens) {
      return {
        ok: true,
        data: { configured: false, live: false, detail: "storia: cont neconectat" },
      };
    }
    const expired = state.expiresAt ? new Date(state.expiresAt).getTime() <= Date.now() : false;
    return {
      ok: true,
      data: {
        configured: true,
        live: false,
        detail: expired
          ? "storia: token expirat, se reîmprospătează automat la prima cerere"
          : "storia: cont conectat",
      },
    };
  },

  async publishListing(ctx, ref) {
    return pushListing(ctx, ref, "publish");
  },

  async updateListing(ctx, ref) {
    return pushListing(ctx, ref, "update");
  },

  async withdrawListing(ctx, ref) {
    const ready = await requireConnection(ctx);
    if (!ready.ok) return ready;

    const refs = parseAdvertRefs(ref.externalId);
    const uuids = (["sale", "rent"] as StoriaTransaction[]).filter((tx) => refs[tx]);
    if (uuids.length === 0) {
      return {
        ok: true,
        data: {
          externalId: null,
          live: false,
          detail: "storia: nu există anunț de retras",
          portalStatus: "withdrawn",
          message: "Oferta nu are anunțuri active pe Storia.",
        },
      };
    }

    if (!ctx.allowLiveRequests) {
      return {
        ok: true,
        data: {
          externalId: serializeAdvertRefs(refs),
          live: false,
          detail: "storia dry-run: retragere validată local",
          portalStatus: "withdrawn",
          message: "Retragerea a fost validată local; trimiterile reale sunt oprite.",
        },
      };
    }

    const notes: string[] = [];
    try {
      for (const tx of uuids) {
        const outcome = await deactivateAdvert(ctx.organizationId, refs[tx] as string);
        notes.push(
          outcome === "missing"
            ? `Anunțul de ${TX_LABEL[tx]} nu mai există pe Storia.`
            : `Anunțul de ${TX_LABEL[tx]} a fost dezactivat pe Storia.`,
        );
      }
    } catch (error) {
      return fail(error);
    }

    return {
      ok: true,
      data: {
        externalId: serializeAdvertRefs(refs),
        live: true,
        detail: `storia withdraw: ${uuids.length} anunț(uri)`,
        processed: uuids.length,
        portalStatus: "withdrawn",
        message: notes.join(" "),
      },
    };
  },

  async sync(): Promise<PortalResult<{ processed: number; failed: number }>> {
    return notSupported("sync");
  },
};
