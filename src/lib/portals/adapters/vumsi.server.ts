/**
 * Adaptor Vumsi.com (API Orion), cheia de partener globală.
 *  - test: `GET /me/`;
 *  - publicare/actualizare: agent + agenție (doar dacă lipsesc), anunț după `external_id`
 *    (PATCH sau POST), poze, apoi publish; un anunț per tranzacție (`HBT-{id}-V/-I`);
 *  - retragere: unpublish; DELETE doar la ștergerea definitivă;
 *  - status real `GET /listings/{uuid}/`, cel mult o dată pe minut pe anunț.
 * Fără promovări plătite.
 */
import type { ConnectionStatusOutcome, ListingDiagnostics, ListingOutcome, ListingRef, PortalAdapter, PortalContext, PortalFail, PortalResult } from "../adapter";
import { notSupported } from "../adapter";
import type { PortalErrorCode } from "../errors";
import type { PortalOffer } from "../imobiliare/offer-links";
import { describeVumsiMe, getVumsiMe, vumsiRequest, type VumsiCallFail, type VumsiDeps } from "../vumsi/client.server";
import { VUMSI_KEY_MISSING_MESSAGE, hasVumsiKey } from "../vumsi/config";
import type * as Load from "../vumsi/load.server";
import { VUMSI_TX_LABEL } from "../vumsi/mapper";
import type { VumsiPreview } from "../vumsi/preview.server";
import {
  ensureVumsiAccount,
  publishVumsiListing,
  readListing,
  syncVumsiImages,
  VUMSI_IMAGES_PENDING_MESSAGE,
  upsertVumsiListing,
  vumsiStatusDue,
  vumsiStatusInfo,
  withdrawVumsi,
  type ImageFetcher,
  type VumsiCall,
  type VumsiDesiredImage,
  type VumsiStored,
} from "../vumsi/publish";

const FAIL_CODE: Record<VumsiCallFail["kind"], PortalErrorCode> = {
  not_configured: "CONFIG_ERROR",
  validation: "VALIDATION_ERROR",
  unauthorized: "AUTH_ERROR",
  forbidden: "AUTH_ERROR",
  not_found: "NOT_FOUND",
  rate_limited: "RATE_LIMIT",
  client_error: "INVALID_REQUEST",
  server_error: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
  blocked_redirect: "CONFIG_ERROR",
};

export function vumsiToPortalFail(f: VumsiCallFail, prefix = ""): PortalFail {
  return { ok: false, code: FAIL_CODE[f.kind], message: `${prefix}${f.message}`, detail: `vumsi_kind=${f.kind}`, httpStatus: f.status, portalResponse: f.body, retryAfterMs: f.retryAfterMs };
}

export type VumsiAdapterDeps = VumsiDeps & {
  preview?: (propertyId: string) => Promise<VumsiPreview>;
  images?: (organizationId: string, propertyId: string) => Promise<{ images: VumsiDesiredImage[]; warnings: string[] }>;
  fetchImage?: ImageFetcher;
  loadStored?: typeof Load.loadVumsiStored;
  save?: typeof Load.saveVumsiStored;
  saveAccount?: typeof Load.saveVumsiAccount;
  propertyState?: typeof Load.loadVumsiPropertyState;
  now?: () => number;
};

const L = () => import("../vumsi/load.server");

