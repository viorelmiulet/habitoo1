/**
 * Validare pre-publicare, declarativă și pură.
 *
 * Fiecare portal își declară EXPLICIT câmpurile obligatorii (blocante) și cele
 * permise/opționale (trimise doar dacă există date reale). Regulile sunt exact
 * cele verificate de mapper-ele fiecărui portal — aici sunt centralizate ca să
 * putem arăta lista în interfață ȘI să blocăm publicarea înainte de orice apel
 * către portal. Nu inventăm cerințe: dacă un portal nu declară reguli proprii,
 * se aplică doar setul comun minim.
 */

import { HOMEPITCH_MAX_TITLE } from "./homepitch/mapper";
import { IMOBILIARE_DESCRIPTION_MIN, IMOBILIARE_TITLE_MAX } from "./imobiliare/config";
import { normalizeImobiliareMobile } from "./imobiliare/contact";
import { LACHEIE_MIN_DESCRIPTION, LACHEIE_MIN_TITLE } from "./lacheie/mapper";
import { IMOSPOT_MIN_DESCRIPTION, IMOSPOT_MIN_TITLE } from "./imospot/mapper";
import { OI_MIN_DESCRIPTION, OI_MIN_TITLE } from "./oferteimobiliare/mapper";
import {
  ROMIMO_LAYOUTS,
  ROMIMO_TEXT_MIN,
  ROMIMO_TITLE_MAX,
  ROMIMO_TITLE_MIN,
} from "./romimo/mapper";
import {
  STORIA_MAX_TITLE,
  STORIA_MIN_DESCRIPTION,
  STORIA_MIN_TITLE,
} from "./storia/mapper";

/** Datele reale ale ofertei, extrase din baza de date (niciun câmp inventat). */
export type PortalRequirementSubject = {
  title: string | null;
  description: string | null;
  propertyType: string | null;
  forSale: boolean;
  forRent: boolean;
  price: number | null;
  currency: string | null;
  city: string | null;
  county: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  imageCount: number;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  buildYear: number | null;
  usableSurface: number | null;
  landSurface: number | null;
  /** Suprafața construită, folosită de portalurile care cer suprafața proprietății. */
  builtSurface: number | null;
  /** Compartimentarea, ca text, exact cum e salvată pe ofertă. */
  layout: string | null;
  /** Tipurile de încălzire salvate pe ofertă. */
  heatingSystems: string[] | null;
  agentName: string | null;
  agentEmail: string | null;
  /** Telefonul de contact efectiv trimis: agentul, altfel agenția. */
  contactPhone: string | null;
};

export type PortalRequirementRule = {
  key: string;
  /** Câmpul, în limbajul agentului. */
  label: string;
  /** Ce cere portalul, exact. */
  requirement: string;
  ok: (s: PortalRequirementSubject) => boolean;
};

export type PortalRequirementSpec = {
  /** Blocante: fără ele publicarea nu pornește. */
  required: PortalRequirementRule[];
  /** Permise: se trimit doar dacă există date reale. */
  allowed: string[];
};

const text = (value: string | null | undefined) => (value ?? "").trim();
const len = (value: string | null | undefined) => text(value).length;
const hasCoords = (s: PortalRequirementSubject) =>
  s.lat !== null && s.lng !== null && Math.abs(s.lat) > 0.0001 && Math.abs(s.lng) > 0.0001;
const isEmail = (value: string | null) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value));

