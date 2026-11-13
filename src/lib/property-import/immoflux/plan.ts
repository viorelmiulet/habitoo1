/**
 * Decizia de import IMMOFLUX (pură): create / update / skip pentru fiecare
 * element, plus pozele de pus în coadă. Nu atinge rețeaua sau baza de date.
 */
import {
  FILL_IF_EMPTY_FIELDS,
  mapImmofluxItem,
  type ImmofluxFillField,
  type ImmofluxImage,
  type ImmofluxItem,
  type ImmofluxMapperContext,
  type ImmofluxPropertyRow,
} from "./mapper";

export type ExistingImmofluxProperty = {
  id: string;
  external_id: string;
  county: string | null;
  city: string | null;
  county_siruta_code: number | null;
  uat_siruta_code: number | null;
  locality_siruta_code: number | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  location_precise: boolean;
  /** `source_url` deja pe proprietate sau deja în coadă. */
  known_image_urls: string[];
  /** Valorile actuale ale câmpurilor completate doar dacă sunt goale. */
  fill?: Partial<Record<ImmofluxFillField, unknown>>;
};

/** Câmpuri care nu se suprascriu niciodată la actualizare. */
export const PROTECTED_FIELDS = [
  "status",
  "assigned_to",
  "reference",
  "created_by",
  "organization_id",
  "source",
  "external_id",
] as const;

/** Câmpuri de locație: se scriu doar dacă sunt goale în Habitoo. */
export const LOCATION_FIELDS = [
  "county",
  "city",
  "county_siruta_code",
  "uat_siruta_code",
  "locality_siruta_code",
  "district",
  "lat",
  "lng",
  "location_precise",
] as const;

export type ImmofluxUpdatePatch = Partial<Omit<ImmofluxPropertyRow, (typeof PROTECTED_FIELDS)[number]>>;

export type PlannedItem =
  | {
      action: "create";
      externalId: string;
      title: string;
      row: ImmofluxPropertyRow;
      images: ImmofluxImage[];
      warnings: string[];
    }
  | {
      action: "update";
      externalId: string;
      title: string;
      propertyId: string;
      patch: ImmofluxUpdatePatch;
      images: ImmofluxImage[];
      warnings: string[];
    }
  | { action: "skip"; externalId: string | null; title: string | null; reasons: string[] };

export type ImmofluxImportPlan = {
  items: PlannedItem[];
  counts: { create: number; update: number; skip: number; images: number };
};

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || value === false;
}

/** Valoare implicită (fără informație) pentru booleenele cu default în DB. */
function isDefaultBoolean(key: ImmofluxFillField, value: unknown): boolean {
  if (key === "vat_included") return value !== false;
  if (key === "is_exclusive") return false;
  return typeof value === "boolean" && value === false;
}

function isBlankMapped(key: ImmofluxFillField, value: unknown): boolean {
  if (key === "is_exclusive") return value === null || value === undefined;
  if (typeof value === "boolean" || key === "vat_included") return isDefaultBoolean(key, value);
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function isBlankExisting(key: ImmofluxFillField, value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return isDefaultBoolean(key, value);
  return false;
}

function buildPatch(row: ImmofluxPropertyRow, existing: ExistingImmofluxProperty): ImmofluxUpdatePatch {
  const patch: Record<string, unknown> = { ...row };
  for (const key of PROTECTED_FIELDS) delete patch[key];
  for (const key of LOCATION_FIELDS) {
    if (!isEmpty(existing[key])) delete patch[key];
  }
  for (const key of FILL_IF_EMPTY_FIELDS) {
    if (!isBlankMapped(key, patch[key]) && isBlankExisting(key, existing.fill?.[key])) continue;
    delete patch[key];
  }
  return patch as ImmofluxUpdatePatch;
}

export function planImmofluxImport(
  items: readonly unknown[],
  existing: readonly ExistingImmofluxProperty[],
  context: ImmofluxMapperContext,
): ImmofluxImportPlan {
  const byExternalId = new Map(existing.map((e) => [e.external_id, e]));
  const seen = new Set<string>();
  const planned: PlannedItem[] = [];
  const counts = { create: 0, update: 0, skip: 0, images: 0 };

  for (const raw of items) {
    if (!raw || typeof raw !== "object" || typeof (raw as ImmofluxItem).id !== "number") {
      planned.push({
        action: "skip",
        externalId: null,
        title: null,
        reasons: ["Element fără `id` numeric în fișier."],
      });
      counts.skip += 1;
      continue;
    }
    const item = raw as ImmofluxItem;
    const externalId = String(item.id);
    const rawTitle = typeof item.title?.ro === "string" ? item.title.ro.trim() || null : null;

    if (seen.has(externalId)) {
      planned.push({
        action: "skip",
        externalId,
        title: rawTitle,
        reasons: ["Element duplicat în același fișier: prima apariție a fost păstrată."],
      });
      counts.skip += 1;
      continue;
    }
    seen.add(externalId);

    const mapped = mapImmofluxItem(item, context);
    if (!mapped.ok) {
      planned.push({ action: "skip", externalId, title: rawTitle, reasons: mapped.reasons });
      counts.skip += 1;
      continue;
    }

    const match = byExternalId.get(externalId);
    const known = new Set(match?.known_image_urls ?? []);
    const images = mapped.images.filter((img) => {
      if (known.has(img.source_url)) return false;
      known.add(img.source_url);
      return true;
    });
    counts.images += images.length;

    if (match) {
      planned.push({
        action: "update",
        externalId,
        title: mapped.row.title,
        propertyId: match.id,
        patch: buildPatch(mapped.row, match),
        images,
        warnings: mapped.warnings,
      });
      counts.update += 1;
    } else {
      planned.push({
        action: "create",
        externalId,
        title: mapped.row.title,
        row: mapped.row,
        images,
        warnings: mapped.warnings,
      });
      counts.create += 1;
    }
  }

  return { items: planned, counts };
}
