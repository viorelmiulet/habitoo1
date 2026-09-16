/**
 * Sincronizarea și cache-ul catalogului La Cheie (`/options`, `/counties`,
 * `/cities?county_id=…`). Server-only.
 *
 * Catalogul se salvează în `portal_taxonomy_cache` (portal = `lacheie`,
 * `site_urn` = `<organization_id>:<mediu>`), deci fiecare agenție și fiecare
 * mediu are propriul catalog, iar refresh-ul manual este posibil oricând.
 */
import { LACHEIE_PORTAL_KEY, type LaCheieEnvironment } from "./config";
import {
  EMPTY_LACHEIE_CATALOG,
  parseLaCheieCities,
  parseLaCheieCounties,
  parseLaCheieOptions,
  type LaCheieCatalog,
  type LaCheieCity,
} from "./catalog";
import { laCheieRequest, type LaCheieRequestConfig } from "./client.server";

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

function cacheKey(organizationId: string, environment: LaCheieEnvironment): string {
  return `${organizationId}:${environment}`;
}

export async function readLaCheieCatalog(
  admin: AdminClient,
  input: { organizationId: string; environment: LaCheieEnvironment },
): Promise<LaCheieCatalog | null> {
  const { data } = await admin
    .from("portal_taxonomy_cache")
    .select("categories, fetched_at")
    .eq("portal", LACHEIE_PORTAL_KEY)
    .eq("site_urn", cacheKey(input.organizationId, input.environment))
    .maybeSingle();
  if (!data?.categories || typeof data.categories !== "object") return null;
  const cached = data.categories as unknown as Partial<LaCheieCatalog>;
  if (!cached.options || !cached.counties || !cached.cities) return null;
  return {
    options: cached.options,
    counties: cached.counties,
    cities: cached.cities,
    fetchedAt: data.fetched_at ?? cached.fetchedAt ?? "",
  };
}

export type CatalogRefresh =
  | {
      ok: true;
      catalog: LaCheieCatalog;
      counts: { optionGroups: number; counties: number; cities: number };
    }
  | { ok: false; message: string; status: number };

/** Descarcă tot catalogul și îl salvează. Citirile respectă limita de 120/min. */
export async function refreshLaCheieCatalog(
  admin: AdminClient,
  config: LaCheieRequestConfig,
  input: {
    organizationId: string;
    environment: LaCheieEnvironment;
    actorId: string | null;
  },
): Promise<CatalogRefresh> {
  const options = await laCheieRequest(config, { method: "GET", path: "/options", scope: "provider" });
  if (!options.ok) {
    return {
      ok: false,
      status: options.status,
      message: options.classification?.message ?? "Catalogul La Cheie nu a putut fi descărcat.",
    };
  }
  const counties = await laCheieRequest(config, { method: "GET", path: "/counties", scope: "provider" });
  if (!counties.ok) {
    return {
      ok: false,
      status: counties.status,
      message: counties.classification?.message ?? "Lista de județe La Cheie nu a putut fi citită.",
    };
  }

  const countyList = parseLaCheieCounties(counties.body);
  const cities: Record<string, LaCheieCity[]> = {};
  for (const county of countyList) {
    const response = await laCheieRequest(config, {
      method: "GET",
      path: "/cities",
      scope: "provider",
      query: { county_id: county.id },
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message:
          response.classification?.message ??
          `Localitățile pentru județul ${county.name} nu au putut fi citite.`,
      };
    }
    cities[county.id] = parseLaCheieCities(response.body, county.id);
  }

  const catalog: LaCheieCatalog = {
    options: parseLaCheieOptions(options.body),
    counties: countyList,
    cities,
    fetchedAt: new Date().toISOString(),
  };

  await admin.from("portal_taxonomy_cache").upsert(
    {
      portal: LACHEIE_PORTAL_KEY,
      site_urn: cacheKey(input.organizationId, input.environment),
      organization_id: input.organizationId,
      categories: catalog as unknown as never,
      discrepancies: {},
      fetched_at: catalog.fetchedAt,
      fetched_by: input.actorId,
    },
    { onConflict: "portal,site_urn" },
  );

  return {
    ok: true,
    catalog,
    counts: {
      optionGroups: Object.keys(catalog.options).length,
      counties: countyList.length,
      cities: Object.values(cities).reduce((total, list) => total + list.length, 0),
    },
  };
}

export function emptyCatalog(): LaCheieCatalog {
  return { ...EMPTY_LACHEIE_CATALOG, cities: {}, counties: [], options: {} };
}
