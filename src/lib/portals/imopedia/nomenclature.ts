/**
 * Imopedia.ro: validarea fișierelor publice regions.json / areas.json și
 * planul de import idempotent (pur, fără rețea sau DB).
 */
import { imopediaNormalize, type ImopediaAreaRow, type ImopediaRegionRow } from "./location";

export const IMOPEDIA_REGIONS_URL = "https://www.imopedia.ro/storage/editorial/regions.json";
export const IMOPEDIA_AREAS_URL = "https://www.imopedia.ro/storage/editorial/areas.json";

export class ImopediaNomenclatureFormatError extends Error {}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Aruncă dacă fișierul nu e listă sau un element nu are câmpurile așteptate. */
export function parseImopediaRegions(raw: unknown): ImopediaRegionRow[] {
  if (!Array.isArray(raw)) throw new ImopediaNomenclatureFormatError("regions.json nu este o listă.");
  return raw.map((r, i) => {
    if (!r || typeof r !== "object" || !isInt((r as any).id) || typeof (r as any).name !== "string") {
      throw new ImopediaNomenclatureFormatError(`regions.json: elementul ${i} nu are id/name valide.`);
    }
    return { id: (r as any).id, name: String((r as any).name).trim() };
  });
}

export function parseImopediaAreas(raw: unknown): ImopediaAreaRow[] {
  if (!Array.isArray(raw)) throw new ImopediaNomenclatureFormatError("areas.json nu este o listă.");
  return raw.map((r, i) => {
    const o = r as Record<string, unknown> | null;
    if (
      !o ||
      typeof o !== "object" ||
      !isInt(o.id) ||
      typeof o.area !== "string" ||
      !isInt(o.region_id) ||
      !(o.parent_id === null || isInt(o.parent_id)) ||
      !isInt(o.depth) ||
      typeof o.usable_in_api !== "boolean"
    ) {
      throw new ImopediaNomenclatureFormatError(
        `areas.json: elementul ${i} nu are câmpurile id/area/region_id/parent_id/depth/usable_in_api.`,
      );
    }
    return {
      id: o.id,
      area: o.area.trim(),
      region_id: o.region_id,
      parent_id: o.parent_id as number | null,
      depth: o.depth,
      usable_in_api: o.usable_in_api,
    };
  });
}

export type ImopediaImportCounts = {
  read: number;
  inserted: number;
  updated: number;
  unchanged: number;
  rejected: number;
  disabled: number;
};

export type ImopediaPlan<T> = { upserts: T[]; disableIds: number[]; counts: ImopediaImportCounts };

function dedupe<T extends { id: number }>(rows: T[]): { rows: T[]; rejected: number } {
  const seen = new Set<number>();
  const out: T[] = [];
  let rejected = 0;
  for (const r of rows) {
    if (seen.has(r.id)) rejected++;
    else {
      seen.add(r.id);
      out.push(r);
    }
  }
  return { rows: out, rejected };
}

export type StoredRegion = ImopediaRegionRow & { name_normalized: string };
export type StoredArea = ImopediaAreaRow & { area_normalized: string };

export function planImopediaRegions(
  incoming: ImopediaRegionRow[],
  existing: StoredRegion[],
): ImopediaPlan<StoredRegion> {
  const { rows, rejected } = dedupe(incoming);
  const prev = new Map(existing.map((r) => [r.id, r]));
  const counts: ImopediaImportCounts = { read: incoming.length, inserted: 0, updated: 0, unchanged: 0, rejected, disabled: 0 };
  const upserts: StoredRegion[] = [];
  for (const r of rows) {
    const next = { ...r, name_normalized: imopediaNormalize(r.name) };
    const old = prev.get(r.id);
    if (!old) counts.inserted++;
    else if (old.name !== next.name || old.name_normalized !== next.name_normalized) counts.updated++;
    else {
      counts.unchanged++;
      continue;
    }
    upserts.push(next);
  }
  return { upserts, disableIds: [], counts };
}

/** Nodurile care lipsesc din import nu se șterg: devin `usable_in_api = false`. */
export function planImopediaAreas(
  incoming: ImopediaAreaRow[],
  existing: StoredArea[],
): ImopediaPlan<StoredArea> {
  const { rows, rejected } = dedupe(incoming);
  const prev = new Map(existing.map((r) => [r.id, r]));
  const counts: ImopediaImportCounts = { read: incoming.length, inserted: 0, updated: 0, unchanged: 0, rejected, disabled: 0 };
  const upserts: StoredArea[] = [];
  for (const r of rows) {
    const next: StoredArea = { ...r, area_normalized: imopediaNormalize(r.area) };
    const old = prev.get(r.id);
    if (!old) counts.inserted++;
    else if (
      old.area !== next.area ||
      old.area_normalized !== next.area_normalized ||
      old.region_id !== next.region_id ||
      old.parent_id !== next.parent_id ||
      old.depth !== next.depth ||
      old.usable_in_api !== next.usable_in_api
    )
      counts.updated++;
    else {
      counts.unchanged++;
      continue;
    }
    upserts.push(next);
  }
  const ids = new Set(rows.map((r) => r.id));
  const disableIds = existing.filter((e) => !ids.has(e.id) && e.usable_in_api).map((e) => e.id);
  counts.disabled = disableIds.length;
  return { upserts, disableIds, counts };
}
