/**
 * Server functions pentru administrarea promovărilor Imobiliare.ro pe ofertă.
 *
 * Reguli:
 *  - accesul respectă exact regulile portalurilor (agenția din sesiune, iar
 *    Superadminul lucrează pe agenția indicată explicit);
 *  - tokenurile OAuth rămân server-side: nu sunt returnate niciodată către UI;
 *  - contoarele de sloturi vin LIVE de la portal, nu din baza locală;
 *  - fiecare modificare reală este jurnalizată în `portal_operation_logs` și
 *    se declanșează numai la acțiunea explicită a utilizatorului.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { getPortalDefinition } from "@/lib/portals/registry";
import {
  buildContext,
  logOperation,
  resolvePublishingOrg,
  assertPortalPropertyAccess,
  type AuthContext,
} from "@/lib/portals.functions";
import { IMOBILIARE_PORTAL_KEY } from "@/lib/portals/imobiliare/config";
import {
  IMOBILIARE_PROMOTIONS,
  imobiliareEnergyCeiling,
  imobiliarePromotion,
  type ImobiliarePromotionKind,
  type ImobiliarePromotionSource,
} from "@/lib/portals/imobiliare/promotions";

export type ImobiliarePromotionRow = {
  id: string;
  label: string;
  kind: ImobiliarePromotionKind;
  source: ImobiliarePromotionSource;
  /** `false` = doar informativ (portalul nu confirmă un câmp de comandă). */
  manageable: boolean;
  slotType: string | null;
  /** Contoarele reale; `null` când portalul nu le-a putut furniza. */
  total: number | null;
  used: number | null;
  available: number | null;
  /** Starea serviciului pe această ofertă; `null` = necunoscută. */
  value: boolean | number | null;
  /** Limita superioară pentru serviciile numerice (Energy). */
  max: number | null;
  /** Eroarea specifică acestui serviciu, fără să blocheze celelalte. */
  error: string | null;
  syncedAt: string | null;
  note: string | null;
  /** Alocarea agentului responsabil; `null` = nelimitat în limita agenției. */
  allocated: number | null;
  /** Cât a folosit deja; `null` = nu a putut fi calculat acum. */
  usedByAgent: number | null;
  /** Cât i-a mai rămas; `null` = nelimitat sau necunoscut. */
  remaining: number | null;
};

export type ImobiliarePromotionsView = {
  /** `false` = portalul nu este configurat/activ pentru agenție. */
  available: boolean;
  /** Referința anunțului la Imobiliare.ro; `null` = oferta nu e publicată acolo. */
  reference: string | null;
  message: string | null;
  /** Eroarea citirii stării ofertei (nu a inventarului). */
  listingError: string | null;
  promotions: ImobiliarePromotionRow[];
  syncedAt: string | null;
  /** `true` = portalul nu a raportat starea NICIUNUI serviciu pe această ofertă. */
  stateUnreported: boolean;
};

function emptyView(message: string): ImobiliarePromotionsView {
  return {
    available: false,
    reference: null,
    message,
    listingError: null,
    promotions: [],
    syncedAt: null,
  };
}

type Prepared =
  | {
      ok: true;
      reference: string;
      session: import("@/lib/portals/imobiliare/auth.server").ImobiliareSession;
      admin: Awaited<ReturnType<typeof loadAdmin>>;
    }
  | { ok: false; view: ImobiliarePromotionsView };

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Sesiune + referința anunțului, cu izolare strictă pe agenție. */
async function prepare(organizationId: string, propertyId: string): Promise<Prepared> {
  const definition = getPortalDefinition(IMOBILIARE_PORTAL_KEY);
  if (!definition || definition.status !== "available") {
    return { ok: false, view: emptyView("Integrarea Imobiliare.ro nu este disponibilă.") };
  }

  const admin = await loadAdmin();
  const { data: property } = await admin
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!property) throw new Error("Proprietatea nu a fost găsită.");

  const { row, ctx } = await buildContext(organizationId, definition);
  if (!row || row.activated !== true) {
    return {
      ok: false,
      view: emptyView("Imobiliare.ro nu este activat pentru această agenție."),
    };
  }

  const { data: listing } = await admin
    .from("portal_listings")
    .select("external_id")
    .eq("organization_id", organizationId)
    .eq("portal", IMOBILIARE_PORTAL_KEY)
    .eq("property_id", propertyId)
    .maybeSingle();

  const { parseImobiliareReferences } = await import("@/lib/portals/imobiliare/references");
  const references = parseImobiliareReferences(listing?.external_id ?? null);
  const reference = references[0] ?? null;
  if (!reference) {
    return {
      ok: false,
      view: emptyView(
        "Oferta nu este încă publicată pe Imobiliare.ro. Publică-o pentru a putea administra promovările.",
      ),
    };
  }

  const { getImobiliareSession } = await import("@/lib/portals/imobiliare/auth.server");
  const session = await getImobiliareSession({
    admin,
    organizationId,
    username: ctx.externalAccountId,
    credential: ctx.portalCredential,
  });
  if (!session.ok) return { ok: false, view: emptyView(session.message) };

  return { ok: true, reference, session: session.session, admin };
}

