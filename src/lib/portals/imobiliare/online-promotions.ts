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