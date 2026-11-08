// Extensia Chrome — proprietăți ciornă capturate din anunțuri. Modul pur (fără DB).
import { z } from "zod";
import { PROPERTY_TYPES, TAXONOMIES as PARTNER_TAXONOMIES, taxonomyCode } from "@/lib/partner-api/schema";
import {
  additionalSpaceOptions, kitchenOptions, meteringOptions, applianceOptions, buildingAmenityOptions,
  streetArrangementOptions, viewOptions, miscFeatureOptions, coolingOptions,
  layoutOptions, comfortOptions, heatingOptions, finishStateOptions,
} from "@/lib/property-taxonomy";
import { extError, sha256Hex, type ExtContext } from "./core";
import { CRM_URL } from "@/lib/host";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_EXTENSION_IMAGES = 30;
export const MAX_EXTENSION_IMAGE_BYTES = 10 * 1024 * 1024;
export const EXTENSION_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ExtImageType = (typeof EXTENSION_IMAGE_TYPES)[number];

const fromLabels = (labels: readonly string[]) => labels.map((label) => ({ code: taxonomyCode(label), label }));

/** Grupurile de caracteristici → coloana proprietății în care se salvează eticheta. */
const FEATURE_GROUPS: [column: string, labels: readonly string[]][] = [
  ["additional_spaces", additionalSpaceOptions], ["kitchen_features", kitchenOptions], ["metering", meteringOptions],
  ["appliances", applianceOptions], ["building_amenities", buildingAmenityOptions], ["street_arrangement", streetArrangementOptions],
  ["views", viewOptions], ["misc_features", miscFeatureOptions], ["cooling_systems", coolingOptions],
];
const FEATURE_BY_CODE = new Map<string, { column: string; label: string }>();
for (const [column, labels] of FEATURE_GROUPS) for (const label of labels) {
  const code = taxonomyCode(label);
  if (!FEATURE_BY_CODE.has(code)) FEATURE_BY_CODE.set(code, { column, label });
}

export const EXTENSION_TAXONOMIES = {
  property_type: PROPERTY_TYPES,
  transaction: PARTNER_TAXONOMIES.offer_type,
  currency: PARTNER_TAXONOMIES.currency,
  layout: fromLabels(layoutOptions),
  comfort: fromLabels(comfortOptions),
  heating: fromLabels(heatingOptions),
  finish_state: fromLabels(finishStateOptions),
  features: [...FEATURE_BY_CODE.entries()].map(([code, f]) => ({ code, label: f.label })),
};

const labelFor = (list: { code: string; label: string }[], v: string | null | undefined) =>
  v ? (list.find((o) => o.code === v || o.label === v)?.label ?? null) : null;

const TRACKING = /^(utm_.*|fbclid|gclid|dclid|msclkid|yclid|mc_cid|mc_eid|_ga|igshid)$/i;
/** URL comparabil: fără parametri de tracking, fără #, host cu litere mici, fără „/” final. */
export function normalizeSourceUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "") || "/";
  const qs = u.searchParams.toString();
  return `https://${host}${path}${qs ? `?${qs}` : ""}`;
}

const num = z.number().finite().nonnegative().max(1e12).nullable().optional();
const int = z.number().int().min(-5).max(10000).nullable().optional();
const str = (max: number) => z.string().trim().max(max).nullable().optional();

