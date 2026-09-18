/**
 * Adaptor Imobiliare.ro — API v3 de publicare (production only).
 *
 * Contract implementat:
 *   POST /api/v1/auth/oauth/token                        autorizare + refresh
 *   GET  /api/v3/agents                                  test conexiune + agenți
 *   POST /api/v3/agents                                  creare agent
 *   POST /api/v3/listings                                creare anunț (draft)
 *   POST /api/v3/listings/{ref}/medias                   imagini base64, în loturi
 *   POST /api/v3/listings/{ref}/promotions {online}      publicare efectivă
 *   PUT  /api/v3/listings/{ref}                          actualizare completă
 *   POST /api/v3/listings/{ref}/promotions {draft}       retragere temporară
 *   DELETE /api/v3/listings/{ref}                        ștergere definitivă
 *
 * Publicarea este UN SINGUR act din perspectiva utilizatorului: draft →
 * imagini → promovare online. Dacă promovarea nu reușește, operațiunea NU e
 * raportată ca succes: anunțul rămâne draft la portal, cu eroarea reală, iar
 * reîncercarea reia doar pașii lipsă.
 */
import type {
  ConnectionStatusOutcome,
  ListingOutcome,
  ListingDiagnostics,
  ListingRef,
  PortalAdapter,
  PortalContext,
  PortalResult,
} from "../adapter";
import { notSupported } from "../adapter";
import { toPortalError } from "../errors";
import {
  IMOBILIARE_PATHS,
  IMOBILIARE_STATUS_DRAFT,
  IMOBILIARE_STATUS_ONLINE,
  imobiliarePublicUrlFromBody,
  imobiliareStateFromBody,
  listingPath,
  mediasPath,
  promotionsPath,
} from "../imobiliare/config";
import {
  getImobiliareSession,
  imobiliareAuthedRequest,
  type ImobiliareSession,
} from "../imobiliare/auth.server";
import { withImobiliareWriteLock } from "../imobiliare/client.server";
import { withDurableImobiliareLock } from "../imobiliare/lock.server";
import {
  readCategoryCatalog,
  refreshCategoryCatalog,
  categoryCatalogIsFresh,
  type CategoryCatalog,
} from "../imobiliare/categories.server";
import { imobiliareLocationStats } from "../imobiliare/locations.server";
import { batchEncodedImages, encodeImobiliareImages } from "../imobiliare/media.server";
import { buildImobiliarePayload, type ImobiliareListingPlan } from "../imobiliare/payload.server";
import { parseAgents } from "../imobiliare/agents.server";
import {
  parseImobiliareReferences,
  referenceForTransaction,
  serializeImobiliareReferences,
} from "../imobiliare/references";

type PortalFailShape = Extract<PortalResult<never>, { ok: false }>;
type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function failFrom(
  response: { status: number; body?: unknown; classification: { code: string; message: string } | null },
  operation: string,
): PortalFailShape {
  const code = (response.classification?.code ?? "PORTAL_ERROR") as PortalFailShape["code"];
  return {
    ok: false,
    code,
    message: response.classification?.message ?? `Imobiliare.ro a răspuns HTTP ${response.status}.`,
    detail: `${operation} http_${response.status}`,
    httpStatus: response.status,
    portalResponse: response.body ?? null,
  };
}

type Ready =
  | { ok: true; session: ImobiliareSession; catalog: CategoryCatalog }
  | { ok: false; result: PortalFailShape };

/**
 * `refreshCatalog: false` — diagnoza NU reîmprospătează niciodată catalogul de
 * categorii: era un request suplimentar la portal la fiecare încărcare de
 * pagină, fără nicio legătură cu starea anunțului.
 */
async function prepare(
  ctx: PortalContext,
  options?: { refreshCatalog?: boolean },
): Promise<Ready> {
  const db = await admin();
  const session = await getImobiliareSession({
    admin: db,
    organizationId: ctx.organizationId,
    username: ctx.externalAccountId,
    credential: ctx.portalCredential,
  });
  if (!session.ok) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "CONFIG_ERROR",
        message: session.message,
        detail: session.detail,
      },
    };
  }
  let catalog = readCategoryCatalog(ctx.settings as Record<string, unknown>);
  if (options?.refreshCatalog !== false && !categoryCatalogIsFresh(catalog)) {
    const refreshed = await refreshCategoryCatalog(db, session.session, ctx.organizationId);
    catalog = refreshed.catalog;
  }
  return {
    ok: true,
    session: session.session,
    catalog,
  };
}

