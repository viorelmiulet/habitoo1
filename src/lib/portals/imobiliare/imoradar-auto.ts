/**
 * imoradar24 automat la Imobiliare.ro — reguli PURE.
 *
 * - Setarea agenției (`portal_connections.settings.auto_imoradar`) este
 *   bifată implicit: lipsa cheii = activă.
 * - Se trimite DOAR după o publicare reușită (`publish`), doar `promote_imoradar`.
 * - Actualizările/republicările nu repornesc serviciul; o oprire manuală nu se
 *   anulează niciodată automat.
 * - Avertizarea „Promovare imoradar nu este activ pentru acest cont” NU face
 *   operația nereușită, doar pentru `promote_imoradar`.
 */

export const IMORADAR_PROMOTION_ID = "promote_imoradar";
export const AUTO_IMORADAR_SETTING_KEY = "auto_imoradar";

const IMORADAR_INACTIVE_RE = /promovare\s+imoradar\s+nu\s+este\s+activ/i;

export function isImoradarInactiveWarning(message: string): boolean {
  return IMORADAR_INACTIVE_RE.test(message);
}

/** Setarea agenției; implicit activă. */
export function readAutoImoradarSetting(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return true;
  return (settings as Record<string, unknown>)[AUTO_IMORADAR_SETTING_KEY] !== false;
}

/**
 * Avertizările unei scrieri de promovare: `fail=true` = operația a eșuat.
 * Excepția imoradar se aplică NUMAI serviciului `promote_imoradar` și NUMAI
 * avertizării de cont inactiv; orice altă avertizare rămâne eșec.
 */
export function classifyPromotionWarnings(
  promotionId: string,
  warnings: string[],
): { fail: boolean; tolerated: string[] } {
  if (warnings.length === 0) return { fail: false, tolerated: [] };
  if (promotionId === IMORADAR_PROMOTION_ID && warnings.every(isImoradarInactiveWarning)) {
    return { fail: false, tolerated: warnings };
  }
  return { fail: true, tolerated: [] };
}

export type ImoradarLocalState = { value: boolean | null; manuallyStopped: boolean } | null;

/** Trimiterea automată după o operație pe Imobiliare.ro. */
export function shouldAutoSendImoradar(input: {
  action: "publish" | "update" | "withdraw";
  ok: boolean;
  settingOn: boolean;
  optOut: boolean;
  state: ImoradarLocalState;
}): boolean {
  if (input.action !== "publish" || !input.ok) return false;
  if (!input.settingOn || input.optOut) return false;
  if (input.state?.manuallyStopped) return false;
  if (input.state?.value === true) return false;
  return true;
}

/** Bifa din fila Publicare: setarea agenției ȘI alegerea pe anunț. */
export function imoradarCheckboxDefault(settingOn: boolean, optOut: boolean): boolean {
  return settingOn && !optOut;
}

export type ImoradarBackfillSkipReason = "already_on" | "manually_stopped" | "opted_out";

export const IMORADAR_SKIP_MESSAGE: Record<ImoradarBackfillSkipReason, string> = {
  already_on: "imoradar24 este deja pornit.",
  manually_stopped: "imoradar24 a fost oprit manual.",
  opted_out: "imoradar24 a fost debifat pe anunț.",
};

/** Acțiunea unică: ce anunțuri publicate se trimit și care se sar. */
export function selectImoradarBackfill(input: {
  listings: { property_id: string; status: string; external_id: string | null }[];
  states: { property_id: string; value_boolean: boolean | null; manually_stopped: boolean }[];
  optOuts: string[];
}): {
  queued: string[];
  skipped: { propertyId: string; reason: ImoradarBackfillSkipReason }[];
} {
  const states = new Map(input.states.map((s) => [s.property_id, s]));
  const optOuts = new Set(input.optOuts);
  const queued: string[] = [];
  const skipped: { propertyId: string; reason: ImoradarBackfillSkipReason }[] = [];
  for (const listing of input.listings) {
    if (!["published", "updated"].includes(listing.status) || !listing.external_id) continue;
    const state = states.get(listing.property_id);
    if (state?.manually_stopped) skipped.push({ propertyId: listing.property_id, reason: "manually_stopped" });
    else if (state?.value_boolean === true) skipped.push({ propertyId: listing.property_id, reason: "already_on" });
    else if (optOuts.has(listing.property_id)) skipped.push({ propertyId: listing.property_id, reason: "opted_out" });
    else queued.push(listing.property_id);
  }
  return { queued, skipped };
}

/** Pauza dintre trimiteri în lot (ritm limitat). */
export const IMORADAR_BACKFILL_SPACING_MS = 3_000;
