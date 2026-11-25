/**
 * Unitățile unui ansamblu preiau locația ansamblului când acesta are locația completă
 * (județ, localitate, poziție pe hartă). Aceeași regulă ca triggerul din baza de date
 * `properties_a_development_location` / `development_location_complete`.
 */
export type DevelopmentLocation = {
  name?: string | null;
  county?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
};

const filled = (v: string | null | undefined) => typeof v === "string" && v.trim() !== "";

export function isDevelopmentLocationComplete(d: DevelopmentLocation | null | undefined): boolean {
  return Boolean(d && filled(d.county) && filled(d.city) && typeof d.lat === "number" && typeof d.lng === "number");
}

/** Unitatea preia locația: este legată de un ansamblu încărcat care are locația completă. */
export function unitInheritsLocation(developmentId: string | null | undefined, d: (DevelopmentLocation & { id?: string }) | null | undefined): boolean {
  return Boolean(developmentId) && Boolean(d) && (d!.id === undefined || d!.id === developmentId) && isDevelopmentLocationComplete(d);
}

export const UNIT_LOCATION_AI_FIELDS = ["city", "district", "address"] as const;

/** Propunerile AI de localitate, zonă și adresă nu se aplică unei unități care preia locația. */
export function withoutInheritedLocation<T extends { values: Record<string, unknown> }>(proposal: T, inherits: boolean): T {
  if (!inherits) return proposal;
  const values = { ...proposal.values };
  for (const k of UNIT_LOCATION_AI_FIELDS) delete values[k];
  return { ...proposal, values } as T;
}

export const inheritedLocationNote = (name: string) => `Locația este preluată de la ansamblul «${name}». Se modifică din pagina ansamblului.`;
export const incompleteDevelopmentNote = (name: string) => `Ansamblul «${name}» nu are locația completă (județ, localitate și poziție pe hartă). Până o completezi, anunțul își păstrează locația proprie.`;
export const inheritedLocationReadNote = (name: string) => `Preluată de la ansamblul «${name}»`;
export const LINK_LOCATION_WARNING = "La salvare, locația acestui anunț va fi înlocuită cu cea a ansamblului.";
export const DEVELOPMENT_LOCATION_NOTE = "Locația se aplică tuturor anunțurilor din ansamblu.";
export const DEVELOPMENT_LOCATION_INCOMPLETE = "Completează județul, localitatea și poziția pe hartă ca anunțurile să preia locația.";
