/**
 * „Grad de completare” al unui anunț: o singură funcție pură, folosită de
 * cardul din formular/fișă și de verificarea de publicare de pe server.
 * Folosește doar câmpuri existente; elementele neaplicabile tipului nu apar.
 */
import { IMOSPOT_MIN_DESCRIPTION } from "@/lib/portals/imospot/mapper";
import { propertyTypeLabels, transactionLabels } from "@/lib/labels";

export const COMPLETENESS_MIN_PHOTOS = 5;
const ROOM_TYPES = new Set(["apartment", "studio", "house"]);

export type CompletenessInput = {
  propertyType: string | null;
  title: string | null;
  forSale: boolean;
  forRent: boolean;
  salePrice: number | null;
  rentPrice: number | null;
  city: string | null;
  assignedTo: string | null;
  hasCover: boolean;
  imageCount: number;
  usableSurface: number | null;
  landSurface: number | null;
  description: string | null;
  rooms: number | null;
  energyClass: string | null;
  hasContract: boolean;
  lat: number | null;
  lng: number | null;
};

export type CompletenessKey =
  | "title" | "sale_price" | "rent_price" | "city" | "agent" | "cover" | "surface"
  | "description" | "photos" | "rooms" | "energy_class" | "contract" | "coords";

export type CompletenessItem = { key: CompletenessKey; label: string; done: boolean; required: boolean };

export type CompletenessResult = {
  items: CompletenessItem[];
  required: CompletenessItem[];
  recommended: CompletenessItem[];
  done: number;
  total: number;
  percent: number;
  missingRequired: CompletenessItem[];
  label: string;
};

const positive = (n: unknown) => n != null && n !== "" && Number.isFinite(Number(n)) && Number(n) > 0;
const filled = (s: string | null | undefined) => Boolean(s && s.trim());

export function computeCompleteness(input: CompletenessInput): CompletenessResult {
  const type = input.propertyType ?? "apartment";
  const forSale = input.forSale || !input.forRent;
  const isLand = type === "land";
  const required: CompletenessItem[] = [
    { key: "title", label: "Titlu", done: filled(input.title), required: true },
  ];
  if (forSale) required.push({ key: "sale_price", label: input.forRent ? "Preț vânzare" : "Preț", done: positive(input.salePrice), required: true });
  if (input.forRent) required.push({ key: "rent_price", label: forSale ? "Preț închiriere" : "Preț", done: positive(input.rentPrice), required: true });
  required.push(
    { key: "city", label: "Oraș (localitate)", done: filled(input.city), required: true },
    { key: "agent", label: "Agent alocat", done: filled(input.assignedTo), required: true },
    { key: "cover", label: "Fotografie de copertă", done: input.hasCover, required: true },
    { key: "surface", label: isLand ? "Suprafață teren (m²)" : "Suprafață utilă (m²)", done: positive(isLand ? input.landSurface : input.usableSurface), required: true },
  );
  const recommended: CompletenessItem[] = [
    { key: "description", label: `Descriere (minim ${IMOSPOT_MIN_DESCRIPTION} caractere)`, done: (input.description ?? "").trim().length >= IMOSPOT_MIN_DESCRIPTION, required: false },
    { key: "photos", label: `Minim ${COMPLETENESS_MIN_PHOTOS} fotografii`, done: input.imageCount >= COMPLETENESS_MIN_PHOTOS, required: false },
  ];
  if (ROOM_TYPES.has(type)) recommended.push({ key: "rooms", label: "Camere", done: positive(input.rooms), required: false });
  recommended.push(
    { key: "energy_class", label: "Clasă energetică", done: filled(input.energyClass), required: false },
    { key: "contract", label: "Contract proprietar atașat", done: input.hasContract, required: false },
    { key: "coords", label: "Coordonate pe hartă", done: input.lat != null && input.lng != null, required: false },
  );
  const items = [...required, ...recommended];
  const done = items.filter((i) => i.done).length;
  const kind = forSale ? "sale" : "rent";
  return {
    items, required, recommended, done, total: items.length,
    percent: Math.round((done / items.length) * 100),
    missingRequired: required.filter((i) => !i.done),
    label: `${propertyTypeLabels[type] ?? type} · ${input.forRent && forSale ? "Vânzare și închiriere" : transactionLabels[kind]}`,
  };
}

export function missingRequiredMessage(result: CompletenessResult): string | null {
  if (!result.missingRequired.length) return null;
  return `Completează câmpurile obligatorii: ${result.missingRequired.map((i) => i.label).join(", ")}`;
}

/** Rândul din `properties` + agregate → intrarea funcției. */
export function completenessInputFromRow(
  p: Record<string, unknown>,
  extra: { hasCover: boolean; imageCount: number; hasContract: boolean },
): CompletenessInput {
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    propertyType: str(p.property_type), title: str(p.title),
    forSale: Boolean(p.for_sale), forRent: Boolean(p.for_rent),
    salePrice: num(p.sale_price ?? (p.for_sale ? p.price : null)), rentPrice: num(p.rent_price),
    city: str(p.city), assignedTo: str(p.assigned_to),
    usableSurface: num(p.usable_surface), landSurface: num(p.land_surface),
    description: str(p.description), rooms: num(p.rooms), energyClass: str(p.energy_class),
    lat: num(p.lat), lng: num(p.lng), ...extra,
  };
}
