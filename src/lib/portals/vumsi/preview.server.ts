/**
 * Vumsi (server-only): previzualizarea pentru o proprietate. Doar GET-uri către Vumsi
 * (oraș, utilizator/companie după ID-ul nostru); nu se creează nimic. Rezultatele (city_id,
 * uuid-uri găsite) se salvează în DB.
 */
import { CRM_URL as _unused } from "@/lib/host";
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { hasVumsiKey, VUMSI_KEY_MISSING_MESSAGE } from "./config";
import type { VumsiAttribute, VumsiCategory } from "./nomenclature";
import {
  VUMSI_SETUP_MESSAGE,
  mapPropertyToVumsi,
  pickVumsiCity,
  vumsiAccountReasons,
  vumsiCompanyPayload,
  vumsiLocalityKey,
  vumsiPublicCoords,
  vumsiUserPayload,
  type VumsiCompanyPayload,
  type VumsiListingPlan,
  type VumsiMappings,
  type VumsiUserPayload,
} from "./mapper";
void _unused;

export type VumsiPreview = {
  ok: boolean;
  setupMissing: boolean;
  reasons: string[];
  warnings: string[];
  cityId: number | null;
  cityName: string | null;
  plans: VumsiListingPlan[];
  user: { payload: VumsiUserPayload | null; vumsiUuid: string | null; checked: boolean };
  company: { payload: VumsiCompanyPayload | null; vumsiUuid: string | null; checked: boolean };
};

type Getter = <T>(path: string, query?: Record<string, string | number>) => Promise<{ ok: true; data: T } | { ok: false; kind: string; message: string }>;

async function defaultGetter(): Promise<Getter> {
  const { vumsiGet } = await import("./client.server");
  return async (path, query) => {
    const r = await vumsiGet<any>(path, query ?? {});
    return r.ok ? { ok: true, data: r.data } : { ok: false, kind: r.kind, message: r.message };
  };
}

/** city_id: cache pe localitate → nearest după coordonatele publice → căutare după localitate. */
async function resolveCity(db: any, p: PropertyRow, get: Getter | null): Promise<{ id: number | null; name: string | null; warning: string | null }> {
  const key = vumsiLocalityKey(p);
  if (key) {
    const { data } = await db.from("vumsi_city_cache").select("city_id,city_name").eq("locality_key", key).maybeSingle();
    if (data) return { id: data.city_id, name: data.city_name, warning: null };
  }
  if (!get) return { id: null, name: null, warning: VUMSI_KEY_MISSING_MESSAGE };
  let found: { id: number; name: string } | null = null;
  let source = "nearest";
  const coords = vumsiPublicCoords(p);
  if (coords) {
    const r = await get<Record<string, unknown>>("/locations/cities/nearest/", { lat: coords.lat, lng: coords.lng });
    if (r.ok && Number.isInteger(Number(r.data?.["id"]))) found = { id: Number(r.data["id"]), name: String(r.data["name"] ?? "") };
  }
  if (!found && p.city) {
    source = "search";
    const r = await get<unknown>("/locations/cities/", { q: p.city.replace(/^(municipiul|orașul|oraș|comuna)\s+/i, "") });
    if (r.ok) found = pickVumsiCity(Array.isArray(r.data) ? r.data : (r.data as any)?.results, p.city, p.county ?? null);
  }
  if (found && key) {
    await db.from("vumsi_city_cache").upsert({ locality_key: key, city_id: found.id, city_name: found.name, source, resolved_at: new Date().toISOString() });
  }
  return { id: found?.id ?? null, name: found?.name ?? null, warning: null };
}

