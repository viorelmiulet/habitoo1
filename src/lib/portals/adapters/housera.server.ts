/**
 * Adaptor Housera.ro (cheia agenției din H1/H2): publicare/actualizare per
 * tranzacție cu PUT listings/ref/{ref} și poze; retragere/pauză/vândut după starea reală.
 */
import type { ListingOutcome, ListingRef, PortalAdapter, PortalContext, PortalFail, PortalResult } from "../adapter";
import { withdrawHousera } from "../housera/withdraw";
import type { PortalErrorCode } from "../errors";
import type { PortalOffer } from "../imobiliare/offer-links";
import { HOUSERA_MISSING_MESSAGE, HOUSERA_TEST_OK_MESSAGE, houseraBaseUrl, houseraConfigured } from "../housera/config";
import { createHouseraClient, HouseraError, type HouseraErrorKind } from "../housera/client.server";
import type { HouseraMapResult } from "../housera/mapper";
import { houseraPortalStatus, publishHousera, sortKeysDeep, type HouseraClientLike } from "../housera/publish";


const KIND_CODE: Record<HouseraErrorKind, PortalErrorCode> = {
  unauthorized: "AUTH_ERROR",
  validation: "VALIDATION_ERROR",
  busy: "PORTAL_ERROR",
  rate_limited: "RATE_LIMIT",
  temporary: "PORTAL_ERROR",
  refused: "INVALID_REQUEST",
};

function toFail(e: unknown): PortalFail {
  if (e instanceof HouseraError) {
    const detail = [`housera_kind=${e.kind}`, e.code ? `code=${e.code}` : null, e.codes.length ? `codes=${e.codes.join(",")}` : null, e.fields.length ? `fields=${e.fields.join(",")}` : null].filter(Boolean).join(" ");
    return { ok: false, code: KIND_CODE[e.kind], message: e.message, detail, httpStatus: e.status };
  }
  return { ok: false, code: "PORTAL_ERROR", message: "Publicarea pe Housera nu a putut fi finalizată.", detail: null };
}

export type HouseraAdapterDeps = {
  env?: Record<string, string | undefined>;
  mapping?: (organizationId: string, propertyId: string) => Promise<HouseraMapResult>;
  photos?: (organizationId: string, propertyId: string) => Promise<{ urls: string[]; warnings: string[] }>;
  stored?: (organizationId: string, propertyId: string) => Promise<PortalOffer[]>;
  key?: (organizationId: string) => Promise<string | null>;
  client?: (key: string, organizationId: string) => HouseraClientLike;
};

export const HOUSERA_NO_KEY_MESSAGE = "Agenția nu are o cheie de conexiune Housera. Conectează contul Housera.";

const L = () => import("../housera/listing.server");

