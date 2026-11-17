/**
 * „Completează cu AI” — contractul pur (browser-safe) dintre modelul AI
 * și formularul proprietății.
 *
 * Modelul propune; acest modul păstrează doar câmpurile existente ale
 * formularului, doar valorile din nomenclatoare și doar faptele permise:
 * prețul, adresa, etajul, anul și suprafețele se acceptă numai dacă apar
 * explicit în textul agentului sau în transcrierea vocii, niciodată din poze.
 */
import { z } from "zod";
import { normalizeListingText } from "@/lib/ai/text-correction/text";
import * as taxonomy from "@/lib/property-taxonomy";
import { propertyTypeLabels } from "@/lib/labels";
import { ENERGY_CLASS_OPTIONS } from "@/lib/property-energy-class";
import { deriveAutofillValues, extractStatedFacts, numberStatedIn, type StatedFacts } from "./facts";
import { isAutofillFieldEmpty } from "./empty";
import { buildMarketingFactSheet, validateMarketingFacts } from "@/lib/ai/agents/marketing/facts";

export const AUTOFILL_MAX_PHOTOS = 20;
export const AUTOFILL_IMAGE_MAX_EDGE = 1024;

export const AUTOFILL_INVALID_MESSAGE = "Nu am putut completa automat. Încearcă din nou sau completează manual.";
export const AUTOFILL_EMPTY_MESSAGE = "Adaugă cel puțin o poză sau scrie câteva cuvinte despre proprietate.";

type FieldKind = "select" | "multi" | "number" | "boolean" | "text";
type FieldDef = { kind: FieldKind; label: string; options?: readonly string[]; fromPhotos?: boolean; explicit?: boolean };

const sel = (label: string, options: readonly string[], extra: Partial<FieldDef> = {}): FieldDef => ({ kind: "select", label, options, ...extra });
const multi = (label: string, options: readonly string[], fromPhotos = true): FieldDef => ({ kind: "multi", label, options, fromPhotos });
const num = (label: string, explicit = false, fromPhotos = false): FieldDef => ({ kind: "number", label, explicit, fromPhotos });
const bool = (label: string, fromPhotos = true): FieldDef => ({ kind: "boolean", label, fromPhotos });

