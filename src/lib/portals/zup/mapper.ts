import type { PropertyRow } from "@/lib/site-feed/mapper";
import { htmlToText, imo24Transactions, imo24Floor } from "../imo24/mapper";
import { zupName, type ZupCatalogue, type ZupCharacteristic, type ZupCategory } from "./nomenclature";
export type ZupRow = Partial<PropertyRow> & Pick<PropertyRow, "id">;
export type ZupImage = { url: string; mime?: string | null; path?: string | null };
export type ZupBody = { category_id: number; name: string; description: string; status: "active"; county?: string; locality?: string; nume: string; prenume: string; phone: string; characteristics: Record<string, string | number | boolean | (string | number)[]>; photos_urls: string[] };
export const zupImageAllowed = (i: ZupImage) => i.mime ? ["image/jpeg", "image/png"].includes(i.mime.toLowerCase()) : /\.(jpe?g|png)$/i.test((i.path ?? i.url).split("?")[0] ?? "");
const aliases: Record<string, string[]> = {
  price: ["pret", "pret vanzare", "pret inchiriere"], currency: ["moneda"], usable: ["suprafata utila"], built: ["suprafata construita"], land: ["suprafata teren", "suprafata terenului"], rooms: ["camere", "numar camere", "nr camere"], floor: ["etaj"], year: ["an constructie", "anul constructiei"], layout: ["compartimentare"], comfort: ["confort"], condition: ["stare", "stare imobil", "stare finisaje"], furnishing: ["mobilare", "mobilat", "mobilat utilat"], features: ["dotari"], commission: ["comision", "comision 0", "comision 0%"],
};
const hints: Record<string,string> = { price: "prețul", currency: "moneda prețului", usable: "suprafața utilă", built: "suprafața construită", land: "suprafața terenului", rooms: "numărul de camere", floor: "etajul", year: "anul construcției", layout: "compartimentarea", comfort: "confortul", condition: "starea finisajelor", furnishing: "mobilarea", features: "dotările", commission: "comisionul cumpărătorului" };
function sourceKey(f: ZupCharacteristic) { return Object.keys(aliases).find(k => aliases[k]?.some(a => zupName(a) === zupName(f.filter_key) || zupName(a) === zupName(f.filter_name))); }
function categoryMatches(c: ZupCategory, p: ZupRow, tx: string, cats: ZupCategory[]): boolean {
  if (!c.leaf) return false;
  const names: string[] = [c.name]; let parent = c.parent_id; const seen = new Set<number>();
  while (parent !== null && !seen.has(parent)) { seen.add(parent); const r = cats.find(x => x.id === parent); if (!r) return false; names.push(r.name); parent = r.parent_id; }
  const label = zupName(names.join(" "));
  const sale = /\b(vanzare|vanzari|vanzarea|vanzat)\b/.test(label); const rent = /\b(inchiriere|inchirieri|inchiriat|inchirierea)\b/.test(label);
  if (tx === "vanzare" ? !sale || rent : !rent || sale) return false;
  const type = p.property_type;
  if (type === "apartment" || type === "studio") {
    const rooms = type === "studio" ? 1 : p.rooms;
    if (!rooms || !Number.isInteger(rooms)) return false;
    if (rooms === 1) return /garsonier/.test(label) || /apartament/.test(label) && /\b1 camer/.test(label);
    return /apartament/.test(label) && new RegExp(`\\b${rooms} camer`).test(label);
  }
  return type === "house" || type === "villa" ? /\b(case|casa|vile|vila)\b/.test(label)
    : type === "land" ? /\b(teren|terenuri)\b/.test(label)
    : type === "commercial" ? /spati[iu] comercial/.test(label)
    : type === "office" ? /\b(birou|birouri)\b/.test(label)
    : type === "industrial" ? /\b(hala|hale|depozit|depozite)\b/.test(label) : false;
}
function optionValue(options: unknown[], value: unknown): string | number | undefined {
  const choices = options.flatMap(o => {
    if (typeof o === "string" || typeof o === "number") return [{ value: o, label: String(o) }];
    if (!o || typeof o !== "object" || Array.isArray(o)) return [];
    const r = o as Record<string,unknown>; const v = r.value; const label = r.label ?? r.name;
    return (typeof v === "string" || typeof v === "number") && typeof label === "string" ? [{ value: v, label }] : [];
  }).filter(o => zupName(o.label) === zupName(String(value)) || String(o.value) === String(value));
  return choices.length === 1 ? choices[0]?.value : undefined;
}
function validated(f: ZupCharacteristic, value: unknown): ZupBody["characteristics"][string] | undefined {
  if (value == null || value === "") return undefined;
  // Undocumented conditional option syntax is deliberately not inferred.
  if (f.is_dependent || f.depends_on_filter || (Array.isArray(f.conditional_options) ? f.conditional_options.length > 0 : Boolean(f.conditional_options))) return undefined;
  let result: ZupBody["characteristics"][string] | undefined;
  if (f.filter_type === "select") result = optionValue(f.options, value);
  else if (f.filter_type === "multiselect") { const mapped = (Array.isArray(value) ? value : [value]).map(v => optionValue(f.options,v)).filter((v): v is string|number => v !== undefined); if (mapped.length) result = [...new Set(mapped)]; }
  else if (f.filter_type === "boolean") { if (typeof value === "boolean") result = value; }
  else if (f.filter_type === "number") { if (typeof value === "number" && Number.isFinite(value)) result = value; }
  else if (f.filter_type === "text" && (typeof value === "string" || typeof value === "number")) result = String(value);
  if (result === undefined) return undefined;
  for (const rule of f.validation_rules) {
    if (typeof rule !== "string") return undefined;
    if (["required", "nullable", "numeric", "string", "boolean", "array"].includes(rule)) continue;
    if (rule === "integer") { if (typeof result !== "number" || !Number.isInteger(result)) return undefined; continue; }
    const m = /^(min|max):([\d.]+)$/.exec(rule);
    if (!m) return undefined;
    const size = typeof result === "number" ? result : typeof result === "string" || Array.isArray(result) ? result.length : NaN;
    if (!Number.isFinite(size) || (m[1] === "min" ? size < Number(m[2]) : size > Number(m[2]))) return undefined;
  }
  return result;
}
export function mapPropertyToZup(p: ZupRow, o: { catalogue: ZupCatalogue; images: ZupImage[]; contact?: { fullName: string; phone: string } | null }) {
  const reasons: string[] = []; const warnings: string[] = []; const bodies: ZupBody[] = [];
  const photos = o.images.filter(zupImageAllowed).filter(i => { try { return new URL(i.url).protocol === "https:"; } catch { return false; } }).map(i => i.url);
  if (!photos.length) reasons.push("Adaugă cel puțin o fotografie JPEG sau PNG publicabilă.");
  if (!o.contact?.phone.trim()) reasons.push("Completează telefonul agentului responsabil.");
  const parts = o.contact?.fullName.trim().split(/\s+/) ?? []; const nume = parts[0] ?? ""; const prenume = parts.slice(1).join(" ");
  if (!nume || !prenume) reasons.push("Completează numele și prenumele agentului responsabil.");
  const name = htmlToText(p.title); const description = htmlToText(p.description);
  if (!name) reasons.push("Completează titlul proprietății."); if (!description) reasons.push("Completează descrierea proprietății.");
  const cleanPlace = (s: string | null | undefined) => zupName(s).replace(/^(municipiul|municipiu|judetul|judet) /, "");
  const countyKey = cleanPlace(p.county); const cityKey = cleanPlace(p.city);
  const bucharest = countyKey === "bucuresti" || cityKey === "bucuresti" || /^sector(?:ul)? [1-6]$/.test(cityKey);
  const sector = [p.city,p.district].map(zupName).map(s => /\bsector(?:ul)? ([1-6])\b/.exec(s)?.[1]).find(Boolean);
  const countyRows = o.catalogue.locations.filter(l => cleanPlace(l.county) === (bucharest ? "bucuresti" : countyKey));
  const sectorRows = sector ? countyRows.filter(l => /^sector(?:ul)? [1-6]$/.test(cleanPlace(l.locality)) && cleanPlace(l.locality).endsWith(` ${sector}`)) : [];
  const matches = sectorRows.length === 1 ? sectorRows : countyRows.filter(l => cleanPlace(l.locality) === (bucharest ? "bucuresti" : cityKey));
  const location = matches.length === 1 ? matches[0] : undefined;
  if (!location) reasons.push("Localitatea nu a fost găsită în mod unic în nomenclatorul ZUP. Verifică județul și localitatea.");
  const txs = imo24Transactions(p); if (!txs.length) reasons.push("Bifează vânzare sau închiriere.");
  for (const tx of txs) {
    const categories = o.catalogue.categories.filter(c => categoryMatches(c,p,tx,o.catalogue.categories));
    if (categories.length !== 1) { reasons.push(`Categoria finală ZUP nu este mapată pentru ${tx}. Verifică tipul proprietății, camerele și nomenclatorul.`); continue; }
    const category = categories[0]; if (!category) continue;
    const price = tx === "vanzare" ? p.sale_price ?? p.price : p.rent_price ?? p.price;
    const currency = (tx === "vanzare" ? p.sale_currency ?? p.currency : p.rent_currency ?? p.currency)?.toUpperCase();
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) reasons.push(`Completează prețul pozitiv de ${tx}.`);
    const values: Record<string,unknown> = { price, currency, usable: p.usable_surface ?? p.surface, built: p.built_surface, land: p.land_surface, rooms: p.property_type === "studio" ? 1 : p.rooms, floor: p.floor_label?.trim() || imo24Floor(p), year: p.build_year, layout: p.layout, comfort: p.comfort, condition: p.finish_state, furnishing: p.furnishing, features: p.features, commission: p.commission };
    const characteristics: ZupBody["characteristics"] = {};
    for (const f of category.characteristics) {
      const key = sourceKey(f); let value = key ? values[key] : undefined;
      if (key === "commission" && f.filter_type === "boolean") {
        const raw = String(value ?? "").trim(); value = raw ? /^0(?:[.,]0+)?\s*%?$/.test(raw) : undefined;
      }
      const mapped = validated(f,value);
      if (mapped !== undefined) characteristics[f.filter_key] = mapped;
      else if (f.is_required) reasons.push(key ? `Completează ${hints[key]} în Habitoo cu o valoare acceptată pentru „${f.filter_name}” la ZUP.` : `Caracteristica obligatorie „${f.filter_name}” nu are corespondent Habitoo; verifică nomenclatorul ZUP.`);
      else if (value != null) warnings.push(`„${f.filter_name}”: valoarea nu are corespondent verificat și nu se trimite.`);
    }
    for (const key of ["price","currency"]) if (!category.characteristics.some(f => sourceKey(f) === key && characteristics[f.filter_key] !== undefined)) reasons.push(`ZUP nu are o mapare verificată pentru ${hints[key]}.`);
    bodies.push({ category_id: category.id, name, description, status: "active", ...(location ? { county: location.county, locality: location.locality } : {}), nume, prenume, phone: o.contact?.phone.trim() ?? "", characteristics, photos_urls: photos });
  }
  return { ok: !reasons.length, bodies, reasons: [...new Set(reasons)], warnings: [...new Set(warnings)] };
}