/* ------------------------------ test connection --------------------------- */

async function status(
  ctx: PortalContext,
  live: boolean,
): Promise<PortalResult<ConnectionStatusOutcome>> {
  if (!(ctx.portalCredential ?? "").trim()) {
    return {
      ok: true,
      data: {
        configured: false,
        live: false,
        detail: "Utilizatorul și parola contului Imobiliare.ro nu sunt salvate.",
      },
    };
  }
  if (!live) {
    return {
      ok: true,
      data: {
        configured: true,
        live: false,
        detail: "Credențiale salvate; testează conexiunea pentru confirmare.",
      },
    };
  }

  const ready = await prepare(ctx);
  if (!ready.ok) return ready.result;

  try {
    const db = await admin();
    const response = await imobiliareAuthedRequest(ready.session, {
      method: "GET",
      path: IMOBILIARE_PATHS.agents,
      connectionKey: ctx.organizationId,
    });
    if (!response.ok) return failFrom(response, "test_connection");

    const agents = parseAgents(response.body).length;
    const categories = await refreshCategoryCatalog(db, ready.session, ctx.organizationId);
    const locations = await imobiliareLocationStats(db);

    const notes = [
      `Autorizare validă (${agents} agenți în contul portalului).`,
      categories.message,
      locations.zones > 0
        ? `Nomenclator de locații încărcat (${locations.zones} zone).`
        : "Nomenclatorul de locații Imobiliare.ro nu este încărcat: publicarea rămâne blocată până la import.",
    ];
    return {
      ok: true,
      data: { configured: true, live: true, detail: notes.join(" ") },
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

async function sendImages(
  session: ImobiliareSession,
  ctx: PortalContext,
  customReference: string,
  images: { dataUrl: string; bytes: number }[],
): Promise<{ ok: true; sent: number } | { ok: false; fail: PortalFailShape }> {
  let sent = 0;
  for (const batch of batchEncodedImages(images as never)) {
    const response = await imobiliareAuthedRequest(session, {
      method: "POST",
      path: mediasPath(customReference),
      connectionKey: ctx.organizationId,
      body: { images: batch.map((image) => image.dataUrl) },
      timeoutMs: 60_000,
    });
    if (!response.ok) return { ok: false, fail: failFrom(response, "medias") };
    sent += batch.length;
  }
  return { ok: true, sent };
}

/** Anunțul există deja la portal cu aceeași referință (creare reluată). */
function isDuplicateReference(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const errors = (body as Record<string, unknown>)["errors"];
  if (!errors || typeof errors !== "object") return false;
  const entry = (errors as Record<string, unknown>)["custom_reference"];
  const text = Array.isArray(entry) ? entry.join(" ") : String(entry ?? "");
  return /unique/i.test(text);
}

/** Linkul public al anunțului, din câmpul `path` returnat de GET listing. */
async function fetchImobiliarePublicUrl(
  session: ImobiliareSession,
  ctx: PortalContext,
  customReference: string,
): Promise<string | null> {
  const response = await imobiliareAuthedRequest(session, {
    method: "GET",
    path: listingPath(customReference),
    connectionKey: ctx.organizationId,
  });
  if (!response.ok) return null;
  return imobiliarePublicUrlFromBody(response.body);
}

/** Întârzierile dintre reîncercările de citire a linkului public, în ms. */
export const IMOBILIARE_PUBLIC_URL_RETRY_DELAYS = [2_000, 5_000] as const;

/**
 * Imediat după promovarea online, portalul întoarce uneori anunțul fără `path`
 * (sau încă în `draft`). Reîncercăm scurt înainte de a renunța; lipsa linkului
 * NU transformă publicarea în eșec.
 */
export async function fetchImobiliarePublicUrlWithRetries(
  session: ImobiliareSession,
  ctx: PortalContext,
  customReference: string,
  delaysMs: readonly number[] = IMOBILIARE_PUBLIC_URL_RETRY_DELAYS,
): Promise<string | null> {
  const first = await fetchImobiliarePublicUrl(session, ctx, customReference);
  if (first) return first;
  for (const delay of delaysMs) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const url = await fetchImobiliarePublicUrl(session, ctx, customReference);
    if (url) return url;
  }
  return null;
}

async function publishPlan(input: {
  ctx: PortalContext;
  session: ImobiliareSession;
  plan: ImobiliareListingPlan;
  images: { dataUrl: string; bytes: number }[];
  mode: WriteMode;
}): Promise<
  | {
      ok: true;
      steps: string[];
      publicUrl: string | null;
      httpStatus: number | null;
      portalResponse: unknown;
    }
  | { ok: false; fail: PortalFailShape }
> {
  const { ctx, session, plan, images } = input;
  let mode = input.mode;
  const steps: string[] = [];

  let created = await imobiliareAuthedRequest(session, {
    method: mode === "create" ? "POST" : "PUT",
    path: mode === "create" ? listingPath() : listingPath(plan.customReference),
    connectionKey: ctx.organizationId,
    body: plan.listing,
  });
  // Referința există deja (o creare anterioară a reușit parțial): continuăm cu update.
  if (!created.ok && mode === "create" && isDuplicateReference(created.body)) {
    mode = "update";
    created = await imobiliareAuthedRequest(session, {
      method: "PUT",
      path: listingPath(plan.customReference),
      connectionKey: ctx.organizationId,
      body: plan.listing,
    });
  }
  if (!created.ok) return { ok: false, fail: failFrom(created, mode === "create" ? "create" : "update") };
  steps.push(mode === "create" ? "anunț creat (draft)" : "anunț actualizat");

  if (images.length > 0) {
    const media = await sendImages(session, ctx, plan.customReference, images);
    if (!media.ok) return { ok: false, fail: media.fail };
    steps.push(`${media.sent} imagini trimise`);
  }

  // Fără acest pas anunțul rămâne invizibil, deși API-ul nu semnalează eroare.
  const promoted = await imobiliareAuthedRequest(session, {
    method: "POST",
    path: promotionsPath(plan.customReference),
    connectionKey: ctx.organizationId,
    body: { status: IMOBILIARE_STATUS_ONLINE },
  });
  if (!promoted.ok) {
    const fail = failFrom(promoted, "promotions_online");
    return {
      ok: false,
      fail: {
        ...fail,
        message: `${fail.message} Anunțul a rămas în starea draft la portal; reîncearcă publicarea.`,
      },
    };
  }
  steps.push("promovat online");
  const publicUrl = await fetchImobiliarePublicUrlWithRetries(session, ctx, plan.customReference);
  return {
    ok: true,
    steps,
    publicUrl,
    httpStatus: promoted.status,
    portalResponse: promoted.body ?? null,
  };
}

async function write(
  ctx: PortalContext,
  ref: ListingRef,
  mode: WriteMode,
): Promise<PortalResult<ListingOutcome>> {
  const ready = await prepare(ctx);
  if (!ready.ok) return ready.result;

  try {
    const db = await admin();
    const media = await encodeImobiliareImages({
      admin: db,
      organizationId: ctx.organizationId,
      propertyId: ref.propertyId,
    });

    const payload = await buildImobiliarePayload({
      admin: db,
      session: ready.session,
      organizationId: ctx.organizationId,
      propertyId: ref.propertyId,
      catalog: ready.catalog,
      imageCount: media.images.length,
    });
    if (!payload.ok) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: payload.reasons.join(" "),
        detail: "eligibility",
      };
    }

    const warnings = [...media.warnings, ...payload.warnings];

    if (!ctx.allowLiveRequests) {
      return {
        ok: true,
        data: {
          externalId: serializeImobiliareReferences(payload.plans.map((plan) => plan.customReference)),
          live: false,
          detail: `Validare locală reușită pentru ${payload.plans.length} anunț(uri); scrierile reale sunt oprite.`,
          message: warnings.join(" "),
        },
      };
    }

    const storedReferences = parseImobiliareReferences(ref.externalId);
    const resolvedPlans = payload.plans.map((plan) => {
      const customReference = referenceForTransaction(
        storedReferences,
        plan.transaction,
        plan.customReference,
        payload.plans.length,
      );
      return {
        ...plan,
        customReference,
        listing: { ...plan.listing, custom_reference: customReference },
      };
    });
    const steps: string[] = [];
    const publicUrls: string[] = [];
    let lastHttpStatus: number | null = null;
    let lastPortalResponse: unknown = null;
    for (const plan of resolvedPlans) {
      const planMode: WriteMode = storedReferences.includes(plan.customReference) ? "update" : mode;
      const result = await withDurableImobiliareLock({
        admin: db,
        organizationId: ctx.organizationId,
        reference: plan.customReference,
        run: () =>
          withImobiliareWriteLock(`${ctx.organizationId}:${plan.customReference}`, () =>
            publishPlan({
              ctx,
              session: ready.session,
              plan,
              images: media.images,
              mode: planMode,
            }),
          ),
      });
      if (!result.ok) return result.fail;
      steps.push(`${plan.customReference}: ${result.steps.join(" → ")}`);
      if (result.publicUrl) publicUrls.push(result.publicUrl);
      lastHttpStatus = result.httpStatus;
      lastPortalResponse = result.portalResponse;
    }

    return {
      ok: true,
      data: {
        externalId: serializeImobiliareReferences(resolvedPlans.map((plan) => plan.customReference)),
        live: true,
        detail: steps.join("; "),
        // „online” la portal = „published” în starea locală (constrângere DB).
        portalStatus: mode === "update" ? "updated" : "published",
        processed: payload.plans.length,
        publicUrl: publicUrls[0] ?? null,
        message: warnings.length ? warnings.join(" ") : undefined,
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

/* -------------------------------- retragere ------------------------------- */

async function withdraw(
  ctx: PortalContext,
  ref: ListingRef,
): Promise<PortalResult<ListingOutcome>> {
  const ready = await prepare(ctx);
  if (!ready.ok) return ready.result;
  const externalIds = parseImobiliareReferences(ref.externalId);
  if (externalIds.length === 0) {
    return {
      ok: true,
      data: { externalId: null, live: false, detail: "Anunțul nu a fost publicat pe Imobiliare.ro." },
    };
  }
  if (!ctx.allowLiveRequests) {
    return {
      ok: true,
      data: { externalId: serializeImobiliareReferences(externalIds), live: false, detail: "Scrierile reale sunt oprite." },
    };
  }

  try {
    // Retragere = trecerea în draft: reversibilă, fără pierderea anunțului.
    for (const externalId of externalIds) {
      const db = await admin();
      const response = await withDurableImobiliareLock({
        admin: db,
        organizationId: ctx.organizationId,
        reference: externalId,
        run: () =>
          withImobiliareWriteLock(`${ctx.organizationId}:${externalId}`, () =>
            imobiliareAuthedRequest(ready.session, {
              method: "POST",
              path: promotionsPath(externalId),
              connectionKey: ctx.organizationId,
              body: { status: IMOBILIARE_STATUS_DRAFT },
            }),
          ),
      });
      if (!response.ok) return failFrom(response, `withdraw:${externalId}`);
    }
    return {
      ok: true,
      data: {
        externalId: serializeImobiliareReferences(externalIds),
        live: true,
        detail: "Anunțul a fost trecut în draft la Imobiliare.ro (retras din public).",
        // Starea salvată local folosește vocabularul CRM, nu al portalului.
        portalStatus: "withdrawn",
      },
    };
  } catch (error) {
    const normalized = toPortalError(error);
    return { ok: false, code: normalized.code, message: normalized.message, detail: normalized.detail };
  }
}

/** Ștergere definitivă: doar când proprietatea este ștearsă din CRM. */
export async function deleteImobiliareListing(
  ctx: PortalContext,
  externalId: string,
): Promise<PortalResult<ListingOutcome>> {
  const ready = await prepare(ctx);
  if (!ready.ok) return ready.result;
  const db = await admin();
  const externalIds = parseImobiliareReferences(externalId);
  for (const reference of externalIds) {
    const response = await withDurableImobiliareLock({
      admin: db,
      organizationId: ctx.organizationId,
      reference,
      run: () =>
        withImobiliareWriteLock(`${ctx.organizationId}:${reference}`, () =>
          imobiliareAuthedRequest(ready.session, {
            method: "DELETE",
            path: listingPath(reference),
            connectionKey: ctx.organizationId,
          }),
        ),
    });
    if (!response.ok) return failFrom(response, `delete:${reference}`);
  }
  return {
    ok: true,
    data: {
      externalId: serializeImobiliareReferences(externalIds),
      live: true,
      detail: `${externalIds.length} anunț(uri) au fost șterse definitiv de la Imobiliare.ro.`,
    },
  };
}

/**
 * Diagnoză pentru fila Publicare: citește anunțul de la portal și întoarce
 * linkul public REAL, doar dacă portalul îl raportează `online`. Astfel nu mai
 * afișăm un link salvat care redirectează către prima pagină a portalului.
 */
async function diagnose(
  ctx: PortalContext,
  ref: ListingRef,
): Promise<PortalResult<ListingDiagnostics>> {
  const references = parseImobiliareReferences(ref.externalId);
  const empty: ListingDiagnostics = {
    feedVisible: false,
    externalId: ref.externalId ?? null,
    offerUrl: null,
    agentId: null,
    agentName: null,
    images: { total: 0, resolvable: 0, broken: 0, primary: false },
    updatedAt: null,
    notes: [],
  };
  if (references.length === 0 || !ctx.allowLiveRequests) return { ok: true, data: empty };

  const ready = await prepare(ctx);
  if (!ready.ok) return { ok: true, data: empty };

  const reference = references[0]!;
  const response = await imobiliareAuthedRequest(ready.session, {
    method: "GET",
    path: listingPath(reference),
    connectionKey: ctx.organizationId,
  });
  if (!response.ok) {
    return {
      ok: true,
      data: {
        ...empty,
        notes: [`Imobiliare.ro nu a putut confirma starea anunțului (HTTP ${response.status}).`],
      },
    };
  }
  const state = imobiliareStateFromBody(response.body);
  const offerUrl = imobiliarePublicUrlFromBody(response.body);
  const notes: string[] = [];
  if (state && state !== IMOBILIARE_STATUS_ONLINE) {
    notes.push(`Anunțul este în starea „${state}” la Imobiliare.ro, deci nu are pagină publică.`);
  } else if (!offerUrl) {
    notes.push("Imobiliare.ro nu a trimis încă adresa publică a anunțului.");
  }
  return {
    ok: true,
    data: {
      ...empty,
      feedVisible: state === IMOBILIARE_STATUS_ONLINE,
      offerUrl,
      notes,
    },
  };
}

export const imobiliareAdapter: PortalAdapter = {
  id: "imobiliare_ro",
  testConnection: (ctx) => status(ctx, true),
  getStatus: (ctx) => status(ctx, false),
  publishListing: (ctx, ref) => write(ctx, ref, "create"),
  updateListing: (ctx, ref) => write(ctx, ref, "update"),
  withdrawListing: (ctx, ref) => withdraw(ctx, ref),
  diagnoseListing: (ctx, ref) => diagnose(ctx, ref),
  async sync(ctx, refs) {
    let processed = 0;
    let failed = 0;
    for (const ref of refs) {
      const result = await write(ctx, ref, "update");
      if (result.ok) processed += 1;
      else failed += 1;
    }
    return { ok: true, data: { processed, failed } };
  },
  async fetchAgents(ctx) {
    const ready = await prepare(ctx);
    if (!ready.ok) return ready.result;
    const response = await imobiliareAuthedRequest(ready.session, {
      method: "GET",
      path: IMOBILIARE_PATHS.agents,
      connectionKey: ctx.organizationId,
    });
    if (!response.ok) return failFrom(response, "fetch_agents");
    return { ok: true, data: parseAgents(response.body) };
  },
  async fetchListings() {
    return notSupported("fetch_listings");
  },
};