export function createHouseraAdapter(deps: HouseraAdapterDeps = {}): PortalAdapter {
  const env = () => deps.env ?? process.env;
  const d = {
    mapping: deps.mapping ?? (async (o: string, p: string) => (await L()).loadHouseraMapping(o, p, null)),
    photos: deps.photos ?? (async (o: string, p: string) => (await L()).loadHouseraPhotoUrls(o, p)),
    stored: deps.stored ?? (async (o: string, p: string) => (await L()).loadHouseraStoredOffers(o, p)),
    key: deps.key ?? (async (o: string) => (await import("../housera/store.server")).loadHouseraKey(o)),
    client: deps.client ?? ((key: string, o: string) => createHouseraClient({
      key, baseUrl: houseraBaseUrl(env()),
      onUnauthorized: async () => (await import("../housera/store.server")).markHouseraReconnect(o),
    })),
  };

  async function upsert(ctx: PortalContext, ref: ListingRef, action: "publish" | "update"): Promise<PortalResult<ListingOutcome>> {
    try {
      if (!houseraConfigured(env())) return { ok: false, code: "CONFIG_ERROR", message: HOUSERA_MISSING_MESSAGE, detail: "housera_not_configured" };
      const mapped = await d.mapping(ctx.organizationId, ref.propertyId);
      if (mapped.errors.length || !mapped.listings.length) {
        return { ok: false, code: "VALIDATION_ERROR", message: `Anunțul nu poate fi trimis la Housera: ${mapped.errors.join(" ")}`, detail: "housera_mapping_errors" };
      }
      const photos = await d.photos(ctx.organizationId, ref.propertyId);
      const refs = mapped.listings.map((l) => l.externalRef);
      if (!ctx.allowLiveRequests) {
        const plan = mapped.listings.map((l) => `PUT listings/ref/${l.externalRef} (${Object.keys(sortKeysDeep(l.payload)).length} câmpuri)`);
        return { ok: true, data: {
          externalId: refs.join(","), live: false, processed: 0,
          detail: `housera_dry_run action=${action} listings=${refs.length} photos=${Math.min(photos.urls.length, 100)}`,
          message: `Trimiterile reale către Housera sunt oprite. S-ar trimite: ${plan.join("; ")}, apoi ${Math.min(photos.urls.length, 100)} poze.`,
        } };
      }
      const key = ctx.portalCredential ?? (await d.key(ctx.organizationId));
      if (!key) return { ok: false, code: "AUTH_ERROR", message: "Agenția nu are o cheie de conexiune Housera. Conectează contul Housera.", detail: "housera_no_key" };
      const stored = await d.stored(ctx.organizationId, ref.propertyId).catch(() => [] as PortalOffer[]);
      const r = await publishHousera({ drafts: mapped.listings, stored, photoUrls: photos.urls, client: d.client(key, ctx.organizationId) });
      const status = houseraPortalStatus(r.offers);
      const warnings = [...mapped.warnings, ...photos.warnings, ...r.warnings];
      const withUrl = r.offers.filter((o) => o.url.startsWith("https://"));
      return { ok: true, data: {
        externalId: r.offers.map((o) => o.id).join(","),
        live: true,
        processed: r.offers.length,
        detail: `housera_${action} listings=${r.offers.length} unchanged=${r.unchanged.length} photos_sent=${r.photosSent.length}`,
        message: status === "pending" ? "Anunțul a fost trimis la Housera și este în moderare." : r.unchanged.length === r.offers.length ? "Housera: anunțul era deja la zi." : "Anunțul a fost actualizat pe Housera.",
        portalStatus: status,
        publicUrl: withUrl[0]?.url ?? null,
        offers: r.offers,
        mediaWarning: warnings.length ? warnings.join(" · ") : null,
      } };
    } catch (e) {
      return toFail(e);
    }
  }

  return {
    id: "housera",
    async getStatus() {
      const ok = houseraConfigured(env());
      return { ok: true, data: { configured: ok, live: false, detail: ok ? "Conectează contul Housera." : HOUSERA_MISSING_MESSAGE } };
    },
    async testConnection(ctx) {
      try {
        if (!houseraConfigured(env())) return { ok: false, code: "CONFIG_ERROR", message: HOUSERA_MISSING_MESSAGE, detail: "housera_not_configured" };
        const key = ctx.portalCredential ?? (await d.key(ctx.organizationId));
        if (!key) return { ok: false, code: "AUTH_ERROR", message: HOUSERA_NO_KEY_MESSAGE, detail: "housera_no_key" };
        await d.client(key, ctx.organizationId).requestMeta("account/listings", { query: { fields: "code,status", per_page: 1 } });
        return { ok: true, data: { configured: true, live: true, detail: HOUSERA_TEST_OK_MESSAGE } };
      } catch (e) {
        if (e instanceof HouseraError) return toFail(e);
        return { ok: false, code: "PORTAL_ERROR", message: "Conexiunea Housera nu a putut fi verificată.", detail: null };
      }
    },
    publishListing: (ctx, ref) => upsert(ctx, ref, "publish"),
    updateListing: (ctx, ref) => upsert(ctx, ref, "update"),
    async withdrawListing(ctx, ref) {
      try {
        if (!houseraConfigured(env())) return { ok: false, code: "CONFIG_ERROR", message: HOUSERA_MISSING_MESSAGE, detail: "housera_not_configured" };
        const stored = await d.stored(ctx.organizationId, ref.propertyId);
        if (!stored.length) return { ok: true, data: { externalId: null, live: false, processed: 0, portalStatus: "withdrawn", detail: "housera_withdraw nothing_stored", message: "Anunțul nu este publicat pe Housera." } };
        if (!ctx.allowLiveRequests) return { ok: true, data: { externalId: ref.externalId, live: false, processed: 0, detail: `housera_withdraw_dry_run reason=${ref.withdrawReason ?? "user"} listings=${stored.length}`, message: "Trimiterile reale către Housera sunt oprite; nimic nu a fost retras." } };
        const key = ctx.portalCredential ?? (await d.key(ctx.organizationId));
        if (!key) return { ok: false, code: "AUTH_ERROR", message: "Agenția nu are o cheie de conexiune Housera. Conectează contul Housera.", detail: "housera_no_key" };
        const r = await withdrawHousera({ stored, reason: ref.withdrawReason ?? null, client: d.client(key, ctx.organizationId) });
        const withUrl = r.offers.filter((o) => o.url.startsWith("https://"));
        return { ok: true, data: {
          externalId: r.offers.map((o) => o.id).join(",") || null,
          live: true,
          processed: stored.length,
          portalStatus: "withdrawn",
          detail: `housera_withdraw reason=${ref.withdrawReason ?? "user"} writes=${r.writes} removed=${r.removed.length}`,
          message: r.writes ? "Anunțul a fost retras de pe Housera." : "Housera: anunțul era deja retras.",
          publicUrl: withUrl[0]?.url ?? null,
          offers: r.offers,
          replacedReferences: r.removed,
          mediaWarning: r.warnings.length ? r.warnings.join(" · ") : null,
        } };
      } catch (e) {
        return toFail(e);
      }
    },
    async sync(ctx, refs) {
      let processed = 0, failed = 0;
      for (const ref of refs) { const r = await upsert(ctx, ref, "update"); if (r.ok) processed++; else failed++; }
      return { ok: true, data: { processed, failed } };
    },
  };
}

export const houseraAdapter = createHouseraAdapter();
