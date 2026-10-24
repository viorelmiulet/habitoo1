/**
 * Promovările Imobiliare.ro — stratul de rețea. Rulează EXCLUSIV server-side.
 *
 * Endpointuri:
 *   GET  /api/v3/promotions/slots/{slot_type}      inventar (total/used)
 *   GET  /api/v3/promotions/listings/{slot_type}   anunțurile care consumă slotul
 *   POST /api/v3/listings/{ref}/promotions         scriere PARȚIALĂ
 *
 * Sursa de adevăr pentru contoare este portalul: nu cache-uim cifrele în baza
 * de date și nu prezentăm valori vechi ca fiind live. Dacă un slot nu poate fi
 * citit, doar acel serviciu raportează eroare — restul rămân utilizabile.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  listingPath,
  promotionListingsPath,
  promotionSlotsPath,
  promotionsPath,
} from "./config";
import { imobiliareAuthedRequest, type ImobiliareSession } from "./auth.server";
import { withImobiliareWriteLock } from "./client.server";
import { withDurableImobiliareLock } from "./lock.server";
import {
  guardImobiliarePromotionChange,
  imobiliarePromotionPatch,
  imobiliarePromotionStateFromListing,
  imobiliarePromotionWarnings,
  manageableImobiliarePromotions,
  normalizeImobiliareSlotInventory,
  parseImobiliareSlotListings,
  IMOBILIARE_PROMOTIONS,
  IMOBILIARE_SLOT_TYPES,
  type ImobiliarePromotionDefinition,
  type ImobiliareSlotInventory,
  type ImobiliareSlotListing,
} from "./promotions";

type Admin = SupabaseClient<Database>;

/** Rezultatul citirii unui slot: fie cifrele reale, fie eroarea reală. */
export type SlotInventoryResult = {
  slotType: string;
  inventory: ImobiliareSlotInventory | null;
  error: string | null;
  /** Momentul citirii reușite; `null` dacă citirea a eșuat. */
  syncedAt: string | null;
};

function failureMessage(response: {
  status: number;
  classification: { message: string } | null;
}): string {
  return (
    response.classification?.message ||
    `Imobiliare.ro a răspuns HTTP ${response.status} la citirea locurilor de promovare.`
  );
}