const RULE = {
  title: (min: number, max?: number): PortalRequirementRule => ({
    key: "title",
    label: "Titlu",
    requirement: max
      ? `între ${min} și ${max} caractere`
      : `minimum ${min} caractere`,
    ok: (s) => len(s.title) >= min && (!max || len(s.title) <= max),
  }),
  description: (min: number): PortalRequirementRule => ({
    key: "description",
    label: "Descriere",
    requirement: `minimum ${min} caractere`,
    ok: (s) => len(s.description) >= min,
  }),
  transaction: (): PortalRequirementRule => ({
    key: "transaction",
    label: "Tip tranzacție",
    requirement: "vânzare sau închiriere bifată",
    ok: (s) => s.forSale || s.forRent,
  }),
  price: (): PortalRequirementRule => ({
    key: "price",
    label: "Preț",
    requirement: "valoare pozitivă",
    ok: (s) => typeof s.price === "number" && s.price > 0,
  }),
  currency: (allowed: readonly string[]): PortalRequirementRule => ({
    key: "currency",
    label: "Monedă",
    requirement: allowed.join(" sau "),
    ok: (s) => allowed.includes(text(s.currency).toUpperCase()),
  }),
  propertyType: (): PortalRequirementRule => ({
    key: "property_type",
    label: "Tip proprietate",
    requirement: "completat și mapabil la portal",
    ok: (s) => len(s.propertyType) > 0,
  }),
  location: (): PortalRequirementRule => ({
    key: "location",
    label: "Localitate și județ",
    requirement: "ambele completate",
    ok: (s) => len(s.city) > 0 && len(s.county) > 0,
  }),
  coords: (): PortalRequirementRule => ({
    key: "coordinates",
    label: "Coordonate pe hartă",
    requirement: "poziție reală setată (nu 0/0)",
    ok: hasCoords,
  }),
  images: (min: number): PortalRequirementRule => ({
    key: "images",
    label: "Imagini",
    requirement: `minimum ${min}`,
    ok: (s) => s.imageCount >= min,
  }),
  agentEmail: (): PortalRequirementRule => ({
    key: "agent_email",
    label: "Agent asignat",
    requirement: "agent cu email valid",
    ok: (s) => isEmail(s.agentEmail),
  }),
  agentName: (): PortalRequirementRule => ({
    key: "agent_name",
    label: "Nume agent",
    requirement: "nume complet",
    ok: (s) => len(s.agentName) > 0,
  }),
  phone: (): PortalRequirementRule => ({
    key: "phone",
    label: "Telefon de contact",
    requirement: "telefon valid (agent sau agenție)",
    ok: (s) => text(s.contactPhone).replace(/\D/g, "").length >= 9,
  }),
  imobiliarePhone: (): PortalRequirementRule => ({
    key: "phone",
    label: "Telefon și WhatsApp",
    requirement: "număr românesc valid, trimis pentru ambele câmpuri",
    ok: (s) => normalizeImobiliareMobile(s.contactPhone) !== null,
  }),
  bathrooms: (): PortalRequirementRule => ({
    key: "bathrooms",
    label: "Număr băi",
    requirement: "completat",
    ok: (s) => s.bathrooms !== null,
  }),
  bedrooms: (): PortalRequirementRule => ({
    key: "bedrooms",
    label: "Număr dormitoare",
    requirement: "completat",
    ok: (s) => s.bedrooms !== null,
  }),
  buildYear: (): PortalRequirementRule => ({
    key: "build_year",
    label: "Anul construcției",
    requirement: "completat",
    ok: (s) => s.buildYear !== null,
  }),
  surface: (): PortalRequirementRule => ({
    key: "surface",
    label: "Suprafață utilă/construită",
    requirement: "completată",
    ok: (s) => typeof s.usableSurface === "number" && s.usableSurface > 0,
  }),
  rooms: (): PortalRequirementRule => ({
    key: "rooms",
    label: "Număr camere",
    requirement: "completat",
    ok: (s) => s.rooms !== null,
  }),
  /** Doar pentru case: portalul cere suprafața proprietății (construită sau teren). */
  houseSpace: (): PortalRequirementRule => ({
    key: "house_space",
    label: "Suprafață construită sau teren (case)",
    requirement: "completată pentru case",
    ok: (s) =>
      text(s.propertyType).toLowerCase() !== "house" ||
      [s.builtSurface, s.landSurface, s.usableSurface].some(
        (value) => typeof value === "number" && value > 0,
      ),
  }),
  /** Doar pentru case: portalul cere tipul de încălzire. */
  houseHeating: (): PortalRequirementRule => ({
    key: "house_heating",
    label: "Tip încălzire (case)",
    requirement: "completat pentru case",
    ok: (s) =>
      text(s.propertyType).toLowerCase() !== "house" ||
      (s.heatingSystems ?? []).some((item) => text(item).length > 0),
  }),
  /** Compartimentarea contează doar dacă e completată: trebuie să fie una acceptată. */
  layoutIn: (allowed: readonly string[]): PortalRequirementRule => ({
    key: "layout",
    label: "Compartimentare",
    requirement: `una dintre: ${allowed.join(", ")}`,
    ok: (s) => len(s.layout) === 0 || allowed.includes(text(s.layout)),
  }),
} as const;