export const getImobiliarePromotions = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ImobiliarePromotionsView> => {
    const { organizationId, agentOnly } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    await assertPortalPropertyAccess({
      organizationId,
      propertyId: data.propertyId,
      agentOnly,
      userId: context.userId,
    });
    const prepared = await prepare(organizationId, data.propertyId);
    if (!prepared.ok) return prepared.view;

    const { fetchImobiliareSlotInventories, fetchImobiliareListingPromotions } = await import(
      "@/lib/portals/imobiliare/promotions.server"
    );
    const [inventories, listingState] = await Promise.all([
      fetchImobiliareSlotInventories({
        session: prepared.session,
        organizationId,
      }),
      fetchImobiliareListingPromotions({
        session: prepared.session,
        organizationId,
        reference: prepared.reference,
      }),
    ]);

    const promotions: ImobiliarePromotionRow[] = IMOBILIARE_PROMOTIONS.map((definition) => {
      const slot = definition.slotType ? inventories.get(definition.slotType) : undefined;
      const inventory = slot?.inventory ?? null;
      const value = listingState.states.get(definition.id) ?? null;
      const current = typeof value === "number" ? value : 0;
      return {
        id: definition.id,
        label: definition.label,
        kind: definition.kind,
        source: definition.source,
        manageable: definition.writeField !== null,
        slotType: definition.slotType,
        total: inventory?.total ?? null,
        used: inventory?.used ?? null,
        available: inventory?.available ?? null,
        value,
        max:
          definition.kind === "numeric" ? imobiliareEnergyCeiling(inventory, current) : null,
        error: slot?.error ?? null,
        syncedAt: slot?.syncedAt ?? null,
        note: definition.note ?? null,
      };
    });

    const syncedAt = promotions
      .map((row) => row.syncedAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null;

    return {
      available: true,
      reference: prepared.reference,
      message: null,
      listingError: listingState.error,
      promotions,
      syncedAt,
    };
  });

export type ImobiliarePromotionActionResult = {
  ok: boolean;
  message: string;
  /** Valoarea confirmată după scriere, când operațiunea a reușit. */
  value?: boolean | number;
};

export const setImobiliarePromotion = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        propertyId: z.string().uuid(),
        promotionId: z.string().min(1).max(64),
        value: z.union([z.boolean(), z.number().int().min(0).max(10_000)]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ImobiliarePromotionActionResult> => {
    const { organizationId, agentOnly } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    await assertPortalPropertyAccess({
      organizationId,
      propertyId: data.propertyId,
      agentOnly,
      userId: context.userId,
    });
    const definition = imobiliarePromotion(data.promotionId);
    if (!definition) return { ok: false, message: "Serviciu de promovare necunoscut." };

    const prepared = await prepare(organizationId, data.propertyId);
    if (!prepared.ok) {
      return { ok: false, message: prepared.view.message ?? "Promovarea nu este disponibilă." };
    }

    const { fetchImobiliareListingPromotions, setImobiliareListingPromotion } = await import(
      "@/lib/portals/imobiliare/promotions.server"
    );
    const state = await fetchImobiliareListingPromotions({
      session: prepared.session,
      organizationId,
      reference: prepared.reference,
    });

    const result = await setImobiliareListingPromotion({
      admin: prepared.admin,
      session: prepared.session,
      organizationId,
      reference: prepared.reference,
      definition,
      value: data.value,
      current: state.states.get(definition.id) ?? null,
      allocation: { propertyId: data.propertyId },
    });


    const operation = `promotion:${definition.id}:${
      typeof data.value === "number" ? data.value : data.value ? "on" : "off"
    }`;
    await logOperation({
      organizationId,
      portal: IMOBILIARE_PORTAL_KEY,
      operation,
      success: result.ok,
      propertyId: data.propertyId,
      actorId: (context as unknown as { userId: string }).userId,
      externalId: prepared.reference,
      ...(result.ok
        ? { httpStatus: result.httpStatus, portalResponse: result.portalResponse }
        : {
            errorCode: result.code,
            errorMessage: result.message,
            httpStatus: result.httpStatus ?? null,
            portalResponse: result.portalResponse ?? null,
          }),
    });

    if (!result.ok) return { ok: false, message: result.message };
    return {
      ok: true,
      message:
        definition.kind === "numeric"
          ? `${definition.label}: valoarea ${result.value} a fost trimisă la Imobiliare.ro.`
          : result.value === true
            ? `${definition.label} a fost activat la Imobiliare.ro.`
            : `${definition.label} a fost dezactivat la Imobiliare.ro.`,
      value: result.value,
    };
  });

export type ImobiliareSlotListingRow = {
  reference: string | null;
  listingId: string | null;
  title: string | null;
  url: string | null;
  /** `true` dacă anunțul este chiar oferta din care s-a deschis lista. */
  isCurrent: boolean;
};

export const getImobiliareSlotListings = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        propertyId: z.string().uuid(),
        promotionId: z.string().min(1).max(64),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; message: string | null; listings: ImobiliareSlotListingRow[] }> => {
      const { organizationId, agentOnly } = await resolvePublishingOrg(
        context as unknown as AuthContext,
        data.organizationId,
      );
      await assertPortalPropertyAccess({
        organizationId,
        propertyId: data.propertyId,
        agentOnly,
        userId: context.userId,
      });
      const definition = imobiliarePromotion(data.promotionId);
      if (!definition?.slotType) {
        return {
          ok: false,
          message: "Acest serviciu nu are locuri urmăribile la Imobiliare.ro.",
          listings: [],
        };
      }
      const prepared = await prepare(organizationId, data.propertyId);
      if (!prepared.ok) {
        return { ok: false, message: prepared.view.message, listings: [] };
      }
      const { fetchImobiliareSlotListings } = await import(
        "@/lib/portals/imobiliare/promotions.server"
      );
      const result = await fetchImobiliareSlotListings({
        session: prepared.session,
        organizationId,
        slotType: definition.slotType,
      });
      if (!result.ok) return { ok: false, message: result.message, listings: [] };
      return {
        ok: true,
        message: null,
        listings: result.listings.map((listing) => ({
          ...listing,
          isCurrent: listing.reference === prepared.reference,
        })),
      };
    },
  );
