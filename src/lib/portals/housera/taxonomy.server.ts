/**
 * Nomenclatorul Housera: `GET schema?locale=ro` (public, fără cheie) din mediul curent,
 * păstrat în `portal_taxonomy_cache` (portal `housera`, `site_urn` = mediul) cu ETag.
 * La reîmprospătare trimite `If-None-Match`; 304 = neschimbat.
 */
import { houseraBaseUrl, houseraEnv } from "./config";
import { houseraAffectedCodes } from "./mapper";
import { parseHouseraSchema, type HouseraSchema } from "./schema";

type Env = Record<string, string | undefined>;
export type HouseraSchemaFetch =
  | { status: "unchanged"; etag: string | null }
  | { status: "updated"; etag: string | null; schema: HouseraSchema };

export async function fetchHouseraSchema(input: { env: Env; etag: string | null; fetch?: typeof fetch }): Promise<HouseraSchemaFetch> {
  const f = input.fetch ?? fetch;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (input.etag) headers["If-None-Match"] = input.etag;
  const res = await f(new URL("schema?locale=ro", houseraBaseUrl(input.env)).toString(), {
    headers, redirect: "manual", signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 304) return { status: "unchanged", etag: input.etag };
  if (!res.ok) throw new Error(`Nomenclatorul Housera nu a putut fi descărcat (HTTP ${res.status}).`);
  const schema = parseHouseraSchema(await res.json().catch(() => null));
  if (!schema) throw new Error("Nomenclatorul Housera primit este incomplet.");
  return { status: "updated", etag: res.headers.get("etag"), schema };
}

export type HouseraCachedSchema = { schema: HouseraSchema; etag: string | null; fetchedAt: string; env: string; affected: ReturnType<typeof houseraAffectedCodes> };

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function loadHouseraSchema(env: Env): Promise<HouseraCachedSchema | null> {
  const sb = await admin();
  const { data } = await sb.from("portal_taxonomy_cache").select("categories, fetched_at")
    .eq("portal", "housera").eq("site_urn", houseraEnv(env)).maybeSingle();
  const c = data?.categories as { schema?: unknown; etag?: string | null } | null;
  const schema = parseHouseraSchema(c?.schema);
  if (!schema) return null;
  return { schema, etag: c?.etag ?? null, fetchedAt: data!.fetched_at, env: houseraEnv(env), affected: houseraAffectedCodes(schema) };
}

/** Reîmprospătare (cron sau buton). La 304 se actualizează doar ora verificării. */
export async function refreshHouseraSchema(env: Env, actorId: string | null): Promise<{ status: "updated" | "unchanged"; cached: HouseraCachedSchema }> {
  const sb = await admin();
  const current = await loadHouseraSchema(env);
  const r = await fetchHouseraSchema({ env, etag: current?.schema ? current.etag : null });
  const now = new Date().toISOString();
  const schema = r.status === "updated" ? r.schema : current!.schema;
  const affected = houseraAffectedCodes(schema);
  const { error } = await sb.from("portal_taxonomy_cache").upsert({
    portal: "housera", site_urn: houseraEnv(env), organization_id: null,
    categories: { schema, etag: r.etag } as never,
    discrepancies: affected as never, fetched_at: now, fetched_by: actorId,
  }, { onConflict: "portal,site_urn" });
  if (error) throw new Error("Nomenclatorul Housera nu a putut fi salvat.");
  return { status: r.status, cached: { schema, etag: r.etag, fetchedAt: now, env: houseraEnv(env), affected } };
}
