import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ImobiliareSession } from "./auth.server";
import { imobiliareAuthedRequest } from "./auth.server";
import { promotionsPath } from "./config";
import { imobiliarePromotion, imobiliarePromotionPatch } from "./promotions";
import { imobiliareDestinationStatus, sanitizeImobiliarePromotionChanges, type ImobiliarePromotionChanges, type ImobiliarePublicationMode } from "./card-promotions";
import { confirmImobiliareListingPromotion, fetchImobiliareListingPromotions, fetchImobiliareSlotMembership, validateImobiliareListingPromotion, type PromotionWriteInput } from "./promotions.server";
import { mergeImobiliarePromotionState } from "./promotions";
import { decideImobiliareSlotRefusal, IMOBILIARE_BASE_SLOT_TYPE, isImobiliareSlotsRefusal, warningsForImobiliareService } from "./online-promotions";
import { fetchImobiliareSlotInventories } from "./promotions.server";
import { invalidateImobiliareSlotCaches } from "./slot-cache.server";

function imoradarStatusOf(body: unknown): string | null {
  const root = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const data = root?.["data"] && typeof root["data"] === "object" ? root["data"] as Record<string, unknown> : root;
  const value = data?.["imoradar_status"];
  return typeof value === "string" ? value : null;
}

/**
 * Caller holds the same durable listing lock as publication. Both destinations go to
 * draft; the portal has been observed to keep `imoradar_status: online` after the
 * combined POST, so the state is read back and imoradar is drafted on its own if needed.
 */
export async function withdrawImobiliareDestinations(input: { session: ImobiliareSession; organizationId: string; reference: string }) {
  const request = (method: "GET" | "POST", body?: unknown) => imobiliareAuthedRequest(input.session, {
    method, path: promotionsPath(input.reference), connectionKey: input.organizationId, ...(body ? { body } : {}),
  });
  try {
    const response = await request("POST", imobiliareDestinationStatus(undefined, false));
    if (!response.ok) return response;
    let imoradarWarning: string | null = null;
    try {
      const readBack = await request("GET");
      if (readBack.ok && imoradarStatusOf(readBack.body) === "online") {
        await request("POST", { imoradar_status: "draft" });
        const again = await request("GET");
        if (!again.ok || imoradarStatusOf(again.body) === "online") {
          imoradarWarning = "Imoradar24 nu a confirmat retragerea; anunțul poate fi încă vizibil acolo.";
        }
      }
    } catch {
      // Read-back is diagnostic; the confirmed draft on Imobiliare.ro stands.
    }
    return { ...response, imoradarWarning };
  } finally {
    await invalidateImobiliareSlotCaches(input.organizationId);
  }
}

/** Called inside the listing's existing durable lock; never takes a nested lock. */
export async function publishImobiliareOnline(input: {
  admin: SupabaseClient<Database>; session: ImobiliareSession; organizationId: string;
  propertyId: string; reference: string; actorId: string | null; changes: ImobiliarePromotionChanges;
  mode?: ImobiliarePublicationMode;
}) {
  // Unknown or malformed promotions never block publication: they become warnings.
  const sanitized = sanitizeImobiliarePromotionChanges(input.mode === "imoradar_only" ? {} : input.changes);
  const changes = sanitized.changes;
  const skipped: { promotionId: string; message: string }[] = [...sanitized.skipped];
  const entries: PromotionWriteInput[] = [];
  const promotions: Record<string, boolean | number> = {};
  if (Object.keys(changes).length) {
    const [listing, local] = await Promise.all([
      fetchImobiliareListingPromotions(input),
      input.admin.from("imobiliare_promotion_states").select("promotion_id, value_boolean, value_numeric")
        .eq("organization_id", input.organizationId).eq("property_id", input.propertyId),
    ]);
    for (const [id, value] of Object.entries(changes)) {
      const definition = imobiliarePromotion(id);
      if (!definition?.writeField) continue;
      const membership = id !== "bonus" && definition.slotType && definition.kind === "boolean"
        ? await fetchImobiliareSlotMembership({ ...input, slotType: definition.slotType }) : null;
      const saved = local.data?.find(row => row.promotion_id === id);
      const current = mergeImobiliarePromotionState({ fromListing: listing.states.get(id) ?? null,
        fromSlotList: membership, fromLocal: saved?.value_numeric ?? saved?.value_boolean ?? null }).value;
      const entry: PromotionWriteInput = { ...input, definition, value, current,
        allocation: { propertyId: input.propertyId, ...(id === "promote_imoradar" ? { skipRules: true } : {}) } };
      const allowed = await validateImobiliareListingPromotion(entry);
      if (!allowed.ok) { skipped.push({ promotionId: id, message: allowed.message }); continue; }
      entries.push(entry);
      Object.assign(promotions, imobiliarePromotionPatch(definition, value).promotions);
    }
  }
  const started = Date.now();
  let response = await imobiliareAuthedRequest(input.session, {
    method: "POST", path: promotionsPath(input.reference), connectionKey: input.organizationId,
    body: { ...imobiliareDestinationStatus(input.mode), ...(entries.length ? { promotions } : {}) },
  });
  if (!response.ok && isImobiliareSlotsRefusal(response.classification?.message, response.body)) {
    const slots = await resolveImobiliareSlotRefusal({ ...input, response, entries, promotions, started });
    response = slots.response;
    entries.splice(0, entries.length, ...slots.entries);
    skipped.push(...slots.warnings);
  }
  await invalidateImobiliareSlotCaches(input.organizationId);
  const promotionErrors: { promotionId: string; message: string }[] = [...skipped];
  if (response.ok && entries.length) {
    const { logOperation } = await import("@/lib/portals.functions");
    const { invalidatePromotionUsageCache } = await import("../promotions/allocation.server");
    for (const entry of entries) {
      const result = await confirmImobiliareListingPromotion(entry, response, warningsForImobiliareService(response.body, entry.definition));
      await logOperation({ organizationId: input.organizationId, propertyId: input.propertyId, actorId: input.actorId,
        portal: "imobiliare_ro", externalId: input.reference,
        operation: `promotion:${entry.definition.id}:${typeof entry.value === "number" ? entry.value : entry.value ? "on" : "off"}`,
        success: result.ok, httpStatus: response.status, portalResponse: response.body, durationMs: Date.now() - started,
        ...(result.ok ? (result.warnings?.length ? { errorCode: "PROMOTION_WARNING", errorMessage: result.warnings.join(" ") } : {})
          : { errorCode: result.code, errorMessage: result.message }),
      }).catch(() => undefined);
      if (result.ok) invalidatePromotionUsageCache(input.organizationId, entry.definition.id);
      else promotionErrors.push({ promotionId: entry.definition.id, message: result.message });
    }
  }
  return { ...response, promotionErrors };
}

