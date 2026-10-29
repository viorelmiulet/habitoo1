import { OFERA_BASE_URL } from "./config";
import { object } from "./response";
import { parseOferaCategory, parseOferaCategoryIndex, parseOferaPlaces, stableOferaJson, type OferaCatalog, type OferaSyncCounts, type OferaChanges } from "./nomenclature";
export type OferaNomenclaturePayload = OferaCatalog & { raw: { categories: unknown; counties: unknown; zones: unknown; cities: { count: number; hash: string } } };
export type OferaNomenclatureResult = { ok: boolean; syncedAt: string; counts: OferaSyncCounts | null; changes: OferaChanges | null; message: string | null };
export async function downloadOferaNomenclature(fetcher: typeof fetch = (url, init) => fetch(url, init)): Promise<OferaNomenclaturePayload> {
  const get = async (path: string): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetcher(`${OFERA_BASE_URL}${path}`, { method: "GET", redirect: "manual", signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "Habitoo CRM (+https://habitoo.ro)" } });
      const body: unknown = await response.json();
      if (!response.ok || object(body)?.["code"] === "ERROR") throw new Error(`Ofera a refuzat citirea ${path}.`);
      return body;
    } catch { throw new Error(`Răspuns Ofera invalid sau indisponibil: ${path}. Datele existente rămân neschimbate.`); }
    finally { clearTimeout(timer); }
  };
  const [rawCategories, rawCounties, rawCities, rawZones] = await Promise.all([get("/categories"), get("/counties"), get("/cities"), get("/zones")]);
  const index = parseOferaCategoryIndex(rawCategories);
  const details: Record<string, unknown> = {};
  const categories = [] as OferaCatalog["categories"];
  // Bounded parallelism; every detail must validate before apply.
  const entries = await Promise.all(index.categories.map(async (c) => {
    if (!index.realEstateIds.has(c.id)) return c;
    return c;
  }));
  for (let start = 0; start < entries.length; start += 6) {
    const batch = await Promise.all(entries.slice(start, start + 6).map(async (c) => {
      if (!index.realEstateIds.has(c.id)) return c;
      const raw = await get(`/categories/${c.id}`);
      const detail = parseOferaCategory(raw);
      if (detail.id !== c.id || detail.path_url !== c.path_url || detail.depth !== c.depth || stableOferaJson(detail.children) !== stableOferaJson(c.children)) throw new Error(`Categoria Ofera ${c.id} nu corespunde listei generale.`);
      details[String(c.id)] = raw;
      return { ...detail, parent_id: c.parent_id };
    }));
    categories.push(...batch.map(({ children: _children, ...c }) => c));
  }
  const counties = parseOferaPlaces(rawCounties, "counties");
  const cities = parseOferaPlaces(rawCities, "cities", new Set(counties.map((c) => c.id)));
  const zones = parseOferaPlaces(rawZones, "zones", new Set(cities.map((c) => c.id)));
  const bytes = new TextEncoder().encode(stableOferaJson(rawCities));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
  return { categories, counties, cities, zones, raw: { categories: { index: rawCategories, details }, counties: rawCounties, zones: rawZones, cities: { count: cities.length, hash } } };
}
export async function runOferaNomenclatureSync(deps: { download?: () => Promise<OferaNomenclaturePayload>; apply: (p: OferaNomenclaturePayload) => Promise<OferaNomenclatureResult>; failure: (message: string) => Promise<OferaNomenclatureResult> }): Promise<OferaNomenclatureResult> {
  try { return await deps.apply(await (deps.download ?? downloadOferaNomenclature)()); }
  catch (error) { return deps.failure(error instanceof Error ? error.message : "Sincronizarea Ofera nu a reușit. Datele existente rămân neschimbate."); }
}
export async function syncOferaNomenclatureServer(actorId: string | null = null): Promise<OferaNomenclatureResult> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return runOferaNomenclatureSync({
    async apply(payload) {
      const { data, error } = await db.rpc("ofera_nomenclature_apply", { p_payload: payload as never, p_actor: actorId });
      if (error) throw new Error("Nomenclatorul Ofera nu a putut fi salvat. Datele existente rămân neschimbate.");
      return data as unknown as OferaNomenclatureResult;
    },
    async failure(message) {
      const syncedAt = new Date().toISOString();
      const { error } = await db.from("ofera_nomenclature_syncs").insert({ synced_at: syncedAt, synced_by: actorId, success: false, error_message: message });
      if (error) throw new Error("Eșecul sincronizării Ofera nu a putut fi jurnalizat.");
      return { ok: false, syncedAt, counts: null, changes: null, message };
    },
  });
}