const COMMON_ALLOWED = [
  "Suprafețe (utilă, construită, teren)",
  "Camere, dormitoare, băi, bucătării",
  "Etaj și număr de etaje",
  "An construcție, compartimentare, confort",
  "Dotări, utilități, facilități clădire",
  "Încălzire, climatizare, parcare",
  "Adresă, stradă, cartier",
  "Comision și colaborare",
];

const BASE_REQUIRED = [
  RULE.title(5),
  RULE.description(40),
  RULE.transaction(),
  RULE.price(),
  RULE.propertyType(),
  RULE.location(),
  RULE.images(1),
];

export const PORTAL_REQUIREMENTS: Record<string, PortalRequirementSpec> = {
  clickimob: {
    required: BASE_REQUIRED,
    allowed: COMMON_ALLOWED,
  },
  imove: {
    required: BASE_REQUIRED,
    allowed: COMMON_ALLOWED,
  },
  /**
   * Properstar preia ofertele din feed. Cerințele de aici sunt exact nodurile
   * obligatorii din feed: o ofertă fără ele este exclusă, nu trimisă goală.
   */
  properstar: {
    required: [
      RULE.description(1),
      RULE.transaction(),
      RULE.price(),
      RULE.propertyType(),
      RULE.location(),
      RULE.agentEmail(),
    ],
    allowed: COMMON_ALLOWED,
  },

  imospot: {
    required: [
      RULE.title(IMOSPOT_MIN_TITLE),
      RULE.description(IMOSPOT_MIN_DESCRIPTION),
      RULE.transaction(),
      RULE.price(),
      RULE.propertyType(),
      RULE.location(),
      RULE.images(1),
    ],
    allowed: COMMON_ALLOWED,
  },
  oferteimobiliare: {
    required: [
      RULE.title(OI_MIN_TITLE),
      RULE.description(OI_MIN_DESCRIPTION),
      RULE.transaction(),
      RULE.price(),
      RULE.propertyType(),
      RULE.location(),
      RULE.images(1),
    ],
    allowed: COMMON_ALLOWED,
  },
  homepitch: {
    required: [
      RULE.title(5, HOMEPITCH_MAX_TITLE),
      RULE.description(40),
      RULE.transaction(),
      RULE.price(),
      RULE.currency(["EUR"]),
      RULE.propertyType(),
      RULE.location(),
      RULE.coords(),
      RULE.agentEmail(),
    ],
    allowed: COMMON_ALLOWED,
  },
  lacheie: {
    required: [
      RULE.title(LACHEIE_MIN_TITLE),
      RULE.description(LACHEIE_MIN_DESCRIPTION),
      RULE.transaction(),
      RULE.price(),
      RULE.currency(["EUR", "RON", "USD"]),
      RULE.propertyType(),
      RULE.location(),
      RULE.agentName(),
      RULE.phone(),
      RULE.surface(),
      RULE.bedrooms(),
      RULE.bathrooms(),
      RULE.buildYear(),
      RULE.images(1),
    ],
    allowed: COMMON_ALLOWED,
  },
  imobiliare_ro: {
    required: [
      RULE.title(5, IMOBILIARE_TITLE_MAX),
      RULE.description(IMOBILIARE_DESCRIPTION_MIN),
      RULE.transaction(),
      RULE.price(),
      RULE.propertyType(),
      RULE.location(),
      RULE.coords(),
      RULE.images(1),
      RULE.agentEmail(),
      RULE.imobiliarePhone(),
    ],
    allowed: COMMON_ALLOWED,
  },
  storia: {
    required: [
      RULE.title(STORIA_MIN_TITLE, STORIA_MAX_TITLE),
      RULE.description(STORIA_MIN_DESCRIPTION),
      RULE.transaction(),
      RULE.price(),
      RULE.currency(["EUR", "RON"]),
      RULE.propertyType(),
      RULE.location(),
      RULE.coords(),
      RULE.images(1),
    ],
    allowed: COMMON_ALLOWED,
  },
  // Romimo: set minim, fără limite inventate. Lungimile de text, moneda și
  // numărul de imagini se completează în pasul adaptorului, exact din
  // documentația oficială Romimo API v2.
  /**
   * Romimo: exact ce cere mapper-ul (documentația oficială API v2), ca agentul
   * să vadă lipsurile ÎNAINTE de a apăsa „Publică".
   */
  romimo: {
    required: [
      RULE.title(ROMIMO_TITLE_MIN, ROMIMO_TITLE_MAX),
      RULE.description(ROMIMO_TEXT_MIN),
      RULE.transaction(),
      RULE.price(),
      RULE.propertyType(),
      RULE.location(),
      RULE.agentName(),
      RULE.agentEmail(),
      RULE.phone(),
      RULE.surface(),
      RULE.rooms(),
      RULE.buildYear(),
      RULE.layoutIn(ROMIMO_LAYOUTS),
      RULE.houseSpace(),
      RULE.houseHeating(),
    ],
    allowed: COMMON_ALLOWED,
  },
  // PrimulAnunț.ro: setul minim, fără limite inventate — documentația oficială
  // (https://www.primulanunt.ro/api-agentii) respinge cererile invalide cu 422 și
  // lista de câmpuri, dar nu fixează un minim de caractere pentru titlu/descriere.
  // Limitele reale se completează în pasul adaptorului/mapper-ului.
  primulanunt: {
    required: [
      RULE.transaction(),
      RULE.price(),
      RULE.propertyType(),
      RULE.location(),
    ],
    allowed: COMMON_ALLOWED,
  },
};

