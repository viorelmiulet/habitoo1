/**
 * Catalogul de categorii Imobiliare.ro (`category_api`).
 *
 * Documentația citită NU enumeră valorile posibile, iar noi nu ghicim numere.
 * Încercăm endpointurile candidate la conectare; ce răspunde se salvează în
 * setările conexiunii și se folosește la publicare. Dacă niciunul nu răspunde,
 * publicarea se blochează cu mesaj explicit, nu cu o valoare inventată.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeRoName } from "@/lib/ro-normalize";
import { IMOBILIARE_PATHS, IMOBILIARE_PORTAL_KEY } from "./config";
import { imobiliareAuthedRequest, type ImobiliareSession } from "./auth.server";
import { housingTypeFor } from "./taxonomy";

type Admin = SupabaseClient<Database>;

export type ImobiliareCategory = {
  id: number;
  name: string;
  /** Tranzacția declarată de portal (`offer_type`), când o expune. */
  offerType?: "sale" | "rent" | null;
};

export type CategoryCatalog = {
  categories: ImobiliareCategory[];
  fetchedAt: string | null;
  error: string | null;
};

export const IMOBILIARE_CATEGORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function categoryCatalogIsFresh(
  catalog: CategoryCatalog,
  now = Date.now(),
): boolean {
  if (catalog.categories.length === 0 || !catalog.fetchedAt) return false;
  const fetchedAt = Date.parse(catalog.fetchedAt);
  return Number.isFinite(fetchedAt) && now - fetchedAt < IMOBILIARE_CATEGORY_MAX_AGE_MS;
}

/** Normalizează orice formă de listă returnată de portal. */
export function parseCategories(body: unknown): ImobiliareCategory[] {
  const source = Array.isArray(body)
    ? body
    : body && typeof body === "object"
      ? ((body as Record<string, unknown>)["data"] ??
        (body as Record<string, unknown>)["categories"] ??
        (body as Record<string, unknown>)["items"])
      : null;
  if (!Array.isArray(source)) return [];
  const out: ImobiliareCategory[] = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const rawId = row["id"] ?? row["category_api"] ?? row["value"];
    const id = typeof rawId === "number" ? rawId : Number.parseInt(String(rawId ?? ""), 10);
    const name = String(row["name"] ?? row["label"] ?? row["title"] ?? "").trim();
    if (Number.isFinite(id) && id > 0 && name) out.push({ id, name });
  }
  return out;
}

export function readCategoryCatalog(settings: Record<string, unknown> | null): CategoryCatalog {
  const raw = settings ?? {};
  const stored = raw["imobiliare_categories"];
  return {
    categories: Array.isArray(stored) ? parseCategories(stored) : [],
    fetchedAt:
      typeof raw["imobiliare_categories_fetched_at"] === "string"
        ? (raw["imobiliare_categories_fetched_at"] as string)
        : null,
    error:
      typeof raw["imobiliare_categories_error"] === "string"
        ? (raw["imobiliare_categories_error"] as string)
        : null,
  };
}

/** Potrivire categorie după numele returnat de portal (fără ghicit id-uri). */
const NAME_HINTS: Record<string, string[]> = {
  apartment: ["apartament"],
  studio: ["garsoniera", "apartament"],
  house: ["casa", "case", "vila", "vile"],
  land: ["teren"],
  commercial_space: ["spatiu comercial", "comercial"],
  office_space: ["birou", "spatiu birou"],
  industrial_space: ["industrial", "hala", "depozit"],
};

export function categoryApiFor(
  catalog: CategoryCatalog,
  propertyType: string | null,
  transaction: "sale" | "rent",
): number | null {
  if (catalog.categories.length === 0) return null;
  const housing = housingTypeFor(propertyType);
  const hints = housing ? (NAME_HINTS[housing] ?? []) : [];
  if (hints.length === 0) return null;
  const wanted = transaction === "sale" ? ["vanzare", "vand"] : ["inchiriere", "inchiriez"];

  const scored = catalog.categories
    .map((category) => {
      const name = normalizeRoName(category.name);
      const typeHit = hints.some((hint) => name.includes(normalizeRoName(hint)));
      if (!typeHit) return null;
      const transactionHit = wanted.some((word) => name.includes(word));
      const transactionMiss = (transaction === "sale" ? ["inchiriere"] : ["vanzare"]).some((word) =>
        name.includes(word),
      );
      if (transactionMiss) return null;
      return { id: category.id, score: transactionHit ? 2 : 1 };
    })
    .filter((entry): entry is { id: number; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.id ?? null;
}

/** Interoghează endpointurile candidate și salvează rezultatul în conexiune. */
export async function refreshCategoryCatalog(
  admin: Admin,
  session: ImobiliareSession,
  organizationId: string,
): Promise<{ ok: boolean; catalog: CategoryCatalog; message: string }> {
  const attempts: string[] = [];
  for (const path of IMOBILIARE_PATHS.categories) {
    const response = await imobiliareAuthedRequest(session, {
      method: "GET",
      path,
      connectionKey: organizationId,
    });
    attempts.push(`${path} → HTTP ${response.status}`);
    if (!response.ok) continue;
    const categories = parseCategories(response.body);
    if (categories.length === 0) continue;
    const fetchedAt = new Date().toISOString();
    await patchSettings(admin, organizationId, {
      imobiliare_categories: categories,
      imobiliare_categories_fetched_at: fetchedAt,
      imobiliare_categories_error: null,
    });
    return {
      ok: true,
      catalog: { categories, fetchedAt, error: null },
      message: `Catalog de categorii sincronizat (${categories.length} categorii).`,
    };
  }

  const message = `Imobiliare.ro nu a expus un catalog de categorii (${attempts.join("; ")}). Publicarea rămâne blocată până primim valorile pentru category_api.`;
  await patchSettings(admin, organizationId, { imobiliare_categories_error: message });
  return { ok: false, catalog: { categories: [], fetchedAt: null, error: message }, message };
}

async function patchSettings(
  admin: Admin,
  organizationId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data: row } = await admin
    .from("portal_connections")
    .select("id, settings")
    .eq("organization_id", organizationId)
    .eq("portal", IMOBILIARE_PORTAL_KEY)
    .maybeSingle();
  if (!row) return;
  const settings = { ...((row.settings ?? {}) as Record<string, unknown>), ...patch };
  await admin
    .from("portal_connections")
    .update({ settings } as never)
    .eq("id", row.id);
}