async function lookupAccount(db: any, get: Getter | null, kind: "user" | "company", externalId: string, organizationId: string) {
  const { data: saved } = await db.from("vumsi_accounts").select("vumsi_uuid").eq("kind", kind).eq("external_id", externalId).maybeSingle();
  if (!get) return { vumsiUuid: (saved?.vumsi_uuid as string | null) ?? null, checked: false };
  const path = kind === "user" ? `/users/by-external-id/${encodeURIComponent(externalId)}/` : `/companies/by-external-id/${encodeURIComponent(externalId)}/`;
  const r = await get<Record<string, unknown>>(path);
  if (!r.ok && r.kind !== "not_found") throw new Error(r.message);
  const uuid = r.ok && typeof r.data?.["uuid"] === "string" ? (r.data["uuid"] as string) : null;
  await db.from("vumsi_accounts").upsert({ kind, external_id: externalId, organization_id: organizationId, vumsi_uuid: uuid, checked_at: new Date().toISOString() });
  return { vumsiUuid: uuid, checked: true };
}

export async function loadVumsiSetup(db: any) {
  const [{ data: snap }, { data: cats }, { data: types }] = await Promise.all([
    db.from("vumsi_nomenclature_snapshots").select("reference,categories,attributes,synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("vumsi_category_mappings").select("habitoo_kind,transaction,category_id,category_name"),
    db.from("vumsi_type_mappings").select("transaction,type_value,type_label"),
  ]);
  return {
    snapshot: snap as { reference: unknown; categories: VumsiCategory[]; attributes: Record<string, { fields: VumsiAttribute[] }>; synced_at: string } | null,
    mappings: { categories: cats ?? [], types: types ?? [] } as VumsiMappings,
  };
}

export async function buildVumsiPreview(propertyId: string, deps: { db?: any; get?: Getter | null } = {}): Promise<VumsiPreview> {
  const db = deps.db ?? ((await import("@/integrations/supabase/client.server")).supabaseAdmin as any);
  const empty = { payload: null, vumsiUuid: null, checked: false };
  const { snapshot, mappings } = await loadVumsiSetup(db);
  if (!snapshot || !mappings.categories.length || !mappings.types.length) {
    return { ok: false, setupMissing: true, reasons: [VUMSI_SETUP_MESSAGE], warnings: [], cityId: null, cityName: null, plans: [], user: empty, company: empty };
  }
  const { data: p } = await db.from("properties").select("*").eq("id", propertyId).maybeSingle();
  if (!p) throw new Error("Proprietatea nu a fost găsită.");
  const get = deps.get !== undefined ? deps.get : hasVumsiKey() ? await defaultGetter() : null;
  const warnings: string[] = get ? [] : [`${VUMSI_KEY_MISSING_MESSAGE} Localitatea și conturile nu au fost verificate la Vumsi.`];

  const [{ data: org }, { data: profile }, city] = await Promise.all([
    db.from("organizations").select("id,name,legal_name,cui,city,registered_address,material_address").eq("id", p.organization_id).maybeSingle(),
    p.assigned_to ? db.from("profiles").select("id,full_name,email,phone").eq("id", p.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
    resolveCity(db, p as PropertyRow, get),
  ]);
  const mapped = mapPropertyToVumsi(p as PropertyRow, { attributes: snapshot.attributes ?? {}, mappings, cityId: city.id });

  const userPayload = profile ? vumsiUserPayload(profile) : null;
  const user = userPayload ? { payload: userPayload, ...(await lookupAccount(db, get, "user", userPayload.external_user_id, p.organization_id)) } : empty;
  const companyPayload = org ? vumsiCompanyPayload(org, { userUuid: user.vumsiUuid, externalUserId: userPayload?.external_user_id ?? null }) : null;
  const company = companyPayload ? { payload: companyPayload, ...(await lookupAccount(db, get, "company", companyPayload.external_company_id, p.organization_id)) } : empty;

  const reasons = [...mapped.reasons, ...vumsiAccountReasons(userPayload, companyPayload)];
  return {
    ok: reasons.length === 0, setupMissing: false, reasons: [...new Set(reasons)], warnings: [...warnings, ...mapped.warnings],
    cityId: city.id, cityName: city.name, plans: mapped.plans, user, company,
  };
}