/** Câmpurile formularului pe care AI-ul le poate propune, cu nomenclatorul lor. */
export const AUTOFILL_FIELDS: Record<string, FieldDef> = {
  property_type: sel("Tip proprietate", Object.keys(propertyTypeLabels)),
  transaction: sel("Tranzacție", ["sale", "rent"]),
  layout: sel("Compartimentare", taxonomy.layoutOptions),
  comfort: sel("Confort", taxonomy.comfortOptions),
  destination: sel("Destinație", taxonomy.destinationOptions),
  orientation: sel("Orientare", taxonomy.orientationOptions),
  parking: sel("Tip parcare", taxonomy.parkingOptions),
  construction_stage: sel("Stadiu construcție", taxonomy.constructionStageOptions),
  building_type: sel("Tip clădire", taxonomy.buildingTypeOptions),
  building_structure: sel("Structură", taxonomy.buildingStructureOptions),
  seismic_risk: sel("Risc seismic", taxonomy.seismicRiskOptions),
  energy_class: sel("Clasă energetică", ENERGY_CLASS_OPTIONS),
  floor_label: sel("Etaj", taxonomy.floorLabelOptions, { explicit: true }),
  finish_state: sel("Stare finisaje", taxonomy.finishStateOptions, { fromPhotos: true }),
  furnishing: sel("Mobilat", taxonomy.furnishingOptions, { fromPhotos: true }),
  utilities: multi("Utilități", taxonomy.utilityOptions, false),
  heating_systems: multi("Sistem încălzire", taxonomy.heatingOptions),
  cooling_systems: multi("Climatizare", taxonomy.coolingOptions),
  insulation: multi("Izolații", taxonomy.insulationOptions, false),
  wall_finishes: multi("Pereți", taxonomy.wallFinishOptions),
  floor_finishes: multi("Podele", taxonomy.floorFinishOptions),
  windows: multi("Ferestre", taxonomy.windowOptions),
  blinds: multi("Jaluzele", taxonomy.blindOptions),
  shutters: multi("Rulouri", taxonomy.shutterOptions),
  entry_door: multi("Ușă intrare", taxonomy.entryDoorOptions),
  interior_doors: multi("Uși interior", taxonomy.interiorDoorOptions),
  additional_spaces: multi("Spații adiționale", taxonomy.additionalSpaceOptions),
  kitchen_features: multi("Bucătărie", taxonomy.kitchenOptions),
  metering: multi("Contorizare", taxonomy.meteringOptions, false),
  appliances: multi("Electrocasnice", taxonomy.applianceOptions),
  building_amenities: multi("Imobil", taxonomy.buildingAmenityOptions, false),
  views: multi("Priveliște", taxonomy.viewOptions),
  misc_features: multi("Diverse", taxonomy.miscFeatureOptions, false),
  rooms: num("Camere"),
  bedrooms: num("Dormitoare"),
  kitchens: num("Bucătării", false, true),
  bathrooms: num("Băi", false, true),
  balconies: num("Balcoane"),
  terraces: num("Terase"),
  parking_spaces: num("Parcări"),
  garages: num("Garaje"),
  floor: num("Număr etaj", true),
  building_floors: num("Etaje clădire", true),
  build_year: num("An construcție", true),
  renovation_year: num("Anul renovării", true),
  usable_surface: num("Suprafață utilă", true),
  built_surface: num("Suprafață construită", true),
  total_usable_surface: num("Utilă totală", true),
  balcony_surface: num("Suprafață balcoane", true),
  terrace_surface: num("Suprafață terase", true),
  garden_surface: num("Suprafață grădină", true),
  land_surface: num("Suprafață teren", true),
  open_kitchen: bool("Bucătărie deschisă"),
  bathroom_window: bool("Geam la baie"),
  balcony: bool("Balcon"),
  pet_friendly: bool("Pet friendly", false),
  price: num("Preț", true),
  currency: sel("Monedă", ["EUR", "RON"]),
  city: { kind: "text", label: "Localitate", explicit: true },
  district: { kind: "text", label: "Zonă / cartier", explicit: true },
  address: { kind: "text", label: "Adresă", explicit: true },
};

export type AutofillConfidence = "high" | "medium";
/** Sursa fiecărei propuneri: descriere/titlu, text scris în asistent, poze, deducție logică. */
export type AutofillSource = "text" | "spoken" | "photos" | "derived";
export const AUTOFILL_SOURCE_LABELS: Record<AutofillSource, string> = { text: "din descriere", spoken: "din text", photos: "din poze", derived: "dedus" };
export type AutofillValue = string | number | boolean | string[];
export type AutofillProposal = {
  values: Record<string, AutofillValue>;
  confidence: Record<string, AutofillConfidence>;
  sources: Record<string, AutofillSource>;
  title: string | null;
  description: string | null;
  /** Indicii pozelor trimise, în ordinea propusă (coperta prima). */
  photoOrder: number[] | null;
  ignored: string[];
};

/** Forma brută cerută modelului. */
export const autofillResponseSchema = z.object({
  transcript: z.string().nullable().optional(),
  fields: z.array(z.object({
    key: z.string(),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
    confidence: z.enum(["high", "medium", "low"]),
    source: z.enum(["spoken", "text", "photos"]),
  })).max(120),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  photo_order: z.array(z.number().int()).nullable().optional(),
});
export type AutofillRawResponse = z.infer<typeof autofillResponseSchema>;

