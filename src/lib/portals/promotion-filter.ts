/**
 * Filtrul „Promovare” din lista de proprietăți — logica pură, fără DB.
 *
 * Opțiunile se construiesc DIN REGISTRU: serviciile Imobiliare.ro care se pot
 * porni din Habitoo (`manageableImobiliarePromotions`, doar cele cu writeField)
 * și portalurile cu `supports_promoted_flag` (ex. Romimo/Publi24). Un portal
 * nou cu promovări apare automat în filtru odată adăugat în registru.
 *
 * Sursa datelor: starea locală `imobiliare_promotion_states` (doar servicii
 * pornite: true / valoare > 0) și flagul `portal_publications.promoted`.
 * Contează doar anunțurile PUBLICATE pe portalul respectiv.
 */
import { PORTALS, portalDisplayName } from "@/lib/portals/registry";
import { manageableImobiliarePromotions } from "@/lib/portals/imobiliare/promotions";

/** Valori speciale ale filtrului (nu aparțin unui portal). */
export const PROMOTION_FILTER_ANY = "any";
export const PROMOTION_FILTER_NONE = "none";

export type PromotionFilterOption = { value: string; label: string };
export type PromotionFilterGroup = {
  portalId: string;
  portalName: string;
  options: PromotionFilterOption[];
};

/**
 * Grupele de opțiuni pentru portalurile conectate ale agenției. Ordinea:
 * Imobiliare.ro (serviciile gestionabile), apoi portalurile cu flag „Promovat”.
 */
export function promotionFilterGroups(
  connectedPortalIds: ReadonlySet<string>,
): PromotionFilterGroup[] {
  const groups: PromotionFilterGroup[] = [];
  if (connectedPortalIds.has("imobiliare_ro")) {
    groups.push({
      portalId: "imobiliare_ro",
      portalName: portalDisplayName("imobiliare_ro"),
      options: manageableImobiliarePromotions().map((promotion) => ({
        value: `imobiliare_ro:${promotion.id}`,
        label: promotion.label,
      })),
    });
  }
  for (const portal of PORTALS) {
    if (portal.supports_promoted_flag === true && connectedPortalIds.has(portal.id)) {
      groups.push({
        portalId: portal.id,
        portalName: portalDisplayName(portal.id),
        options: [{ value: `${portal.id}:promoted`, label: "Promovat" }],
      });
    }
  }
  return groups;
}

export type PromotionSelection = {
  any: boolean;
  none: boolean;
  /** Id-uri de servicii Imobiliare.ro selectate (ex. "tl", "bonus"). */
  imobiliareServices: string[];
  /** Portaluri cu flag „Promovat” selectate (ex. "romimo"). */
  flagPortals: string[];
};

const EMPTY_SELECTION: PromotionSelection = {
  any: false,
  none: false,
  imobiliareServices: [],
  flagPortals: [],
};

/** Valorile din URL (separate prin virgulă) → selecție structurată. */
export function parsePromotionSelection(raw: string): PromotionSelection {
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  const selection: PromotionSelection = { ...EMPTY_SELECTION, imobiliareServices: [], flagPortals: [] };
  for (const value of values) {
    if (value === PROMOTION_FILTER_ANY) selection.any = true;
    else if (value === PROMOTION_FILTER_NONE) selection.none = true;
    else if (value.startsWith("imobiliare_ro:")) {
      const service = value.slice("imobiliare_ro:".length);
      if (service && !selection.imobiliareServices.includes(service)) {
        selection.imobiliareServices.push(service);
      }
    } else if (value.endsWith(":promoted")) {
      const portal = value.slice(0, -":promoted".length);
      if (portal && !selection.flagPortals.includes(portal)) selection.flagPortals.push(portal);
    }
  }
  return selection;
}

export function promotionSelectionIsEmpty(selection: PromotionSelection): boolean {
  return (
    !selection.any &&
    !selection.none &&
    selection.imobiliareServices.length === 0 &&
    selection.flagPortals.length === 0
  );
}

/** O stare de promovare contează doar dacă e pornită: true sau valoare > 0. */
export function promotionStateActive(
  valueBoolean: boolean | null,
  valueNumeric: number | null,
): boolean {
  if (valueBoolean === true) return true;
  if (typeof valueNumeric === "number" && valueNumeric > 0) return true;
  return false;
}

/** Ce știm despre promovările unei proprietăți (doar anunțuri publicate). */
export type PropertyPromotionInfo = {
  /** Anunțul e publicat pe Imobiliare.ro. */
  imobiliarePublished: boolean;
  /** Servicii Imobiliare.ro pornite pe acest anunț. */
  imobiliareActiveServices: string[];
  /** Flag „Promovat” pe portalurile cu `supports_promoted_flag`. */
  flagPromotions: { portalId: string; published: boolean; promoted: boolean }[];
};

export function propertyHasAnyPromotion(info: PropertyPromotionInfo): boolean {
  if (info.imobiliarePublished && info.imobiliareActiveServices.length > 0) return true;
  return info.flagPromotions.some((flag) => flag.published && flag.promoted);
}

/**
 * Potrivirea unei proprietăți cu selecția filtrului. Selecțiile multiple se
 * combină cu SAU; „Fără promovare” se aplică doar singură (interfața o face
 * exclusivă, dar funcția e defensivă).
 */
export function propertyMatchesPromotion(
  info: PropertyPromotionInfo,
  selection: PromotionSelection,
): boolean {
  if (promotionSelectionIsEmpty(selection)) return true;
  if (
    selection.none &&
    !selection.any &&
    selection.imobiliareServices.length === 0 &&
    selection.flagPortals.length === 0
  ) {
    return !propertyHasAnyPromotion(info);
  }
  if (selection.any && propertyHasAnyPromotion(info)) return true;
  if (
    info.imobiliarePublished &&
    selection.imobiliareServices.some((service) => info.imobiliareActiveServices.includes(service))
  ) {
    return true;
  }
  return selection.flagPortals.some((portalId) =>
    info.flagPromotions.some(
      (flag) => flag.portalId === portalId && flag.published && flag.promoted,
    ),
  );
}

/** Etichetele „Promovat” afișate pe rândul din listă (ex. „Imobiliare.ro · Top Listing”). */
export type PropertyPromotionBadge = { portalId: string; label: string };

export function promotionBadgesFor(info: PropertyPromotionInfo): PropertyPromotionBadge[] {
  const badges: PropertyPromotionBadge[] = [];
  if (info.imobiliarePublished) {
    const definitions = manageableImobiliarePromotions();
    for (const service of info.imobiliareActiveServices) {
      const definition = definitions.find((d) => d.id === service);
      badges.push({
        portalId: "imobiliare_ro",
        label: `${portalDisplayName("imobiliare_ro")} · ${definition?.label ?? service}`,
      });
    }
  }
  for (const flag of info.flagPromotions) {
    if (flag.published && flag.promoted) {
      badges.push({ portalId: flag.portalId, label: `${portalDisplayName(flag.portalId)} · Promovat` });
    }
  }
  return badges;
}
