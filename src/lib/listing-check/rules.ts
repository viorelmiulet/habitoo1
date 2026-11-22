/**
 * Verificarea completă a unui anunț — reguli deterministe, fără AI.
 * Pur: primește datele deja citite și întoarce nota + sugestiile. Nu scrie nimic.
 */
export type CheckSeverity = "required" | "recommended" | "optional";
export type CheckIssue = {
  code: string;
  severity: CheckSeverity;
  message: string;
  /** Câmpul vizat, în limbajul agentului. */
  field: string;
  /** Fila din fișa proprietății și id-ul elementului din formular. */
  tab: string;
  target: string | null;
};
export type CheckImage = {
  isPrimary: boolean;
  isConfidential: boolean;
  includeInPublish: boolean;
  storagePath: string | null;
  sourceUrl: string | null;
  url: string | null;
};
export type CheckPublication = { portal: string; portalName: string; enabled: boolean; lastError: string | null };
export type CheckPortalReport = { portal: string; portalName: string; missing: { label: string; requirement: string }[] };
export type ListingCheckInput = {
  property: Record<string, any>;
  images: CheckImage[];
  publications: CheckPublication[];
  portalReports: CheckPortalReport[];
  /** Mediana prețului pe m² la comparabilele din Habitoo (null = date insuficiente). */
  zoneMedianPerSqm: number | null;
  /** Există altă proprietate din agenție cu exact aceeași descriere. */
  duplicateDescription: boolean;
};
export type ListingCheckResult = { score: number; issues: CheckIssue[] };

export const TITLE_MIN = 20;
export const TITLE_MAX = 70;
export const DESCRIPTION_MIN = 300;
export const PHOTOS_RECOMMENDED = 5;
const PENALTY: Record<CheckSeverity, number> = { required: 15, recommended: 5, optional: 2 };

const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : []);

/** Majuscule excesive: peste 50% din literele unui text de cel puțin 12 litere. */
export function excessiveCaps(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 12) return false;
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  return upper / letters.length > 0.5;
}
export const repeatedMarks = (text: string) => /([!?.])\1{2,}|[!?]{3,}/.test(text);
export const containsPhone = (text: string) => /(?:\+?4?0|\b0)[\s.-]?7\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/.test(text) || /\b0[23]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/.test(text);
export const containsEmail = (text: string) => /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text);
export const containsLink = (text: string) => /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.|\b[a-z0-9-]+\.(?:ro|com|net|eu|org)\b/i.test(text);

/** Lista fixă de cuvinte cheie din descriere → dotarea care ar trebui bifată. */
export const FEATURE_KEYWORDS: { key: string; label: string; pattern: RegExp; present: (p: Record<string, any>) => boolean; target: string }[] = [
  { key: "balcony", label: "Balcon", pattern: /\bbalcoan(e|ele)\b|\bbalcon(ul)?\b/i, present: (p) => p.balcony === true || (num(p.balconies) ?? 0) > 0, target: "edit-balconies" },
  { key: "parking", label: "Parcare", pattern: /\bparcar(e|ea)\b|\bloc de parcare\b|\bgaraj\b/i, present: (p) => (t(p.parking) !== "" && t(p.parking) !== "Fără") || (num(p.parking_spaces) ?? 0) > 0 || (num(p.garages) ?? 0) > 0, target: "edit-parking" },
  { key: "heating", label: "Centrală", pattern: /\bcentral[aăe]\b/i, present: (p) => arr(p.heating_systems).some((h) => /central/i.test(h)) || /central/i.test(t(p.heating)), target: "edit-heating_systems-heading" },
  { key: "elevator", label: "Lift", pattern: /\blift(ul)?\b/i, present: (p) => arr(p.building_amenities).includes("Lift") || arr(p.features).some((f) => /^lift$/i.test(f)), target: "edit-building_amenities-heading" },
  { key: "furnished", label: "Mobilat", pattern: /\bmobilat[aă]?\b/i, present: (p) => t(p.furnishing) !== "" || arr(p.kitchen_features).some((k) => /mobilat/i.test(k)), target: "edit-furnishing" },
];

/** Mențiune negată („fără balcon”, „nu are lift”, „nemobilat”) → nu cerem bifa. */
function negated(description: string, pattern: RegExp): boolean {
  const neg = new RegExp(`\\b(?:fără|fara|nu are|nu dispune de)\\s+(?:${pattern.source})`, "i");
  if (neg.test(description)) return true;
  if (pattern.source.includes("mobilat")) {
    const all = description.match(/\b\p{L}*mobilat\p{L}*/giu) ?? [];
    return all.length > 0 && all.every((w) => /^nemobilat/i.test(w));
  }
  return false;
}