export async function fetchImobiliareSlotInventory(input: {
  session: ImobiliareSession;
  organizationId: string;
  slotType: string;
}): Promise<SlotInventoryResult> {
  const response = await imobiliareAuthedRequest(input.session, {
    method: "GET",
    path: promotionSlotsPath(input.slotType),
    connectionKey: input.organizationId,
  });
  if (!response.ok) {
    return {
      slotType: input.slotType,
      inventory: null,
      error: failureMessage(response),
      syncedAt: null,
    };
  }
  const inventory = normalizeImobiliareSlotInventory(input.slotType, response.body);
  if (!inventory) {
    return {
      slotType: input.slotType,
      inventory: null,
      error: "Imobiliare.ro nu a returnat numărul de locuri pentru acest serviciu.",
      syncedAt: null,
    };
  }
  return {
    slotType: input.slotType,
    inventory,
    error: null,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Inventarul tuturor sloturilor, în paralel și cu erori IZOLATE: un endpoint
 * căzut nu blochează celelalte servicii.
 */
export async function fetchImobiliareSlotInventories(input: {
  session: ImobiliareSession;
  organizationId: string;
  slotTypes?: string[];
}): Promise<Map<string, SlotInventoryResult>> {
  const slotTypes = input.slotTypes ?? IMOBILIARE_SLOT_TYPES;
  const results = await Promise.all(
    slotTypes.map(async (slotType) => {
      try {
        return await fetchImobiliareSlotInventory({
          session: input.session,
          organizationId: input.organizationId,
          slotType,
        });
      } catch {
        return {
          slotType,
          inventory: null,
          error: "Imobiliare.ro nu a putut fi contactat pentru acest serviciu.",
          syncedAt: null,
        } satisfies SlotInventoryResult;
      }
    }),
  );
  return new Map(results.map((result) => [result.slotType, result]));
}

export type SlotListingsResult =
  | { ok: true; listings: ImobiliareSlotListing[] }
  | { ok: false; message: string };

export async function fetchImobiliareSlotListings(input: {
  session: ImobiliareSession;
  organizationId: string;
  slotType: string;
}): Promise<SlotListingsResult> {
  const response = await imobiliareAuthedRequest(input.session, {
    method: "GET",
    path: promotionListingsPath(input.slotType),
    connectionKey: input.organizationId,
  });
  if (!response.ok) return { ok: false, message: failureMessage(response) };
  return { ok: true, listings: parseImobiliareSlotListings(response.body) };
}

/**
 * Prezența unei oferte în lista unui slot (`GET /promotions/listings/{slot}`):
 * `true` = serviciul consumă un loc (activ), `false` = nu apare (inactiv),
 * `null` = lista nu a putut fi citită.
 */
export async function fetchImobiliareSlotMembership(input: {
  session: ImobiliareSession;
  organizationId: string;
  slotType: string;
  reference: string;
}): Promise<boolean | null> {
  try {
    const result = await fetchImobiliareSlotListings(input);
    if (!result.ok) return null;
    return result.listings.some((listing) => listing.reference === input.reference);
  } catch {
    return null;
  }
}

/** Starea serviciilor pentru o ofertă, citită din anunțul de la portal. */
export type ListingPromotionState = {
  states: Map<string, boolean | number | null>;
  error: string | null;
};

export async function fetchImobiliareListingPromotions(input: {
  session: ImobiliareSession;
  organizationId: string;
  reference: string;
}): Promise<ListingPromotionState> {
  const states = new Map<string, boolean | number | null>();
  const response = await imobiliareAuthedRequest(input.session, {
    method: "GET",
    path: listingPath(input.reference),
    connectionKey: input.organizationId,
  });
  if (!response.ok) {
    for (const promotion of IMOBILIARE_PROMOTIONS) states.set(promotion.id, null);
    return { states, error: failureMessage(response) };
  }
  for (const promotion of IMOBILIARE_PROMOTIONS) {
    states.set(promotion.id, imobiliarePromotionStateFromListing(response.body, promotion));
  }
  return { states, error: null };
}

export type PromotionWriteResult =
  | {
      ok: true;
      value: boolean | number;
      portalResponse: unknown;
      httpStatus: number;
      /** Avertizări tolerate (doar imoradar „nu este activ”): numai în jurnal. */
      warnings?: string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      portalResponse?: unknown;
      httpStatus?: number | null;
    };

/**
 * Comandă un serviciu pe o ofertă. Înainte de ACTIVARE, inventarul este citit
 * din nou: dacă slotul s-a consumat între afișare și apăsare, nu pretindem
 * succes. Dezactivarea nu are nevoie de inventar.
 */
export type PromotionWriteInput = {
  admin: Admin;
  session: ImobiliareSession;
  organizationId: string;
  reference: string;
  definition: ImobiliarePromotionDefinition;
  value: boolean | number;
  /** Valoarea curentă cunoscută (din citirea anunțului), pentru poarta de acces. */
  current: boolean | number | null;
  /**
   * Repartizarea agenției: oferta pentru care se comandă serviciul. `null` doar
   * acolo unde nu există o ofertă locală (teste de contract cu portalul).
   */
  allocation: { propertyId: string; skipRules?: boolean } | null;
};

/** Shared allocation and live-inventory gate for standalone and online writes. */
export async function validateImobiliareListingPromotion(input: PromotionWriteInput): Promise<{ ok: true } | Extract<PromotionWriteResult, { ok: false }>> {
  const { definition } = input;
  if (!definition.writeField) {
    return {
      ok: false,
      code: "NOT_SUPPORTED",
      message:
        definition.note ??
        `Serviciul ${definition.label} nu poate fi comandat prin API-ul Imobiliare.ro.`,
    };
  }

  // Bonus capacity belongs to the portal: no local allocation or inventory gate.
  if (definition.id === "bonus") return { ok: true };

  const activating =
    definition.kind === "numeric"
      ? Math.trunc(Number(input.value) || 0) >
        (typeof input.current === "number" ? input.current : 0)
      : input.value === true && input.current !== true;

  // Regulile agenției (serviciu activat, alocarea agentului, plafonul agenției)
  // se aplică AICI, în locul unic care comandă o promovare.
  if (input.allocation && !input.allocation.skipRules) {
    const { ensureImobiliarePromotionAllowed } = await import(
      "@/lib/portals/promotions/allocation.server"
    );
    const allowed = await ensureImobiliarePromotionAllowed({
      admin: input.admin,
      session: input.session,
      organizationId: input.organizationId,
      propertyId: input.allocation.propertyId,
      definition,
      current: input.current,
      next: input.value,
    });
    if (!allowed.ok) {
      return { ok: false, code: "ALLOCATION_ERROR", message: allowed.message };
    }
  }

  let inventory: ImobiliareSlotInventory | null = null;
  if (activating && definition.slotType) {
    // Revalidare la momentul acțiunii: contoarele se schimbă între afișări.
    const fresh = await fetchImobiliareSlotInventory({
      session: input.session,
      organizationId: input.organizationId,
      slotType: definition.slotType,
    });
    inventory = fresh.inventory;
    if (fresh.error && !fresh.inventory) {
      return { ok: false, code: "PORTAL_ERROR", message: fresh.error };
    }
  }


  const guard = guardImobiliarePromotionChange({
    definition,
    inventory,
    current: input.current,
    next: input.value,
  });
  if (!guard.allowed) {
    return { ok: false, code: "VALIDATION_ERROR", message: guard.reason };
  }

  return { ok: true };
}

export async function setImobiliareListingPromotion(input: PromotionWriteInput): Promise<PromotionWriteResult> {
  const allowed = await validateImobiliareListingPromotion(input);
  if (!allowed.ok) return allowed;
  const body = imobiliarePromotionPatch(input.definition, input.value);
  const response = await withDurableImobiliareLock({
    admin: input.admin,
    organizationId: input.organizationId,
    reference: input.reference,
    run: () =>
      withImobiliareWriteLock(`${input.organizationId}:${input.reference}:promotions`, () =>
        imobiliareAuthedRequest(input.session, {
          method: "POST",
          path: promotionsPath(input.reference),
          connectionKey: input.organizationId,
          body,
        }),
      ),
  });

  if (!response.ok) {
    return {
      ok: false,
      code: response.classification?.code ?? "PORTAL_ERROR",
      message: failureMessage(response),
      portalResponse: response.body ?? null,
      httpStatus: response.status,
    };
  }

  return confirmImobiliareListingPromotion(input, response);
}

/** Persist only this service's warning-free (or tolerated imoradar) confirmation. */
export async function confirmImobiliareListingPromotion(
  input: PromotionWriteInput,
  response: { body: unknown; status: number },
  serviceWarnings = imobiliarePromotionWarnings(response.body),
): Promise<PromotionWriteResult> {
  const { definition } = input;
  const body = imobiliarePromotionPatch(definition, input.value);
  if (!definition.writeField) return { ok: false, code: "NOT_SUPPORTED", message: "Serviciu fără câmp de scriere." };
  // HTTP 200 NU înseamnă aplicare: `promotion_warnings` (ex. „Promovare
  // imoradar nu este activ pentru acest cont") transformă operația în eșec,
  // cu textul exact al portalului.
  const warnings = serviceWarnings;
  const { classifyPromotionWarnings, IMORADAR_PROMOTION_ID } = await import("./imoradar-auto");
  const warningCheck = classifyPromotionWarnings(definition.id, warnings);
  if (warningCheck.fail) {
    return {
      ok: false,
      code: "PROMOTION_WARNING",
      message: warnings.join(" "),
      portalResponse: response.body ?? null,
      httpStatus: response.status,
    };
  }

  const value = body.promotions[definition.writeField];
  const confirmed = value ?? input.value;

  // Răspunsul nu include starea promovărilor (`data` nu are cheia
  // `promotions`), deci salvăm local rezultatul scrierii fără avertizări:
  // aceasta devine ultima stare cunoscută, afișată când portalul nu raportează.
  if (input.allocation) {
    try {
      await input.admin
        .from("imobiliare_promotion_states")
        .upsert(
          {
            organization_id: input.organizationId,
            property_id: input.allocation.propertyId,
            reference: input.reference,
            promotion_id: definition.id,
            value_boolean: definition.kind === "numeric" ? null : confirmed === true,
            value_numeric:
              definition.kind === "numeric"
                ? Math.max(Math.trunc(Number(confirmed) || 0), 0)
                : null,
            ...(definition.id === IMORADAR_PROMOTION_ID
              ? {
                  // Orice oprire scrisă este manuală: automatizarea scrie doar `true`.
                  manually_stopped: confirmed !== true,
                  last_warning: warningCheck.tolerated.length ? warningCheck.tolerated.join(" ") : null,
                }
              : {}),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,property_id,promotion_id" },
        );
    } catch {
      // Starea locală este un ajutor de afișare; o eroare aici nu anulează
      // rezultatul confirmat de portal.
    }
  }

  return {
    ok: true,
    value: confirmed,
    portalResponse: response.body ?? null,
    httpStatus: response.status,
    ...(warningCheck.tolerated.length ? { warnings: warningCheck.tolerated } : {}),
  };
}

export { manageableImobiliarePromotions };
