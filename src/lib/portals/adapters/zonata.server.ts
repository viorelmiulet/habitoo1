/**
 * Adaptor ZonaTa: test conexiune (`GET /me`), publicare/actualizare (POST /listings,
 * idempotent după `external_id`, un anunț pe tranzacție), republicare (PATCH status
 * active + POST) și retragere (DELETE, fără `permanent`). Cheia zt_test_ doar validează.
 */
import type { ConnectionStatusOutcome, ListingOutcome, ListingRef, PortalAdapter, PortalContext, PortalFail, PortalResult } from "../adapter";
import type { buildZonataBodies, loadZonataStored, saveZonataStates, ZonataStoredListing } from "../zonata/load.server";
import {
  ZONATA_PORTAL_STATUS,
  aggregateZonataStatus,
  upsertZonataBodies,
  withdrawZonata,
  zonataStatusMessage,
  type ZonataStatus,
  type ZonataWritten,
} from "../zonata/publish";
import { notSupported } from "../adapter";
import type { PortalErrorCode } from "../errors";
import {
  ZONATA_BASE_URL,
  describeZonataAccount,
  getZonataAccount,
  type ZonataCallFail,
  type ZonataDeps,
} from "../zonata/client";
import { ZONATA_KEY_FORMAT_MESSAGE, isValidZonataKey, normalizeZonataKey, zonataKeyMode } from "../zonata/key";

const FAIL_CODE: Record<ZonataCallFail["kind"], PortalErrorCode> = {
  invalid_key_format: "CONFIG_ERROR",
  unauthorized: "AUTH_ERROR",
  package_required: "AUTH_ERROR",
  email_unverified: "AUTH_ERROR",
  not_found: "NOT_FOUND",
  validation: "VALIDATION_ERROR",
  rate_limited: "RATE_LIMIT",
  client_error: "INVALID_REQUEST",
  server_error: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
  blocked_redirect: "CONFIG_ERROR",
};

export function zonataToPortalFail(failure: ZonataCallFail, prefix = ""): PortalFail {
  return {
    ok: false,
    code: FAIL_CODE[failure.kind],
    message: `${prefix}${failure.message}`,
    detail: `zonata_kind=${failure.kind}${failure.code ? ` code=${failure.code}` : ""}`,
    httpStatus: failure.status,
    portalResponse: failure.body,
    retryAfterMs: failure.retryAfterMs,
  };
}

function apiKeyOf(ctx: PortalContext): string | PortalFail {
  const key = normalizeZonataKey(ctx.portalCredential);
  if (!key) return { ok: false, code: "CONFIG_ERROR", message: "Lipsește cheia ZonaTa a agenției.", detail: null, httpStatus: null };
  if (!isValidZonataKey(key)) return { ok: false, code: "CONFIG_ERROR", message: ZONATA_KEY_FORMAT_MESSAGE, detail: null, httpStatus: null };
  return key;
}

export type ZonataAdapterDeps = ZonataDeps & {
  build?: typeof buildZonataBodies;
  loadStored?: typeof loadZonataStored;
  save?: typeof saveZonataStates;
};

/** Statusuri la care anunțul există activ (sau în verificare) în contul ZonaTa. */
const LIVE_STATUSES = new Set<ZonataStatus>(["in_review", "active", "rejected"]);
/** Statusuri care cer PATCH `{status:"active"}` înainte de POST. */
const REACTIVATE_STATUSES = new Set<ZonataStatus>(["withdrawn", "expired"]);