export function checkListing(input: ListingCheckInput): ListingCheckResult {
  const p = input.property;
  const issues: CheckIssue[] = [];
  const add = (severity: CheckSeverity, code: string, message: string, field: string, tab: string, target: string | null) =>
    issues.push({ code, severity, message, field, tab, target });

  const type = t(p.property_type);
  const isLand = type === "land";
  const isFlat = type === "apartment" || type === "studio";
  const isBuilding = !isLand;
  const forSale = p.for_sale === true || p.transaction_kind === "sale";
  const forRent = p.for_rent === true || p.transaction_kind === "rent";
  const checkedPortals = input.publications.filter((x) => x.enabled);

  // Publicare
  const published = p.publish_status === "published";
  if (p.status === "active" && !published && checkedPortals.length > 0) {
    add("required", "unpublished_with_portals", "Anunțul nu e publicat; portalurile bifate nu îl vor prelua", "Publicare", "publishing", null);
  }
  for (const pub of input.publications) {
    if (pub.lastError && t(pub.lastError)) add("required", `portal_error:${pub.portal}`, `${pub.portalName}: ${t(pub.lastError)}`, `Publicare – ${pub.portalName}`, "publishing", null);
  }
  for (const report of input.portalReports) {
    for (const m of report.missing) {
      add("required", `portal_req:${report.portal}:${m.label}`, `${report.portalName}: ${m.requirement ? `${m.label} — ${m.requirement}` : m.label}`, m.label, "publishing", null);
    }
  }

  // Câmpuri lipsă importante, după tip
  const usable = num(p.usable_surface) ?? num(p.surface);
  const built = num(p.built_surface);
  const land = num(p.land_surface);
  const floor = num(p.floor);
  const floors = num(p.building_floors);
  const rooms = num(p.rooms);
  if (isLand) {
    if (!land) add("required", "missing_land_surface", "Lipsește suprafața terenului", "Suprafață teren", "overview", "edit-land_surface");
  } else {
    if (!usable) add("required", "missing_usable_surface", "Lipsește suprafața utilă", "Suprafață utilă", "overview", "edit-usable_surface");
    if (!built) add("recommended", "missing_built_surface", "Lipsește suprafața construită", "Suprafață construită", "overview", "edit-built_surface");
    if (!num(p.build_year)) add("recommended", "missing_build_year", "Lipsește anul construcției", "An construcție", "overview", "edit-build_year");
    if (arr(p.heating_systems).length === 0 && !t(p.heating)) add("recommended", "missing_heating", "Lipsește tipul de încălzire", "Încălzire", "overview", "edit-heating_systems-heading");
    if (!num(p.bathrooms) && type !== "land") add("recommended", "missing_bathrooms", "Lipsește numărul de băi", "Băi", "overview", "edit-bathrooms");
  }
  if (isFlat || type === "house") {
    if (!rooms) add("required", "missing_rooms", "Lipsește numărul de camere", "Camere", "overview", "edit-rooms");
  }
  if (isFlat) {
    if (floor === null && !t(p.floor_label)) add("required", "missing_floor", "Lipsește etajul", "Etaj", "overview", "edit-floor");
    if (!floors) add("recommended", "missing_building_floors", "Lipsește numărul de etaje ale clădirii", "Etaje clădire", "overview", "edit-building_floors");
    if (!t(p.layout) && type === "apartment") add("recommended", "missing_layout", "Lipsește compartimentarea", "Compartimentare", "overview", "edit-layout");
  } else if (type === "house" && !floors) {
    add("optional", "missing_building_floors", "Lipsește numărul de niveluri", "Etaje clădire", "overview", "edit-building_floors");
  }
  const lat = num(p.lat), lng = num(p.lng);
  if (lat === null || lng === null || (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)) {
    add("required", "missing_coords", "Lipsesc coordonatele pe hartă", "Localizare pe hartă", "location", "edit-location-precise");
  } else if (p.location_precise !== true) {
    add("optional", "imprecise_location", "Locația nu e marcată ca precisă", "Precizia locației", "location", "edit-location-precise");
  }
  if (!t(p.district)) add("recommended", "missing_zone", "Lipsește zona", "Zonă", "location", "edit-locality");

  // Coerență
  if (isBuilding && usable && built && built < usable) add("required", "built_lt_usable", "Suprafața construită e mai mică decât cea utilă", "Suprafață construită", "overview", "edit-built_surface");
  if (floor !== null && floors && floor > floors) add("required", "floor_gt_floors", "Etajul e mai mare decât numărul de etaje ale clădirii", "Etaj", "overview", "edit-floor");
  if (rooms && usable && isBuilding) {
    const perRoom = usable / rooms;
    if (perRoom < 8 || (rooms >= 2 && perRoom > 150)) add("recommended", "rooms_vs_surface", `Numărul de camere (${rooms}) pare nerealist pentru ${usable} m²`, "Camere", "overview", "edit-rooms");
  }
  const salePrice = num(p.sale_price) ?? (forSale && !forRent ? num(p.price) : null);
  const rentPrice = num(p.rent_price) ?? (forRent && !forSale ? num(p.price) : null);
  if (forSale && !(salePrice && salePrice > 0)) add("required", "sale_without_price", "Vânzare fără preț de vânzare", "Preț vânzare", "price", "edit-sale-price");
  if (forRent && !(rentPrice && rentPrice > 0)) add("required", "rent_without_price", "Închiriere fără chirie", "Chirie", "price", "edit-rent-price");
  const area = isLand ? land : usable;
  if (forSale && salePrice && area && input.zoneMedianPerSqm) {
    const ratio = salePrice / area / input.zoneMedianPerSqm;
    if (ratio < 0.5 || ratio > 2) add("recommended", "price_vs_zone", `Prețul pe m² (${Math.round(salePrice / area)}) e foarte diferit de mediana zonei (${Math.round(input.zoneMedianPerSqm)})`, "Preț vânzare", "price", "edit-sale-price");
  }

  // Titlu
  const title = t(p.title);
  if (title.length < TITLE_MIN) add("required", "title_short", `Titlul e prea scurt (minimum ${TITLE_MIN} caractere)`, "Titlu", "description", "title");
  else if (title.length > TITLE_MAX) add("recommended", "title_long", `Titlul are peste ${TITLE_MAX} de caractere`, "Titlu", "description", "title");
  if (excessiveCaps(title)) add("recommended", "title_caps", "Titlul are prea multe majuscule", "Titlu", "description", "title");
  if (repeatedMarks(title)) add("recommended", "title_marks", "Titlul are semne repetate (de ex. „!!!”)", "Titlu", "description", "title");

  // Descriere
  const description = t(p.description);
  if (description.length < DESCRIPTION_MIN) add(description ? "recommended" : "required", "description_short", `Descrierea are sub ${DESCRIPTION_MIN} de caractere`, "Descriere", "description", "description");
  if (containsPhone(description)) add("recommended", "description_phone", "Descrierea conține un număr de telefon; multe portaluri îl interzic", "Descriere", "description", "description");
  if (containsEmail(description)) add("recommended", "description_email", "Descrierea conține o adresă de email; multe portaluri o interzic", "Descriere", "description", "description");
  if (containsLink(description)) add("recommended", "description_link", "Descrierea conține un link; multe portaluri îl interzic", "Descriere", "description", "description");
  if (excessiveCaps(description)) add("recommended", "description_caps", "Descrierea are prea multe majuscule", "Descriere", "description", "description");
  if (input.duplicateDescription) add("recommended", "description_duplicate", "Descrierea e identică cu a altui anunț din agenție", "Descriere", "description", "description");

  // Poze
  const n = input.images.length;
  if (n === 0) add("required", "photos_none", "Anunțul nu are nicio poză", "Fotografii", "media", null);
  else if (n < PHOTOS_RECOMMENDED) add("recommended", "photos_few", `Anunțul are doar ${n} ${n === 1 ? "poză" : "poze"} (recomandat cel puțin ${PHOTOS_RECOMMENDED})`, "Fotografii", "media", null);
  if (n > 0 && !input.images.some((i) => i.isPrimary)) add("recommended", "photos_no_primary", "Nicio poză nu e marcată ca principală", "Fotografii", "media", null);
  const hidden = input.images.filter((i) => i.isConfidential || !i.includeInPublish).length;
  if (hidden > 0) add("optional", "photos_hidden", `${hidden} ${hidden === 1 ? "poză e confidențială sau exclusă" : "poze sunt confidențiale sau excluse"} de la publicare`, "Fotografii", "media", null);
  const seen = new Set<string>();
  let dup = 0;
  for (const i of input.images) {
    const keys = [i.storagePath && `f:${i.storagePath}`, i.sourceUrl && `s:${i.sourceUrl}`].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) dup++;
    keys.forEach((k) => seen.add(k));
  }
  if (dup > 0) add("recommended", "photos_duplicate", `${dup} ${dup === 1 ? "poză duplicată" : "poze duplicate"}`, "Fotografii", "media", null);

  // Dotări menționate dar nebifate
  for (const f of FEATURE_KEYWORDS) {
    if (f.pattern.test(description) && !negated(description, f.pattern) && !f.present(p)) {
      add("optional", `feature_${f.key}`, `Descrierea menționează „${f.label.toLowerCase()}”, dar dotarea nu e bifată`, f.label, "overview", f.target);
    }
  }

  const penalty = issues.reduce((s, i) => s + PENALTY[i.severity], 0);
  return { score: Math.max(0, Math.min(100, 100 - penalty)), issues };
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}
