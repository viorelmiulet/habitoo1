import { ANAF_TIMEOUT_MS, ANAF_URL, LOOKUP_RATE_LIMIT, type CompanyInfo, type LookupDeps } from "./company-lookup";

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