export type PortalRequirementReport = {
  portalId: string;
  /** `false` pentru portalurile fără reguli declarate (nu blocăm arbitrar). */
  known: boolean;
  ok: boolean;
  missing: { key: string; label: string; requirement: string }[];
  required: { key: string; label: string; requirement: string; ok: boolean }[];
  allowed: string[];
};

/** Lista de cerințe a unui portal, fără date (pentru afișare în interfață). */
export function portalRequirementSpec(portalId: string): PortalRequirementSpec | null {
  return PORTAL_REQUIREMENTS[portalId] ?? null;
}

/** Validare pre-publicare pentru un portal, pe datele reale ale ofertei. */
export function validatePortalRequirements(
  portalId: string,
  subject: PortalRequirementSubject,
): PortalRequirementReport {
  const spec = PORTAL_REQUIREMENTS[portalId];
  if (!spec) {
    return { portalId, known: false, ok: true, missing: [], required: [], allowed: [] };
  }
  const required = spec.required.map((rule) => ({
    key: rule.key,
    label: rule.label,
    requirement: rule.requirement,
    ok: rule.ok(subject),
  }));
  const missing = required
    .filter((r) => !r.ok)
    .map(({ key, label, requirement }) => ({ key, label, requirement }));
  return {
    portalId,
    known: true,
    ok: missing.length === 0,
    missing,
    required,
    allowed: spec.allowed,
  };
}

/** Mesajul blocant afișat agentului, cu câmpurile lipsă enumerate. */
export function requirementBlockMessage(
  portalName: string,
  report: PortalRequirementReport,
): string {
  const fields = report.missing.map((m) => `${m.label} (${m.requirement})`).join(", ");
  return `${portalName}: publicarea este blocată — completează: ${fields}.`;
}