/**
 * Live diagnosis of a 422 slot refusal: reads the base (standard) and Bonus inventory,
 * logs which slot type is missing (no personal data) and either republishes without
 * imoradar24 or rewrites the message with the subscription's real counts.
 */
async function resolveImobiliareSlotRefusal(input: {
  admin: SupabaseClient<Database>; session: ImobiliareSession; organizationId: string; propertyId: string;
  reference: string; actorId: string | null; changes: ImobiliarePromotionChanges; mode?: ImobiliarePublicationMode;
  response: Awaited<ReturnType<typeof imobiliareAuthedRequest>>; entries: PromotionWriteInput[];
  promotions: Record<string, boolean | number>; started: number;
}): Promise<{ response: Awaited<ReturnType<typeof imobiliareAuthedRequest>>; entries: PromotionWriteInput[]; warnings: { promotionId: string; message: string }[] }> {
  await invalidateImobiliareSlotCaches(input.organizationId);
  let inventories: Awaited<ReturnType<typeof fetchImobiliareSlotInventories>> = new Map();
  try {
    inventories = await fetchImobiliareSlotInventories({ session: input.session, organizationId: input.organizationId, slotTypes: [IMOBILIARE_BASE_SLOT_TYPE, "bonus"] });
  } catch { /* unknown counts are handled by the decision */ }
  const base = inventories.get(IMOBILIARE_BASE_SLOT_TYPE)?.inventory ?? null;
  const bonus = inventories.get("bonus")?.inventory ?? null;
  const imoradarRequested = input.mode === "combined" || input.promotions["promote_imoradar"] === true;
  const decision = decideImobiliareSlotRefusal({
    refused: true, bonusSelected: input.changes["bonus"] === true, imoradarRequested, base, bonus,
  });
  const { logOperation } = await import("@/lib/portals.functions");
  await logOperation({
    organizationId: input.organizationId, propertyId: input.propertyId, actorId: input.actorId,
    portal: "imobiliare_ro", externalId: input.reference, operation: "slots_check", success: decision.kind === "retry_without_imoradar",
    httpStatus: input.response.status, durationMs: Date.now() - input.started,
    portalResponse: { missing: decision.kind === "not_slots" ? "unknown" : decision.missing,
      base: base ? { slot_type: IMOBILIARE_BASE_SLOT_TYPE, total: base.total, used: base.used } : null,
      bonus: bonus ? { total: bonus.total, used: bonus.used } : null },
    ...(decision.kind === "base_exhausted" ? { errorCode: "SLOT_LIMIT", errorMessage: decision.message } : {}),
  }).catch(() => undefined);

  if (decision.kind === "base_exhausted") {
    return { response: { ...input.response, classification: { code: input.response.classification?.code ?? "VALIDATION_ERROR", message: decision.message } } as typeof input.response, entries: input.entries, warnings: [] };
  }
  if (decision.kind !== "retry_without_imoradar") return { response: input.response, entries: input.entries, warnings: [] };

  const entries = input.entries.filter(entry => entry.definition.id !== "promote_imoradar");
  const promotions = { ...input.promotions };
  delete promotions["promote_imoradar"];
  const retry = await imobiliareAuthedRequest(input.session, {
    method: "POST", path: promotionsPath(input.reference), connectionKey: input.organizationId,
    body: { status: "online", ...(entries.length ? { promotions } : {}) },
  });
  if (retry.ok) return { response: retry, entries, warnings: [{ promotionId: "promote_imoradar", message: decision.warning }] };
  if (isImobiliareSlotsRefusal(retry.classification?.message, retry.body)) {
    // Standard slots are also full after all: report the subscription's counts.
    const full = decideImobiliareSlotRefusal({ refused: true, bonusSelected: false, imoradarRequested: false, base, bonus });
    if (full.kind === "base_exhausted") {
      return { response: { ...retry, classification: { code: retry.classification?.code ?? "VALIDATION_ERROR", message: full.message } } as typeof retry, entries, warnings: [] };
    }
  }
  return { response: retry, entries, warnings: [] };
}