function plain(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

/** Textul agentului cu numerele lipite („75.000” → „75000”). */
function spokenNumbers(text: string): string {
  return plain(text).replace(/(\d)[.\s](?=\d{3}\b)/g, "$1");
}

function numberStated(spoken: string, value: number): boolean {
  return numberStatedIn(spoken, value);
}

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type AutofillContext = {
  /** Textul scris de agent plus transcrierea vocii (singura sursă pentru fapte explicite). */
  spokenText: string;
  /** Titlul, descrierea și valorile deja scrise în formular (sursa „text”). */
  contextText?: string;
  /** Valorile curente din formular, pentru deducții pe câmpuri goale. */
  current?: Record<string, unknown>;
  photoCount: number;
};

/**
 * Validează răspunsul modelului. Orice câmp necunoscut, valoare din afara
 * nomenclatorului, încredere scăzută sau fapt explicit nespus este ignorat.
 */
export function sanitizeAutofillResponse(raw: unknown, ctx: AutofillContext): AutofillProposal | null {
  const parsed = autofillResponseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const response = parsed.data;
  const agentSpoken = [ctx.spokenText, response.transcript ?? ""].join(" \n ");
  const spoken = [agentSpoken, ctx.contextText ?? ""].join(" \n ");
  const spokenFacts = extractStatedFacts(agentSpoken);
  const textFacts = extractStatedFacts(ctx.contextText ?? "");
  const facts: StatedFacts = { ...textFacts, ...spokenFacts };
  const hasSpoken = plain(spoken).replace(/\\n/g, "").trim().length > 0;
  const values: Record<string, AutofillValue> = {};
  const confidence: Record<string, AutofillConfidence> = {};
  const sources: Record<string, AutofillSource> = {};
  const ignored: string[] = [];

  for (const field of response.fields) {
    // Counts are grounded in lexical facts/derivations, never arbitrary digits elsewhere.
    if (field.key === "rooms" || field.key === "bedrooms") continue;
    const def = AUTOFILL_FIELDS[field.key];
    if (!def || field.confidence === "low" || field.value === null || field.key in values) { ignored.push(field.key); continue; }
    const fromSpoken = field.source === "spoken" || field.source === "text";
    if (fromSpoken && !hasSpoken) { ignored.push(field.key); continue; }
    if (!fromSpoken && !def.fromPhotos) { ignored.push(field.key); continue; }
    if (def.explicit && !fromSpoken) { ignored.push(field.key); continue; }

    let value: unknown = null;
    if (def.kind === "select") {
      value = typeof field.value === "string" && def.options!.includes(field.value) ? field.value : null;
      if (value && field.key === "floor_label") {
        const label = plain(String(value));
        const digit = label.match(/\d+/)?.[0];
        const stated = facts.floor_label === value || (digit ? numberStated(spoken, Number(digit)) : plain(spoken).includes(label.split(" ")[0]!));
        if (!stated) value = null;
      }
    } else if (def.kind === "multi") {
      const list = Array.isArray(field.value) ? field.value : typeof field.value === "string" ? [field.value] : [];
      const kept = [...new Set(list.filter((v) => def.options!.includes(v)))];
      value = kept.length ? kept : null;
    } else if (def.kind === "number") {
      const n = toNum(field.value);
      const valid = n !== null && n >= (field.key === "floor" ? -5 : 0) && n < 100_000_000;
      const stated = valid && ((facts as Record<string, number | undefined>)[field.key] === n || numberStated(spoken, n!));
      value = valid && (!def.explicit || stated) && (fromSpoken ? stated : true) ? n : null;
    } else if (def.kind === "boolean") {
      value = field.value === true ? true : null;
    } else {
      const text = typeof field.value === "string" ? field.value.trim().slice(0, 200) : "";
      value = text && plain(spoken).includes(plain(text)) ? text : null;
    }
    if (value === null) { ignored.push(field.key); continue; }
    values[field.key] = value as AutofillValue;
    // Din poze: doar „de verificat”.
    confidence[field.key] = fromSpoken ? field.confidence : "medium";
    sources[field.key] = fromSpoken ? (field.source as AutofillSource) : "photos";
  }

  // Fapte explicite citite determinist, pe care modelul le-a omis.
  for (const [key, v] of Object.entries(facts)) {
    if (key in values || v === undefined || !AUTOFILL_FIELDS[key]) continue;
    values[key] = v as AutofillValue;
    confidence[key] = "high";
    sources[key] = key in spokenFacts && (spokenFacts as Record<string, unknown>)[key] === v ? "spoken" : "text";
  }

  // Deducții logice sigure, doar pe câmpuri goale.
  const available = onlyEmptyFields({ values, confidence, sources, title: null, description: null, photoOrder: null, ignored }, ctx.current ?? {}).values;
  const derived = deriveAutofillValues({ ...(ctx.current ?? {}), ...available }, spoken);
  for (const [key, v] of Object.entries(derived)) {
    if (key in values || !AUTOFILL_FIELDS[key]) continue;
    values[key] = v;
    confidence[key] = "high";
    sources[key] = "derived";
  }

  // Titlu și descriere: doar din fapte (regulile AI Marketing).
  let title = response.title?.trim().slice(0, 120) || null;
  let description = response.description?.trim().slice(0, 4000) || null;
  if (title || description) {
    const facts = buildMarketingFactSheet({
      ...values,
      transaction_kind: values["transaction"],
      description: ctx.spokenText || response.transcript || null,
      features: Object.entries(values).flatMap(([k, v]) => (AUTOFILL_FIELDS[k]?.kind === "multi" ? (v as string[]) : AUTOFILL_FIELDS[k]?.kind === "select" && typeof v === "string" ? [v] : [])),
    });
    if (title && validateMarketingFacts(title, facts).status === "invalid") { ignored.push("title"); title = null; }
    if (description && validateMarketingFacts(description, facts).status === "invalid") { ignored.push("description"); description = null; }
  }

  let photoOrder: number[] | null = null;
  const order = response.photo_order ?? null;
  if (order && ctx.photoCount > 1) {
    const unique = [...new Set(order.filter((i) => i >= 0 && i < ctx.photoCount))];
    const rest = Array.from({ length: ctx.photoCount }, (_, i) => i).filter((i) => !unique.includes(i));
    const full = [...unique, ...rest];
    photoOrder = full.some((v, i) => v !== i) ? full : null;
  }

  return { values, confidence, sources, title: title ? normalizeListingText(title) : null, description: description ? normalizeListingText(description) : null, photoOrder, ignored };
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || value === false || (Array.isArray(value) && value.length === 0);
}

/** În editare: păstrează doar propunerile pentru câmpurile goale. */
export function onlyEmptyFields(proposal: AutofillProposal, current: Record<string, unknown>): AutofillProposal {
  const values: Record<string, AutofillValue> = {};
  const confidence: Record<string, AutofillConfidence> = {};
  const sources: Record<string, AutofillSource> = {};
  for (const [key, value] of Object.entries(proposal.values)) {
    if (!isAutofillFieldEmpty(current, key)) continue;
    values[key] = value;
    confidence[key] = proposal.confidence[key]!;
    if (proposal.sources?.[key]) sources[key] = proposal.sources[key]!;
  }
  return {
    ...proposal,
    values,
    confidence,
    sources,
    title: isEmpty(current["title"]) ? proposal.title : null,
    description: isEmpty(current["description"]) ? proposal.description : null,
  };
}

/** Nomenclatorul trimis modelului în instrucțiuni. */
export function autofillCatalogForPrompt(): string {
  return Object.entries(AUTOFILL_FIELDS).map(([key, def]) => {
    const rule = def.explicit ? " [DOAR dacă e spus explicit]" : def.fromPhotos ? " [se poate deduce din poze]" : " [doar din text]";
    const opts = def.options ? `: ${def.kind === "multi" ? "listă din " : "una din "}${def.options.map((o) => JSON.stringify(o)).join(", ")}` : def.kind === "number" ? ": număr" : def.kind === "boolean" ? ": true" : ": text exact spus";
    return `- ${key} (${def.label})${opts}${rule}`;
  }).join("\n");
}

const LOCATION_KEYS = ["city", "district", "address"] as const;
const TX_KEYS = ["transaction", "price", "currency"] as const;

/** Împarte valorile propuse pe zonele formularului (detalii, localizare, tranzacție). */
export function splitAutofillValues(values: Record<string, unknown>) {
  const details: Record<string, unknown> = {};
  const location: Partial<Record<(typeof LOCATION_KEYS)[number], string>> = {};
  const tx: { transaction?: "sale" | "rent"; price?: number; currency?: string } = {};
  for (const [key, value] of Object.entries(values)) {
    if ((LOCATION_KEYS as readonly string[]).includes(key)) location[key as (typeof LOCATION_KEYS)[number]] = String(value);
    else if (key === "transaction") tx.transaction = value as "sale" | "rent";
    else if (key === "price") tx.price = value as number;
    else if (key === "currency") tx.currency = value as string;
    else details[key] = value;
  }
  return { details, location, tx };
}

export function autofillFieldLabel(key: string): string {
  if (key === "title") return "Titlu";
  if (key === "description") return "Descriere";
  return AUTOFILL_FIELDS[key]?.label ?? key;
}