const splitIds = (v: string | null | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

const lazy = {
  build: (async (i) => (await import("../zonata/load.server")).buildZonataBodies(i)) as typeof buildZonataBodies,
  loadStored: (async (i) => (await import("../zonata/load.server")).loadZonataStored(i)) as typeof loadZonataStored,
  save: (async (i, r, c) => (await import("../zonata/load.server")).saveZonataStates(i, r, c)) as typeof saveZonataStates,
};

export function createZonataAdapter(deps: ZonataAdapterDeps = {}): PortalAdapter {
  const d = { build: deps.build ?? lazy.build, loadStored: deps.loadStored ?? lazy.loadStored, save: deps.save ?? lazy.save };

  async function upsert(ctx: PortalContext, ref: ListingRef, action: "publish" | "update"): Promise<PortalResult<ListingOutcome>> {
    const key = apiKeyOf(ctx);
    if (typeof key !== "string") return key;
    const input = { organizationId: ctx.organizationId, propertyId: ref.propertyId };
    const built = await d.build(input);
    if (!built.ok) {
      return { ok: false, code: "VALIDATION_ERROR", message: `Anunțul nu poate fi trimis la ZonaTa: ${built.reasons.join(" ")}`, detail: "zonata_not_eligible", httpStatus: null };
    }
    if (!ctx.allowLiveRequests) {
      return { ok: true, data: { externalId: built.bodies.map((b) => b.external_id).join(","), live: false, detail: `zonata_dry_run action=${action} listings=${built.bodies.length}`, message: "Trimiterile reale către ZonaTa sunt oprite: anunțul a fost doar validat local." } };
    }
    const stored = await d.loadStored(input).catch(() => [] as ZonataStoredListing[]);
    const reactivate = new Set(stored.filter((r) => REACTIVATE_STATUSES.has(r.status)).map((r) => r.external_id));
    const result = await upsertZonataBodies(key, built.bodies, reactivate, deps);
    const testMode = zonataKeyMode(key) === "test";
    const toRows = (written: ZonataWritten[]) => written.map((w) => ({
      transaction: w.transaction,
      state: { ...w.state, externalId: w.body.external_id, status: (testMode ? "test" : (w.state.status ?? "in_review")) as ZonataStatus },
    }));
    if (!result.ok) {
      await d.save(input, toRows(result.done), true).catch(() => undefined);
      if (result.fail.kind === "package_required") {
        return { ok: true, data: { externalId: null, live: true, portalStatus: "needs_packet", detail: "zonata_package_required", message: result.fail.message, httpStatus: result.fail.status, portalResponse: result.fail.body } };
      }
      const done = result.done.map((w) => (w.transaction === "sale" ? "vânzare" : "închiriere")).join(", ");
      return zonataToPortalFail(result.fail, done ? `Anunțul de ${done} a fost trimis, dar următorul a eșuat. ` : "");
    }
    const rows = toRows(result.results);

    // Tranzacție scoasă din ofertă: anunțul rămas activ se retrage.
    const sent = new Set(built.bodies.map((b) => b.external_id));
    const stale = testMode ? [] : stored.filter((r) => !sent.has(r.external_id) && LIVE_STATUSES.has(r.status)).map((r) => r.external_id);
    let staleNote = "";
    if (stale.length) {
      const w = await withdrawZonata(key, stale, deps);
      if (w.ok) {
        for (const id of [...w.withdrawn, ...w.missing]) {
          rows.push({ transaction: stored.find((r) => r.external_id === id)!.transaction, state: { externalId: id, zonataId: null, status: "withdrawn", url: null, expiresAt: null, rejectedReason: null } });
        }
        staleNote = ` Retras de pe ZonaTa: ${stale.join(", ")}.`;
      }
    }
    await d.save(input, rows, true).catch(() => undefined);

    const statuses = rows.filter((r) => sent.has(r.state.externalId)).map((r) => r.state.status);
    const agg = aggregateZonataStatus(statuses) ?? "in_review";
    const active = result.results.find((w) => w.state.url);
    const parts = rows.filter((r) => sent.has(r.state.externalId)).map((r) =>
      built.bodies.length > 1 ? `${r.transaction === "sale" ? "vânzare" : "închiriere"}: ${zonataStatusMessage(r.state)}` : zonataStatusMessage(r.state));
    const message = [parts.join("; "), ...built.warnings].filter(Boolean).join(" ") + staleNote;
    return {
      ok: true,
      data: {
        // Mod test: nimic salvat la ZonaTa, deci nici cod extern.
        externalId: testMode ? null : built.bodies.map((b) => b.external_id).join(","),
        live: !testMode,
        processed: result.results.length,
        detail: `zonata_${action}${testMode ? "_test" : ""} results=${result.results.map((w) => `${w.body.external_id}:${w.state.status ?? w.httpStatus}${w.reactivated ? "+reactivated" : ""}`).join(",")}`,
        message,
        portalStatus: ZONATA_PORTAL_STATUS[agg],
        ...(!testMode && active?.state.url ? { publicUrl: active.state.url } : {}),
        httpStatus: result.results.at(-1)?.httpStatus ?? null,
        portalResponse: result.results.map((w) => w.state),
      },
    };
  }

  return {
    id: "zonata",
    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const key = apiKeyOf(ctx);
      if (typeof key !== "string") return key;
      const result = await getZonataAccount(key, deps);
      if (!result.ok) return zonataToPortalFail(result);
      return {
        ok: true,
        data: { configured: true, live: true, detail: describeZonataAccount(result.data, zonataKeyMode(key)), portalResponse: result.data },
      };
    },
    async getStatus(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const key = apiKeyOf(ctx);
      if (typeof key !== "string") return { ok: true, data: { configured: false, live: false, detail: key.message } };
      return { ok: true, data: { configured: true, live: ctx.allowLiveRequests, detail: `zonata base=${ZONATA_BASE_URL} mode=${zonataKeyMode(key)}` } };
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
      const input = { organizationId: ctx.organizationId, propertyId: ref.propertyId };
      const stored = await d.loadStored(input).catch(() => [] as ZonataStoredListing[]);
      const ids = [...new Set([
        ...splitIds(ref.externalId),
        ...stored.filter((r) => LIVE_STATUSES.has(r.status)).map((r) => r.external_id),
      ])];
      if (ids.length === 0) {
        return { ok: true, data: { externalId: null, live: false, detail: "zonata_withdraw skipped", message: "Anunțul nu a fost publicat pe ZonaTa.", portalStatus: "withdrawn" } };
      }
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { externalId: ids.join(","), live: false, detail: `zonata_dry_run action=withdraw ids=${ids.join(",")}`, message: "Verificat local: retragerea ar dezactiva anunțul pe ZonaTa." } };
      }
      const result = await withdrawZonata(key, ids, deps);
      if (!result.ok) return zonataToPortalFail(result.fail);
      const txOf = (id: string) => stored.find((r) => r.external_id === id)?.transaction ?? (id.endsWith("-i") ? "rent" : "sale");
      await d.save(input, [...result.withdrawn, ...result.missing].map((id) => ({
        transaction: txOf(id),
        state: { externalId: id, zonataId: null, status: "withdrawn" as const, url: null, expiresAt: null, rejectedReason: null },
      })), false).catch(() => undefined);
      return {
        ok: true,
        data: {
          externalId: ids.join(","),
          live: true,
          processed: result.withdrawn.length,
          portalStatus: "withdrawn",
          detail: `zonata_withdraw withdrawn=${result.withdrawn.join(",") || "-"} missing=${result.missing.length}`,
          message: result.withdrawn.length
            ? "Anunțul a fost retras de pe ZonaTa; rămâne inactiv în contul agenției."
            : "ZonaTa nu a găsit anunțul: nu mai era activ pe portal.",
        },
      };
    },
    async sync() {
      return notSupported("sync");
    },
  };
}

export const zonataAdapter = createZonataAdapter();
