import {
  ANAF_TIMEOUT_MS,
  ANAF_URL,
  LOOKUP_RATE_LIMIT,
  buildOrgSyncPatch,
  fetchCompany,
  shouldSyncOrg,
  validateCui,
  type CompanyInfo,
  type LookupDeps,
} from "./company-lookup";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export async function fetchAnafHttp(cui: number, date: string): Promise<unknown> {
  const res = await fetch(ANAF_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ cui, data: date }]),
    signal: AbortSignal.timeout(ANAF_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ANAF ${res.status}`);
  return res.json();
}

export const cuiDigitsSql = (cui: string) => cui.replace(/\D/g, "");

/** Organizațiile active cu același CUI (comparat doar pe cifre). */
export async function cuiTakenBy(db: Admin, cui: string, exceptOrgId?: string): Promise<boolean> {
  const { data } = await db
    .from("organizations")
    .select("id,cui,status")
    .ilike("cui", `%${cui}%`)
    .neq("status", "cancelled");
  return (data ?? []).some((o) => cuiDigitsSql(o.cui ?? "") === cui && o.id !== exceptOrgId);
}

export function serverLookupDeps(db: Admin, rateBucket: string | null): LookupDeps {
  return {
    now: () => new Date(),
    rateAllow: async () => {
      if (!rateBucket) return true;
      const { data } = await db.rpc("rate_limit_hit", {
        _bucket: rateBucket,
        _limit: LOOKUP_RATE_LIMIT.limit,
        _window_seconds: LOOKUP_RATE_LIMIT.windowSeconds,
      });
      return data !== false;
    },
    cacheGet: async (cui) => {
      const { data } = await db
        .from("company_lookup_cache")
        .select("found,result,fetched_at")
        .eq("cui", cui)
        .maybeSingle();
      return data
        ? { found: data.found, result: data.result as unknown as CompanyInfo | null, fetchedAt: data.fetched_at }
        : null;
    },
    cachePut: async (cui, found, result) => {
      await db
        .from("company_lookup_cache")
        .upsert({ cui, found, result: result as never, fetched_at: new Date().toISOString() });
    },
    fetchAnaf: fetchAnafHttp,
    cuiTaken: (cui) => cuiTakenBy(db, cui),
  };
}

const ORG_COLS =
  "id,cui,legal_name,trade_registry_number,registered_address,material_address,postal_code,city,county,company_verified_at,company_sync_attempted_at";

export type OrgSyncStatus = "skipped" | "verified" | "unverified";

/** Completează din ANAF doar câmpurile goale ale organizației (la creare și la deschiderea aplicației). */
export async function syncOrgFromAnaf(
  db: Admin,
  orgId: string,
  actorId: string | null,
  deps: Omit<LookupDeps, "rateAllow" | "cuiTaken"> = serverLookupDeps(db, null),
): Promise<{ status: OrgSyncStatus; changed: string[] }> {
  const { data: org } = await db.from("organizations").select(ORG_COLS).eq("id", orgId).maybeSingle();
  const now = deps.now();
  if (!org || !shouldSyncOrg(org, now)) return { status: "skipped", changed: [] };
  await db.from("organizations").update({ company_sync_attempted_at: now.toISOString() } as never).eq("id", orgId);
  const r = await fetchCompany(deps, validateCui(org.cui ?? "")!);
  if (!r.ok) return { status: "unverified", changed: [] };
  const patch = buildOrgSyncPatch(org, r.company, now);
  const { error } = await db.from("organizations").update(patch as never).eq("id", orgId);
  if (error) return { status: "unverified", changed: [] };
  const changed = Object.keys(patch).filter((k) => !k.startsWith("company_"));
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_id: actorId,
    action: "organization.company_synced_anaf",
    entity: "organizations",
    entity_id: orgId,
    new_values: patch,
  } as never);
  return { status: "verified", changed };
}
