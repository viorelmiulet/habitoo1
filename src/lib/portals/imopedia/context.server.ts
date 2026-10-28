/**
 * Imopedia.ro: încărcarea contextului de mapare din DB (nomenclator + colaborare).
 * Nomenclatorul (~9 000 noduri) se ține în memorie 10 minute per worker.
 */
import { resolveImopediaLocation, type ImopediaAreaRow, type ImopediaRegionRow } from "./location";
import type { ImopediaMapContext } from "./mapper";

type Db = { from: (table: string) => any };

const TTL_MS = 10 * 60_000;
let cache: { at: number; regions: ImopediaRegionRow[]; areas: ImopediaAreaRow[] } | null = null;

export async function loadImopediaNomenclature(db: Db): Promise<{ regions: ImopediaRegionRow[]; areas: ImopediaAreaRow[] }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const { data: regions } = await db.from("imopedia_regions").select("id,name");
  const areas: ImopediaAreaRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page } = await db
      .from("imopedia_areas")
      .select("id,area,region_id,parent_id,depth,usable_in_api")
      .order("id")
      .range(from, from + 999);
    areas.push(...((page ?? []) as ImopediaAreaRow[]));
    if (!page || page.length < 1000) break;
  }
  cache = { at: Date.now(), regions: (regions ?? []) as ImopediaRegionRow[], areas };
  return cache;
}

export function imopediaMapContext(
  p: Record<string, any>,
  agencyId: number,
  nomenclature: { regions: ImopediaRegionRow[]; areas: ImopediaAreaRow[] },
): ImopediaMapContext {
  return {
    agencyId,
    location: resolveImopediaLocation(
      { county: p.county, city: p.city, neighborhood: p.district },
      nomenclature.regions,
      nomenclature.areas,
    ),
    collaboration: {
      active: p.collaboration === true && p.collaboration_opted_out !== true,
      commissionPercent: typeof p.collab_commission_percent === "number" ? p.collab_commission_percent : null,
    },
  };
}