export const createPropertySchema = z.object({
  title: str(300), description: str(20000),
  property_type: str(40), transaction: z.enum(["sale", "rent"]).nullable().optional(),
  price: num, currency: z.enum(["EUR", "RON", "USD"]).nullable().optional(),
  usable_surface: num, built_surface: num, land_surface: num,
  rooms: int, bathrooms: int, floor: int, building_floors: int, build_year: z.number().int().min(1700).max(2100).nullable().optional(),
  layout: str(80), comfort: str(40), heating: str(80), finish_state: str(80),
  locality: z.object({ name: str(120), county: str(120), siruta_code: z.number().int().nullable().optional(), uat_siruta_code: z.number().int().nullable().optional(), county_siruta_code: z.number().int().nullable().optional() }).nullable().optional(),
  zone: str(120), address: str(500),
  features: z.array(z.string().max(120)).max(200).optional(),
  owner: z.object({ name: str(200), phone: str(40), email: z.string().trim().email().max(254).nullable().optional().or(z.literal("")) }).nullable().optional(),
  source: z.object({ url: z.string().url().max(2048), site: str(120), captured_at: z.string().datetime({ offset: true }).nullable().optional() }),
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

/** Câmpurile scrise în proprietate. Sursa NU intră aici: stă separat, numai în CRM. */
export function toPropertyPayload(input: CreatePropertyInput) {
  const type = PROPERTY_TYPES.find((t) => t.code === input.property_type || t.label === input.property_type)?.code ?? null;
  const rent = input.transaction === "rent";
  const currency = input.currency ?? "EUR";
  const p: Record<string, unknown> = {
    title: input.title || null, description: input.description || null,
    property_type: type && type !== "other" ? type : null,
    transaction_kind: rent ? "rent" : "sale", for_sale: !rent, for_rent: rent,
    price: input.price ?? null, currency,
    sale_price: rent ? null : (input.price ?? null), sale_currency: rent ? null : currency,
    rent_price: rent ? (input.price ?? null) : null, rent_currency: rent ? currency : null,
    usable_surface: input.usable_surface ?? null, built_surface: input.built_surface ?? null, land_surface: input.land_surface ?? null,
    rooms: input.rooms ?? null, bathrooms: input.bathrooms ?? null, floor: input.floor ?? null,
    building_floors: input.building_floors ?? null, build_year: input.build_year ?? null,
    layout: labelFor(EXTENSION_TAXONOMIES.layout, input.layout), comfort: labelFor(EXTENSION_TAXONOMIES.comfort, input.comfort),
    heating: labelFor(EXTENSION_TAXONOMIES.heating, input.heating), finish_state: labelFor(EXTENSION_TAXONOMIES.finish_state, input.finish_state),
    city: input.locality?.name || null, county: input.locality?.county || null,
    locality_siruta_code: input.locality?.siruta_code ?? null, uat_siruta_code: input.locality?.uat_siruta_code ?? null,
    county_siruta_code: input.locality?.county_siruta_code ?? null,
    district: input.zone || null, address: input.address || null,
  };
  for (const [column] of FEATURE_GROUPS) p[column] = [];
  for (const f of input.features ?? []) {
    const hit = FEATURE_BY_CODE.get(f) ?? FEATURE_BY_CODE.get(taxonomyCode(f));
    if (hit && !(p[hit.column] as string[]).includes(hit.label)) (p[hit.column] as string[]).push(hit.label);
  }
  const normalized = normalizeSourceUrl(input.source.url);
  const site = input.source.site || (normalized ? new URL(normalized).hostname : null);
  return {
    property: p,
    owner: { name: input.owner?.name || null, phone: input.owner?.phone || null, email: input.owner?.email || null },
    source: { url: input.source.url, normalized_url: normalized, site, captured_at: input.source.captured_at ?? null },
  };
}

export type ExtRpcResult = { state: "created" | "replay" | "conflict"; property_id?: string | null; contact_id?: string | null };
export type ExtSourceMatch = { id: string; title: string; agent: string | null };
export type ExtUploadSlot = { path: string; upload_url: string; token: string };
export type ExtPropertyStore = {
  createProperty: (a: { user: string; org: string; key: string; hash: string; property: unknown; owner: unknown; source: unknown }) => Promise<ExtRpcResult>;
  findSource: (org: string, normalized: string) => Promise<ExtSourceMatch | null>;
  /** Proprietate vizibilă utilizatorului (aceeași regulă ca RLS: agent responsabil/creator sau administrator). */
  propertyAccess: (propertyId: string, user: string, org: string) => Promise<{ imageCount: number } | null>;
  signUploads: (paths: string[]) => Promise<ExtUploadSlot[]>;
  completeImages: (a: { propertyId: string; org: string; user: string; paths: string[] }) => Promise<{ added: number; rejected: { path: string; reason: string }[] }>;
  localities: (q: string) => Promise<unknown[]>;
};

export const propertyUrl = (id: string) => `${CRM_URL}/app/properties/${id}`;

async function readJson(request: Request): Promise<{ text: string; body: unknown } | null> {
  const text = await request.text();
  if (text.length > 200_000) return null;
  try { return { text, body: JSON.parse(text) }; } catch { return null; }
}
const invalid = (c: ExtContext, message: string) => extError(422, "VALIDATION_ERROR", message, c.requestId);

export function createPropertyHandler(request: Request, store: ExtPropertyStore) {
  return async (c: ExtContext) => {
    const key = request.headers.get("Idempotency-Key");
    if (!key || key.length > 200 || !/^[\x21-\x7e]+$/.test(key)) return extError(400, "INVALID_IDEMPOTENCY_KEY", "Antetul Idempotency-Key este obligatoriu (1–200 caractere ASCII vizibile).", c.requestId);
    const json = await readJson(request);
    if (!json) return invalid(c, "Corpul cererii trebuie să fie JSON valid.");
    const parsed = createPropertySchema.safeParse(json.body);
    if (!parsed.success) return invalid(c, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const payload = toPropertyPayload(parsed.data);
    if (!payload.source.normalized_url) return invalid(c, "source.url trebuie să fie o adresă http(s).");
    const res = await store.createProperty({ user: c.token.user_id, org: c.token.organization_id, key, hash: await sha256Hex(json.text), ...payload });
    if (res.state === "conflict") return extError(409, "IDEMPOTENCY_CONFLICT", "Această cheie de idempotență a fost folosită pentru altă cerere.", c.requestId);
    if (!res.property_id) return extError(409, "REQUEST_IN_PROGRESS", "Cererea inițială este încă în procesare.", c.requestId);
    return Response.json({ id: res.property_id, url: propertyUrl(res.property_id) }, { status: res.state === "created" ? 201 : 200 });
  };
}

export function checkSourceHandler(request: Request, store: ExtPropertyStore) {
  return async (c: ExtContext) => {
    const json = await readJson(request);
    const url = (json?.body as { url?: unknown } | undefined)?.url;
    const normalized = typeof url === "string" && url.length <= 2048 ? normalizeSourceUrl(url) : null;
    if (!normalized) return invalid(c, "url trebuie să fie o adresă http(s).");
    const hit = await store.findSource(c.token.organization_id, normalized);
    return Response.json(hit ? { exists: true, property: { ...hit, url: propertyUrl(hit.id) } } : { exists: false, property: null });
  };
}

const EXT: Record<ExtImageType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export function validateUploadRequest(body: unknown, existing: number): { types: ExtImageType[] } | { error: string } {
  const b = body as { count?: unknown; types?: unknown } | null;
  const count = b?.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) return { error: "count trebuie să fie un număr întreg pozitiv." };
  if (count > MAX_EXTENSION_IMAGES || existing + count > MAX_EXTENSION_IMAGES) return { error: `Maximum ${MAX_EXTENSION_IMAGES} de fotografii pe proprietate.` };
  const types = Array.isArray(b?.types) ? b!.types : [];
  if (types.length !== count) return { error: "types trebuie să aibă câte un tip pentru fiecare fotografie." };
  if (!types.every((t): t is ExtImageType => (EXTENSION_IMAGE_TYPES as readonly unknown[]).includes(t))) return { error: "Sunt acceptate doar fotografii JPG, PNG sau WebP." };
  return { types };
}
export const extensionImagePath = (org: string, propertyId: string, type: ExtImageType) => `${org}/${propertyId}/ext-${crypto.randomUUID()}.${EXT[type]}`;
export const isExtensionImagePath = (path: unknown, org: string, propertyId: string): path is string =>
  typeof path === "string" && new RegExp(`^${org}/${propertyId}/ext-[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(path);

/** Tipul real după primii octeți; `null` = refuzat. */
export function sniffImage(bytes: Uint8Array): ExtImageType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
export function validateImageFile(bytes: Uint8Array): { type: ExtImageType } | { error: string } {
  if (bytes.byteLength === 0) return { error: "Fișier gol." };
  if (bytes.byteLength > MAX_EXTENSION_IMAGE_BYTES) return { error: "Fotografia depășește 10 MB." };
  const type = sniffImage(bytes);
  return type ? { type } : { error: "Sunt acceptate doar fotografii JPG, PNG sau WebP." };
}

export function uploadUrlsHandler(request: Request, store: ExtPropertyStore, propertyId: string) {
  return async (c: ExtContext) => {
    const access = UUID.test(propertyId) ? await store.propertyAccess(propertyId, c.token.user_id, c.token.organization_id) : null;
    if (!access) return extError(404, "NOT_FOUND", "Proprietatea nu există sau nu îți este accesibilă.", c.requestId);
    const json = await readJson(request);
    const v = validateUploadRequest(json?.body ?? null, access.imageCount);
    if ("error" in v) return invalid(c, v.error);
    const slots = await store.signUploads(v.types.map((t) => extensionImagePath(c.token.organization_id, propertyId, t)));
    return Response.json({ max_bytes: MAX_EXTENSION_IMAGE_BYTES, uploads: slots });
  };
}

export function completeImagesHandler(request: Request, store: ExtPropertyStore, propertyId: string) {
  return async (c: ExtContext) => {
    const access = UUID.test(propertyId) ? await store.propertyAccess(propertyId, c.token.user_id, c.token.organization_id) : null;
    if (!access) return extError(404, "NOT_FOUND", "Proprietatea nu există sau nu îți este accesibilă.", c.requestId);
    const json = await readJson(request);
    const paths = (json?.body as { paths?: unknown } | undefined)?.paths;
    if (!Array.isArray(paths) || paths.length < 1) return invalid(c, "paths trebuie să conțină căile fotografiilor, în ordinea dorită.");
    if (new Set(paths).size !== paths.length || paths.length > MAX_EXTENSION_IMAGES || access.imageCount + paths.length > MAX_EXTENSION_IMAGES) return invalid(c, `Maximum ${MAX_EXTENSION_IMAGES} de fotografii pe proprietate, fără dubluri.`);
    if (!paths.every((p) => isExtensionImagePath(p, c.token.organization_id, propertyId))) return invalid(c, "Cale de fotografie invalidă pentru această proprietate.");
    const result = await store.completeImages({ propertyId, org: c.token.organization_id, user: c.token.user_id, paths });
    return Response.json(result);
  };
}

export const taxonomiesHandler = async () => Response.json(EXTENSION_TAXONOMIES);

export function localitiesHandler(request: Request, store: ExtPropertyStore) {
  return async (c: ExtContext) => {
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2 || q.length > 80) return invalid(c, "q trebuie să aibă 2–80 de caractere.");
    return Response.json({ items: await store.localities(q) });
  };
}
