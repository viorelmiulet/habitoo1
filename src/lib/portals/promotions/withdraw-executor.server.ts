/**
 * Retragerea unui serviciu de promovare de pe o ofertă, prin fluxul normal al
 * portalului (aceeași scriere pe care o face utilizatorul), folosită de worker.
 */
import { IMOBILIARE_PORTAL_KEY } from "@/lib/portals/imobiliare/config";
import { imobiliarePromotion } from "@/lib/portals/imobiliare/promotions";
import type { PromotionWithdrawActionResult } from "./withdraw.server";

export async function withdrawImobiliarePromotion(input: {
  organizationId: string;
  propertyId: string;
  serviceKey: string;
  /** `null` = dezactivare completă; un număr = coborâre la acea valoare. */
  targetAmount: number | null;
  actorId: string | null;
}): Promise<PromotionWithdrawActionResult> {
  const definition = imobiliarePromotion(input.serviceKey);
  if (!definition?.writeField) {
    return { ok: false, code: "NOT_SUPPORTED", message: "Serviciu de promovare necunoscut." };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getPortalDefinition } = await import("@/lib/portals/registry");
  const portal = getPortalDefinition(IMOBILIARE_PORTAL_KEY);
  if (!portal || portal.status !== "available") {
    return { ok: false, code: "PORTAL_ERROR", message: "Integrarea Imobiliare.ro nu este disponibilă." };
  }

  const { buildContext, logOperation } = await import("@/lib/portals.functions");
  const { row, ctx } = await buildContext(input.organizationId, portal);
  if (!row || row.activated !== true) {
    return {
      ok: false,
      code: "PORTAL_ERROR",
      message: "Imobiliare.ro nu este activat pentru această agenție.",
    };
  }

  const { data: listing } = await supabaseAdmin
    .from("portal_listings")
    .select("external_id")
    .eq("organization_id", input.organizationId)
    .eq("portal", IMOBILIARE_PORTAL_KEY)
    .eq("property_id", input.propertyId)
    .maybeSingle();
  const { parseImobiliareReferences } = await import("@/lib/portals/imobiliare/references");
  const reference = parseImobiliareReferences(listing?.external_id ?? null)[0] ?? null;
  if (!reference) {
    return {
      ok: false,
      code: "NOT_PUBLISHED",
      message: "Oferta nu mai este publicată pe Imobiliare.ro.",
    };
  }

  const { getImobiliareSession } = await import("@/lib/portals/imobiliare/auth.server");
  const session = await getImobiliareSession({
    admin: supabaseAdmin,
    organizationId: input.organizationId,
    username: ctx.externalAccountId,
    credential: ctx.portalCredential,
  });
  if (!session.ok) return { ok: false, code: "AUTH_ERROR", message: session.message };

  const { fetchImobiliareListingPromotions, setImobiliareListingPromotion } = await import(
    "@/lib/portals/imobiliare/promotions.server"
  );
  const state = await fetchImobiliareListingPromotions({
    session: session.session,
    organizationId: input.organizationId,
    reference,
  });

  const value: boolean | number =
    definition.kind === "numeric" ? Math.max(input.targetAmount ?? 0, 0) : false;

  const result = await setImobiliareListingPromotion({
    admin: supabaseAdmin,
    session: session.session,
    organizationId: input.organizationId,
    reference,
    definition,
    value,
    current: state.states.get(definition.id) ?? null,
    // Retragerea eliberează resurse: nu trece prin poarta de alocare.
    allocation: null,
  });

  await logOperation({
    organizationId: input.organizationId,
    portal: IMOBILIARE_PORTAL_KEY,
    operation: `promotion:${definition.id}:${typeof value === "number" ? value : "off"}`,
    success: result.ok,
    propertyId: input.propertyId,
    actorId: input.actorId,
    externalId: reference,
    ...(result.ok
      ? { httpStatus: result.httpStatus, portalResponse: result.portalResponse }
      : {
          errorCode: result.code,
          errorMessage: result.message,
          httpStatus: result.httpStatus ?? null,
          portalResponse: result.portalResponse ?? null,
        }),
  });

  const { invalidatePromotionUsageCache } = await import("./allocation.server");
  invalidatePromotionUsageCache(input.organizationId, definition.id);

  if (result.ok) return { ok: true };
  return {
    ok: false,
    code: result.code,
    message: result.message,
    retryAfterMs: null,
  };
}