export function createVumsiAdapter(deps: VumsiAdapterDeps = {}): PortalAdapter {
  const env = () => deps.env ?? process.env;
  const now = () => (deps.now ?? Date.now)();
  const call: VumsiCall = (method, path, opts) => vumsiRequest(method, path, opts ?? {}, deps);
  const d = {
    preview: deps.preview ?? (async (id: string) => (await import("../vumsi/preview.server")).buildVumsiPreview(id)),
    images: deps.images ?? (async (o: string, p: string) => (await L()).loadVumsiImages(o, p)),
    fetchImage: deps.fetchImage ?? (async (u: string) => (await L()).fetchVumsiImage(u)),
    loadStored: deps.loadStored ?? (async (o: string, p: string) => (await L()).loadVumsiStored(o, p)),
    save: deps.save ?? (async (o: string, p: string, s: VumsiStored[]) => (await L()).saveVumsiStored(o, p, s)),
    saveAccount: deps.saveAccount ?? (async (k: "user" | "company", e: string, o: string, u: string) => (await L()).saveVumsiAccount(k, e, o, u)),
    propertyState: deps.propertyState ?? (async (o: string, p: string) => (await L()).loadVumsiPropertyState(o, p)),
  };

  function keyFail(): PortalFail | null {
    return hasVumsiKey(env()) ? null : { ok: false, code: "CONFIG_ERROR", message: VUMSI_KEY_MISSING_MESSAGE, detail: "vumsi_kind=not_configured", httpStatus: null };
  }

  async function test(): Promise<PortalResult<ConnectionStatusOutcome>> {
    if (!hasVumsiKey(env())) return { ok: true, data: { configured: false, live: false, detail: VUMSI_KEY_MISSING_MESSAGE } };
    const r = await getVumsiMe(deps);
    if (!r.ok) return vumsiToPortalFail(r);
    return { ok: true, data: { configured: true, live: true, detail: describeVumsiMe(r.data), portalResponse: r.data } };
  }

  async function upsert(ctx: PortalContext, ref: ListingRef, action: "publish" | "update"): Promise<PortalResult<ListingOutcome>> {
    const kf = keyFail();
    if (kf) return kf;
    const pv = await d.preview(ref.propertyId);
    const bodies = pv.plans.flatMap((p) => (p.body ? [p.body] : []));
    if (!pv.ok || !bodies.length || !pv.user.payload || !pv.company.payload) {
      return { ok: false, code: "VALIDATION_ERROR", message: `Anunțul nu poate fi trimis la Vumsi: ${pv.reasons.join(" ")}`, detail: "vumsi_not_eligible", httpStatus: null };
    }
    if (!ctx.allowLiveRequests) {
      return { ok: true, data: { externalId: bodies.map((b) => b.external_id).join(","), live: false, detail: `vumsi_dry_run action=${action} listings=${bodies.length}`, message: "Trimiterile reale către Vumsi sunt oprite: anunțul a fost doar validat local." } };
    }

    // 1. Agentul, apoi agenția (proprietarul companiei = agentul).
    const user = await ensureVumsiAccount(call, "user", pv.user.payload, pv.user.vumsiUuid);
    if (!user.ok) return vumsiToPortalFail(user.fail, "Agentul nu a putut fi legat la Vumsi: ");
    await d.saveAccount("user", pv.user.payload.external_user_id, ctx.organizationId, user.uuid).catch(() => undefined);
    const company = await ensureVumsiAccount(call, "company", { ...pv.company.payload, owner: { ...pv.company.payload.owner, user_uuid: user.uuid } }, pv.company.vumsiUuid);
    if (!company.ok) return vumsiToPortalFail(company.fail, "Agenția nu a putut fi legată la Vumsi: ");
    await d.saveAccount("company", pv.company.payload.external_company_id, ctx.organizationId, company.uuid).catch(() => undefined);

    const stored = await d.loadStored(ctx.organizationId, ref.propertyId).catch(() => [] as VumsiStored[]);
    const pics = await d.images(ctx.organizationId, ref.propertyId);
    const states: VumsiStored[] = [];
    const notes: string[] = [...pics.warnings];
    const done: string[] = [];
    const save = () => d.save(ctx.organizationId, ref.propertyId, states).catch(() => undefined);

    for (const body of bodies) {
      const tx = pv.plans.find((p) => p.externalId === body.external_id)!.transaction;
      const prev = stored.find((s) => s.external_id === body.external_id) ?? null;
      const prefix = done.length ? `Anunțul de ${done.join(", ")} a fost trimis, dar următorul a eșuat. ` : "";
      const up = await upsertVumsiListing(call, body, prev);
      if (!up.ok) { await save(); return vumsiToPortalFail(up.fail, prefix); }
      const state: VumsiStored = {
        external_id: body.external_id, transaction: tx, vumsi_uuid: up.uuid, status: up.listing.status,
        public_url: up.listing.url ?? prev?.public_url ?? null, expires_at: up.listing.expires_at ?? prev?.expires_at ?? null,
        images: up.images, status_checked_at: new Date(now()).toISOString(), deleted_at: null,
      };
      states.push(state);
      const img = await syncVumsiImages(call, up.uuid, pics.images, up.images, d.fetchImage);
      state.images = img.images;
      if (!img.ok) {
        // Eroare doar la poze: fără publish, fără status „refuzat”; următoarea salvare reîncearcă doar pozele
        // (anunțul existent e găsit după external_id și actualizat, nu recreat).
        await save();
        return {
          ok: true,
          data: {
            externalId: bodies.map((b) => b.external_id).join(","), live: true, processed: states.length,
            detail: `vumsi_images_failed http=${img.fail.status ?? "-"} kind=${img.fail.kind}`,
            message: `${prefix}${VUMSI_IMAGES_PENDING_MESSAGE}.`,
            portalStatus: "pending",
            portalResponse: { images_error: { status: img.fail.status, kind: img.fail.kind }, listings: states.map(({ images: _i, ...s }) => s) },
          },
        };
      }
      for (const w of img.warnings) if (!notes.includes(w)) notes.push(w);
      const pub = await publishVumsiListing(call, up.uuid, state.status);
      if (!pub.ok) { await save(); return vumsiToPortalFail(pub.fail, prefix); }
      state.status = pub.status;
      if (pub.url) state.public_url = pub.url;
      if (pub.expires_at) state.expires_at = pub.expires_at;
      done.push(`${VUMSI_TX_LABEL[tx]} (${up.action === "created" ? "creat" : "actualizat"}, ${vumsiStatusInfo(state.status).label.toLowerCase()})`);
    }

    // Tranzacție dezactivată → unpublish pe codul ei.
    const sent = new Set(bodies.map((b) => b.external_id));
    const stale = stored.filter((s) => !sent.has(s.external_id) && s.vumsi_uuid && !s.deleted_at && s.status !== 0);
    if (stale.length) {
      const w = await withdrawVumsi(call, stale, false);
      states.push(...w.changed);
      if (w.changed.length) notes.push(`Retras de pe Vumsi: ${w.changed.map((s) => s.external_id).join(", ")}.`);
    }
    await save();

    const current = states.filter((s) => sent.has(s.external_id));
    const pending = current.some((s) => vumsiStatusInfo(s.status).portalStatus !== "published");
    const offers: PortalOffer[] = current.filter((s) => s.public_url).map((s) => ({ transaction: s.transaction, reference: s.external_id, id: s.vumsi_uuid ?? s.external_id, url: s.public_url! }));
    return {
      ok: true,
      data: {
        externalId: bodies.map((b) => b.external_id).join(","),
        live: true,
        processed: current.length,
        detail: `vumsi_${action} ${current.map((s) => `${s.external_id}:${s.status}`).join(",")}`,
        message: `Vumsi: ${done.join("; ")}.${notes.length ? ` ${notes.join(" ")}` : ""}`,
        portalStatus: pending ? "pending" : "published",
        ...(offers[0] ? { publicUrl: offers[0].url, offers } : {}),
        portalResponse: current.map(({ images: _i, ...s }) => s),
      },
    };
  }

  return {
    id: "vumsi",
    testConnection: test,
    getStatus: test,
    publishListing: (ctx, ref) => upsert(ctx, ref, "publish"),
    updateListing: (ctx, ref) => upsert(ctx, ref, "update"),
    async withdrawListing(ctx, ref): Promise<PortalResult<ListingOutcome>> {
      const kf = keyFail();
      if (kf) return kf;
      const [stored, property] = await Promise.all([
        d.loadStored(ctx.organizationId, ref.propertyId).catch(() => [] as VumsiStored[]),
        d.propertyState(ctx.organizationId, ref.propertyId).catch(() => null),
      ]);
      const hard = ref.withdrawReason === "hard_deleted" || property === null;
      const targets = stored.filter((s) => s.vumsi_uuid && !s.deleted_at && (hard || s.status !== 0));
      if (!targets.length) return { ok: true, data: { externalId: ref.externalId, live: false, detail: "vumsi_withdraw skipped", message: "Anunțul nu este activ pe Vumsi.", portalStatus: "withdrawn" } };
      if (!ctx.allowLiveRequests) return { ok: true, data: { externalId: ref.externalId, live: false, detail: `vumsi_dry_run action=withdraw hard=${hard}`, message: "Verificat local: retragerea ar scoate anunțul de pe Vumsi." } };
      const r = await withdrawVumsi(call, targets, hard);
      await d.save(ctx.organizationId, ref.propertyId, r.changed).catch(() => undefined);
      if (!r.ok) return vumsiToPortalFail(r.fail);
      return {
        ok: true,
        data: {
          externalId: ref.externalId, live: true, processed: r.changed.length, portalStatus: "withdrawn",
          detail: `vumsi_${hard ? "delete" : "unpublish"} ${r.changed.map((s) => s.external_id).join(",")}`,
          message: hard ? "Proprietatea a fost ștearsă definitiv: anunțul a fost șters de pe Vumsi." : "Anunțul a fost retras de pe Vumsi (se poate republica).",
        },
      };
    },
    sync: async () => notSupported("sync"),
    async diagnoseListing(ctx, ref): Promise<PortalResult<ListingDiagnostics>> {
      const stored = (await d.loadStored(ctx.organizationId, ref.propertyId).catch(() => [] as VumsiStored[])).filter((s) => s.vumsi_uuid && !s.deleted_at);
      const changed: VumsiStored[] = [];
      let known = stored.length > 0;
      if (hasVumsiKey(env())) {
        for (const s of stored) {
          if (!vumsiStatusDue(s, now())) continue;
          const r = await call<unknown>("GET", `/listings/${s.vumsi_uuid}/`);
          if (!r.ok) { known = false; continue; }
          const l = readListing(r.data);
          Object.assign(s, { status: l.status, public_url: l.url ?? s.public_url, expires_at: l.expires_at, status_checked_at: new Date(now()).toISOString() });
          changed.push(s);
        }
      }
      if (changed.length) await d.save(ctx.organizationId, ref.propertyId, changed).catch(() => undefined);
      const online = stored.find((s) => vumsiStatusInfo(s.status).online) ?? null;
      const notes = stored.map((s) => {
        const exp = s.expires_at ? `, expiră ${new Date(s.expires_at).toLocaleDateString("ro-RO", { timeZone: "Europe/Bucharest" })}` : "";
        return `${VUMSI_TX_LABEL[s.transaction]}: ${vumsiStatusInfo(s.status).label}${exp}.`;
      });
      return {
        ok: true,
        data: {
          feedVisible: !!online,
          externalId: stored.map((s) => s.external_id).join(",") || ref.externalId,
          offerUrl: online?.public_url ?? null,
          agentId: null, agentName: null,
          images: { total: stored[0]?.images.length ?? 0, resolvable: stored[0]?.images.length ?? 0, broken: 0, primary: (stored[0]?.images.length ?? 0) > 0 },
          updatedAt: null,
          notes,
          stateKnown: known,
          portalState: online ? "online" : stored[0] ? (vumsiStatusInfo(stored[0].status).portalStatus === "pending" ? "pending" : "offline") : null,
          urlConfirmed: !!online?.public_url,
        },
      };
    },
  };
}

export const vumsiAdapter = createVumsiAdapter();
