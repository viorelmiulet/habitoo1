import type { PropertyRow } from "@/lib/site-feed/mapper";
import { publicCoords } from "@/lib/geo";
import { htmlToText, imo24Floor, imo24LandType, imo24Transactions, normalizeLabel } from "../imo24/mapper";
import type { OferaCategory } from "./nomenclature";
import type { OferaLocation } from "./location";

export type OferaRow = Partial<PropertyRow> & Pick<PropertyRow, "id">;
export type OferaContact = { tip: "business"; name: string; email: string; phone: string; photo?: string };
/** Incomplete preview drafts omit unresolved required fields; only ok=true bodies are valid requests. */
export type OferaBody = { category_id: number; id_furnizor?: number; title: string; description: string; city_id?: number; params: Record<string, string | number>; images: { url: string; order: number }[]; contact?: OferaContact; external_id: string; promoted: 0 };
export type OferaMapOptions = { categories: (OferaCategory & { active?: boolean })[]; location: OferaLocation; providerId?: number | null; images: string[]; contact?: OferaContact | null; currency?: "EUR" | "RON"; eurRonRate?: number | null; currentYear?: number };
export type OferaMapResult = { ok: boolean; bodies: OferaBody[]; reasons: string[]; warnings: string[] };
export function oferaCurrency(value: unknown): "EUR" | "RON" { return value === "RON" ? "RON" : "EUR"; }
export function oferaCategoryPath(p: OferaRow, tx: "vanzare" | "inchiriere"): string | null {
  const sale = tx === "vanzare";
  if (p.property_type === "apartment" || p.property_type === "studio") {
    const rooms = p.property_type === "studio" ? 1 : p.rooms;
    if (typeof rooms !== "number" || !Number.isInteger(rooms) || rooms < 1) return null;
    return `imobiliare/apartamente-de-${sale ? "vanzare" : "inchiriat"}/${rooms === 1 ? "garsoniere" : `${Math.min(rooms, 4)}-camere`}`;
  }
  const paths: Record<string, string> = {
    house: `imobiliare/case-${sale ? "vanzare" : "inchiriat"}`,
    villa: `imobiliare/case-${sale ? "vanzare" : "inchiriat"}`,
    land: `imobiliare/terenuri/de-${sale ? "vanzare" : "inchiriat"}`,
    office: `imobiliare/birouri-spatii/spatii-de-${sale ? "vanzare" : "inchiriat"}`,
    commercial: `imobiliare/birouri-spatii/spatii-de-${sale ? "vanzare" : "inchiriat"}`,
    industrial: `imobiliare/depozite-hale/depozite-hale-de-${sale ? "vanzare" : "inchiriat"}`,
  };
  return paths[p.property_type ?? ""] ?? null;
}
export function mapPropertyToOfera(p: OferaRow, options: OferaMapOptions): OferaMapResult {
  const reasons = [...options.location.reasons];
  const warnings = [...options.location.warnings];
  const bodies: OferaBody[] = [];
  const transactions = imo24Transactions(p);
  if (!transactions.length) reasons.push("Bifează vânzare sau închiriere.");
  if (!options.categories.length) reasons.push("Nomenclatorul Ofera nu e sincronizat.");
  if (!Number.isSafeInteger(options.providerId) || !(Number(options.providerId) > 0)) reasons.push("Completează ID-ul furnizor Ofera al agenției (SuperAdmin → Portaluri → Ofera).");
  const title = htmlToText(p.title);
  const description = htmlToText(p.description);
  if (!description) reasons.push("Completează descrierea ofertei.");
  if (!options.images.length) reasons.push("Adaugă cel puțin o imagine publicabilă.");
  if (!options.contact?.phone.trim()) reasons.push("Completează telefonul agentului responsabil.");
  const coords = publicCoords({ id: p.id, lat: p.lat ?? null, lng: p.lng ?? null, location_precise: p.location_precise });
  if (!coords) warnings.push("Fără coordonate publice: latitude și longitude nu se trimit.");
  for (const tx of transactions) {
    const path = oferaCategoryPath(p, tx);
    const categories = options.categories.filter(c => c.active !== false && c.path_url.replace(/\/$/, "") === path);
    const category = categories.length === 1 ? categories[0] : undefined;
    if (!category) {
      reasons.push((p.property_type === "apartment" && !path) ? "Completează numărul de camere pentru categoria Ofera." : "Categoria lipsește sau este inactivă în nomenclatorul Ofera.");
      continue;
    }
    const params: Record<string, string | number> = {};
    const set = (code: string, value: string | number | null | undefined) => {
      const definition = category.parameters.find(d => d.code === code);
      if (!definition || value === null || value === undefined) return;
      if (definition.type === "dropdown" && !Object.prototype.hasOwnProperty.call(definition.options ?? {}, String(value))) { warnings.push(`${code}: valoarea „${value}” nu există în opțiunile Ofera și nu se trimite.`); return; }
      params[code] = definition.type === "dropdown" ? String(value) : value;
    };
    const raw = tx === "vanzare" ? p.sale_price ?? p.price : p.rent_price ?? p.price;
    const sourceCurrency = ((tx === "vanzare" ? p.sale_currency : p.rent_currency) ?? p.currency ?? "EUR").toUpperCase();
    const target = options.currency ?? "EUR";
    let price = raw;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) reasons.push(`Prețul de ${tx === "vanzare" ? "vânzare" : "închiriere"} lipsește sau nu este pozitiv.`);
    else if (!["EUR", "RON"].includes(sourceCurrency)) { reasons.push("Moneda ofertei nu este EUR sau RON."); price = null; }
    else if (sourceCurrency !== target) {
      const rate = options.eurRonRate;
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) { reasons.push("Cursul BNR al zilei nu este disponibil pentru conversie."); price = null; }
      else price = Math.round((target === "EUR" ? raw / rate : raw * rate) * 100) / 100;
    }
    set("price", price);
    if (!(typeof params.price === "number" && params.price > 0)) reasons.push("Categoria Ofera nu permite un preț pozitiv valid.");
    if (p.negotiable === true) set("negotiable", 1);
    const surface = p.property_type === "land" ? p.land_surface : p.usable_surface ?? p.surface;
    if (typeof surface === "number" && Number.isFinite(surface) && surface > 0) set("c_suprafata_utila", surface);
    if (typeof p.build_year === "number" && Number.isInteger(p.build_year) && p.build_year >= 1800 && p.build_year <= (options.currentYear ?? new Date().getFullYear()) + 3) set("c_an_constructie", p.build_year);
    const floor = imo24Floor(p);
    const floorValue = normalizeLabel(p.floor_label) === "mansarda" ? "200" : normalizeLabel(p.floor_label) === "demisol" || floor === -1 ? "100" : floor === 0 ? "101" : floor !== null && floor >= 1 ? String(Math.min(floor, 10)) : null;
    set("c_etaj", floorValue);
    set("c_compartimentare", ({ decomandat: "1", semidecomandat: "2", nedecomandat: "3", circular: "4" } as Record<string, string>)[normalizeLabel(p.layout)]);
    if (p.property_type === "house" || p.property_type === "villa") {
      if (typeof p.rooms === "number" && Number.isInteger(p.rooms) && p.rooms > 0) set("c_nr_camere", String(Math.min(p.rooms, 4)));
      set("c_mobilat_utilat", ({ complet: "1", partial: "2", nemobilat: "3" } as Record<string, string>)[normalizeLabel(p.furnishing)]);
    }
    if (p.property_type === "land") set("c_extravilan_intravilan", ({ extravilan: "1", intravilan: "2" } as Record<string, string>)[imo24LandType(p) ?? ""]);
    if (coords) { params.latitude = coords.lat; params.longitude = coords.lng; }
    if (options.location.regionId !== undefined) params.region_id = options.location.regionId;
    for (const definition of category.parameters) if (definition.required && params[definition.code] === undefined) reasons.push(`Completează parametrul obligatoriu Ofera: ${definition.label}.`);
    bodies.push({ category_id: category.id, ...(Number.isSafeInteger(options.providerId) && Number(options.providerId) > 0 ? { id_furnizor: Number(options.providerId) } : {}), title, description, ...(options.location.cityId ? { city_id: options.location.cityId } : {}), params, images: options.images.map((url, order) => ({ url, order })), ...(options.contact ? { contact: options.contact } : {}), external_id: `${p.reference?.trim() || p.id}-${tx === "vanzare" ? "v" : "i"}`, promoted: 0 });
  }
  const uniqueReasons = [...new Set(reasons)];
  return { ok: uniqueReasons.length === 0, bodies, reasons: uniqueReasons, warnings: [...new Set(warnings)] };
}