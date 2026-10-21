/**
 * imoradar24 automat — stratul server. Trimite DOAR `promote_imoradar = true`;
 * nu atinge alte promovări și nu republică anunțul.
 */
import { IMOBILIARE_PORTAL_KEY } from "./config";
import { imobiliarePromotion } from "./promotions";
import {
  IMORADAR_PROMOTION_ID,
  IMORADAR_SKIP_MESSAGE,
  readAutoImoradarSetting,
  shouldAutoSendImoradar,
  type ImoradarLocalState,
} from "./imoradar-auto";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

export async function loadImoradarContext(admin: Admin, organizationId: string, propertyId: string) {
  const [{ data: connection }, { data: publication }, { data: state }] = await Promise.all([
    admin.from("portal_connections").select("settings").eq("organization_id", organizationId).eq("portal", IMOBILIARE_PORTAL_KEY).maybeSingle(),
    admin.from("portal_publications").select("imoradar_opt_out").eq("organization_id", organizationId).eq("property_id", propertyId).eq("portal_key", IMOBILIARE_PORTAL_KEY).maybeSingle(),
    admin.from("imobiliare_promotion_states").select("value_boolean, manually_stopped").eq("organization_id", organizationId).eq("property_id", propertyId).eq("promotion_id", IMORADAR_PROMOTION_ID).maybeSingle(),
  ]);
  const local: ImoradarLocalState = state
    ? { value: state.value_boolean ?? null, manuallyStopped: state.manually_stopped === true }
    : null;
  return {
    settingOn: readAutoImoradarSetting(connection?.settings),
    optOut: publication?.imoradar_opt_out === true,
    state: local,
  };
}

/** Scrierea propriu-zisă + jurnal. Folosită de publicare și de acțiunea unică. */
export async function sendImoradar(input: {
  organizationId: string;
  propertyId: string;
  actorId: string | null;
  operation: string;
}): Promise<{ ok: boolean; message: string; code?: string | null; httpStatus?: number | null }> {
  const definition = imobiliarePromotion(IMORADAR_PROMOTION_ID)!;
  const { prepare } = await import("@/lib/portals/imobiliare-promotions.functions");
  const { logOperation } = await import("@/lib/portals.functions");
  const prepared = await prepare(input.organizationId, input.propertyId);
  if (!prepared.ok) return { ok: false, message: prepared.view.message ?? "imoradar24 nu este disponibil." };
  const { setImobiliareListingPromotion } = await import("./promotions.server");
  const started = Date.now();
  const result = await setImobiliareListingPromotion({
    admin: prepared.admin,
    session: prepared.session,
    organizationId: input.organizationId,
    reference: prepared.reference,
    definition,
    value: true,
    current: null,
    // Serviciu gratuit, aprobat prin setarea agenției: fără plafon de alocare.
    allocation: { propertyId: input.propertyId, skipRules: true },
  });
  await logOperation({
    organizationId: input.organizationId,
    portal: IMOBILIARE_PORTAL_KEY,
    operation: input.operation,
    success: result.ok,
    propertyId: input.propertyId,
    actorId: input.actorId,
    externalId: prepared.reference,
    durationMs: Date.now() - started,
    ...(result.ok
      ? {
          httpStatus: result.httpStatus,
          portalResponse: result.portalResponse,
          ...(result.warnings?.length
            ? { errorCode: "PROMOTION_WARNING", errorMessage: result.warnings.join(" ") }
            : {}),
        }
      : {
          errorCode: result.code,
          errorMessage: result.message,
          httpStatus: result.httpStatus ?? null,
          portalResponse: result.portalResponse ?? null,
        }),
  });
  return result.ok
    ? { ok: true, message: "imoradar24 pornit." }
    : { ok: false, message: result.message, code: result.code, httpStatus: result.httpStatus ?? null };
}

/** După o publicare reușită pe Imobiliare.ro. Nu aruncă niciodată. */
export async function autoImoradarAfterListingAction(admin: Admin, input: {
  organizationId: string;
  propertyId: string;
  actorId: string | null;
  action: "publish" | "update" | "withdraw";
  ok: boolean;
}): Promise<boolean> {
  try {
    if (input.action !== "publish" || !input.ok) return false;
    const ctx = await loadImoradarContext(admin, input.organizationId, input.propertyId);
    if (!shouldAutoSendImoradar({ ...input, ...ctx })) return false;
    const res = await sendImoradar({ ...input, operation: "promotion:promote_imoradar:auto" });
    return res.ok;
  } catch (error) {
    console.error("[imoradar-auto] trimiterea a eșuat", String(error).slice(0, 200));
    return false;
  }
}

/** Job din acțiunea unică: reverifică starea, apoi trimite doar imoradar. */
export async function runImoradarBackfillJob(admin: Admin, job: {
  organization_id: string; property_id: string; requested_by: string;
}) {
  const ctx = await loadImoradarContext(admin, job.organization_id, job.property_id);
  const skip = ctx.state?.manuallyStopped
    ? IMORADAR_SKIP_MESSAGE.manually_stopped
    : ctx.state?.value === true
      ? IMORADAR_SKIP_MESSAGE.already_on
      : ctx.optOut
        ? IMORADAR_SKIP_MESSAGE.opted_out
        : null;
  if (skip) {
    return { portalId: IMOBILIARE_PORTAL_KEY, portalName: "imoradar24", ok: true, action: "skipped", message: skip };
  }
  const res = await sendImoradar({
    organizationId: job.organization_id,
    propertyId: job.property_id,
    actorId: job.requested_by,
    operation: "promotion:promote_imoradar:bulk",
  });
  return {
    portalId: IMOBILIARE_PORTAL_KEY, portalName: "imoradar24", ok: res.ok,
    action: res.ok ? "imoradar" : "blocked", message: res.message,
    code: res.code ?? null, httpStatus: res.httpStatus ?? null,
  };
}
