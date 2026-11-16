import { IMOBILIARE_PROMOTIONS, imobiliarePromotionWarnings, type ImobiliarePromotionDefinition } from "./promotions";

const normalized = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Attribute named warnings per service; ambiguous warnings must not confirm a service. */
export function warningsForImobiliareService(body: unknown, definition: ImobiliarePromotionDefinition): string[] {
  return imobiliarePromotionWarnings(body).filter(message => {
    const text = normalized(message);
    const matches = IMOBILIARE_PROMOTIONS.filter(service =>
      [service.label, service.writeField, service.id === "promote_imoradar" ? "imoradar" : null]
        .some(name => name && new RegExp(`\\b${normalized(name).replace(/_/g, "[ _]")}\\b`).test(text)));
    if (!matches.length) return true;
    const mostSpecific = matches.sort((a, b) => b.label.length - a.label.length)[0];
    return mostSpecific?.id === definition.id;
  });
}

export function imobiliareStandardSlotsMessage(message: string | null | undefined, bonusSelected: boolean, available: number | null | undefined): string | null {
  if (bonusSelected || !message || !/nu aveti suficiente sloturi|locurile standard imobiliare\.ro sunt ocupate/i.test(normalized(message))) return null;
  return `Locurile standard Imobiliare.ro sunt ocupate. Bifează Bonus (${available == null ? "număr indisponibil de" : Math.max(0, available)} locuri libere) sau retrage alt anunț.`;
}

/** Slot type that carries the account's standard (base) online listings. */
export const IMOBILIARE_BASE_SLOT_TYPE = "starter";

export const IMORADAR_NO_SLOTS_WARNING = "Imoradar24: fără sloturi libere; anunțul e publicat doar pe Imobiliare.ro";

const SLOTS_REFUSAL = /nu aveti suficiente sloturi|locurile standard imobiliare\.ro sunt ocupate/;

/** True when an Imobiliare.ro refusal (message or raw body) is about missing slots. */
export function isImobiliareSlotsRefusal(message: string | null | undefined, body?: unknown): boolean {
  let raw = message ?? "";
  try { raw += ` ${JSON.stringify(body ?? "")}`; } catch { /* ignore */ }
  return SLOTS_REFUSAL.test(normalized(raw));
}

type SlotCount = { total: number; used: number; available: number } | null;

export type ImobiliareSlotRefusalDecision =
  | { kind: "not_slots" }
  | { kind: "retry_without_imoradar"; missing: "imoradar"; warning: string }
  | { kind: "base_exhausted"; missing: "base"; message: string };

/**
 * After a 422 slot refusal: if the standard listings still have room and imoradar24
 * was requested, only imoradar lacks a slot → publish without it (promotions never
 * block publication). Otherwise the subscription itself is full.
 */
export function decideImobiliareSlotRefusal(input: {
  refused: boolean;
  bonusSelected: boolean;
  imoradarRequested: boolean;
  base: SlotCount;
  bonus: SlotCount;
}): ImobiliareSlotRefusalDecision {
  if (!input.refused || input.bonusSelected) return { kind: "not_slots" };
  const baseFull = input.base !== null && input.base.available <= 0;
  if (!baseFull && input.imoradarRequested) {
    return { kind: "retry_without_imoradar", missing: "imoradar", warning: IMORADAR_NO_SLOTS_WARNING };
  }
  // Base has room (or is unknown) and imoradar was not requested: the missing slot cannot be
  // identified, so the portal's own message stays.
  if (!baseFull || !input.base) return { kind: "not_slots" };
  const counts = `${input.base.used} folosite din ${input.base.total}`;
  const bonusHint = input.bonus && input.bonus.available > 0
    ? ` Sloturi Bonus libere: ${input.bonus.available} — bifează Bonus sau retrage alt anunț.`
    : " Nu sunt sloturi Bonus libere — retrage alt anunț sau mărește abonamentul.";
  return { kind: "base_exhausted", missing: "base", message: `Abonamentul Imobiliare.ro nu mai are anunțuri disponibile (${counts}).${bonusHint}` };
}
