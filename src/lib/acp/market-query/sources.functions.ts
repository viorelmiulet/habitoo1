/**
 * Interogarea live a surselor partenere — server functions rezervate
 * superadminului: listarea surselor, configurarea lor și un test manual care
 * rulează o interogare și arată rezultatul normalizat, fără să salveze nimic.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AcpSubject } from "../scoring";
import { MARKET_QUERY_OUTCOME_LABELS, type MarketQuerySourceOutcome } from "./port";
import type { MarketQueryMarketContext } from "./port";
import type { MarketQueryComparable } from "./port";

type AuthContext = {
  userId: string;
  supabase: { rpc: (fn: string) => Promise<{ data: unknown }> };
};

async function requireSuperadmin(context: AuthContext): Promise<void> {
  const { data } = await context.supabase.rpc("is_superadmin");
  if (data !== true) {
    throw new Error("Această operațiune este rezervată administratorilor platformei.");
  }
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type MarketQuerySourceView = {
  key: string;
  label: string;
  baseUrl: string;
  enabled: boolean;
  timeoutMs: number;
  radiusKm: number;
  priceBandPercent: number;
  notes: string | null;
  hasAdapter: boolean;
  answeredCount: number;
  emptyCount: number;
  timeoutCount: number;
  errorCount: number;
  lastOutcome: string | null;
  lastOutcomeLabel: string | null;
  lastQueryAt: string | null;
};

export const listMarketQuerySources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MarketQuerySourceView[]> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { marketQueryAdapterKeys } = await import("./port");
    await import("./adapters.register");
    const adapters = new Set(marketQueryAdapterKeys());

    const { data, error } = await admin
      .from("market_query_sources")
      .select("*")
      .order("label", { ascending: true });
    if (error) throw error;

    return (data ?? []).map((row) => {
      const outcome = row.last_outcome as keyof typeof MARKET_QUERY_OUTCOME_LABELS | null;
      return {
        key: row.key,
        label: row.label,
        baseUrl: row.base_url,
        enabled: Boolean(row.enabled),
        timeoutMs: row.timeout_ms ?? 4000,
        radiusKm: Number(row.radius_km ?? 5),
        priceBandPercent: row.price_band_percent ?? 40,
        notes: row.notes ?? null,
        hasAdapter: adapters.has(row.key),
        answeredCount: row.answered_count ?? 0,
        emptyCount: row.empty_count ?? 0,
        timeoutCount: row.timeout_count ?? 0,
        errorCount: row.error_count ?? 0,
        lastOutcome: row.last_outcome ?? null,
        lastOutcomeLabel: outcome ? (MARKET_QUERY_OUTCOME_LABELS[outcome] ?? null) : null,
        lastQueryAt: row.last_query_at ?? null,
      };
    });
  });

export const setMarketQuerySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        key: z.string().trim().min(1).max(60),
        enabled: z.boolean().optional(),
        timeoutMs: z.number().int().min(500).max(20000).optional(),
        radiusKm: z.number().finite().positive().max(200).optional(),
        priceBandPercent: z.number().int().min(5).max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.timeoutMs !== undefined) patch["timeout_ms"] = data.timeoutMs;
    if (data.radiusKm !== undefined) patch["radius_km"] = data.radiusKm;
    if (data.priceBandPercent !== undefined) patch["price_band_percent"] = data.priceBandPercent;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await admin
      .from("market_query_sources")
      .update(patch as never)
      .eq("key", data.key);
    if (error) throw error;
    return { ok: true };
  });

export type MarketQueryTestResult = {
  outcome: MarketQuerySourceOutcome;
  outcomeLabel: string;
  comparables: MarketQueryComparable[];
  /** Cifrele publicate de sursă, dacă le publică. */
  marketContext: MarketQueryMarketContext | null;
  /** Adresele publice cerute, exact cum au fost construite. */
  requestedUrls: string[];
};

/** Test manual: o interogare, rezultat normalizat, fără nicio salvare. */
export const testMarketQuerySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        key: z.string().trim().min(1).max(60),
        city: z.string().trim().max(120).nullable().optional(),
        county: z.string().trim().max(120).nullable().optional(),
        neighborhood: z.string().trim().max(120).nullable().optional(),
        propertyType: z.string().trim().max(60).nullable().optional(),
        transactionType: z.string().trim().max(60).nullable().optional(),
        rooms: z.number().int().min(1).max(30).nullable().optional(),
        usableArea: z.number().finite().positive().max(100000).nullable().optional(),
        price: z.number().finite().positive().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<MarketQueryTestResult> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { loadMarketQuerySources, querySingleSource } = await import("./run.server");
    const { marketQueryCriteriaForSource } = await import("./criteria");

    const sources = await loadMarketQuerySources(admin);
    const source = sources.find((s) => s.key === data.key);
    if (!source) throw new Error("Sursa nu a fost găsită.");

    const subject: AcpSubject = {
      city: data.city ?? null,
      county: data.county ?? null,
      neighborhood: data.neighborhood ?? null,
      propertyType: data.propertyType ?? null,
      transactionType: data.transactionType ?? null,
      rooms: data.rooms ?? null,
      usableArea: data.usableArea ?? null,
      price: data.price ?? null,
    };
    const criteria = marketQueryCriteriaForSource(subject, source);
    const result = await querySingleSource({ source, criteria });
    return {
      outcome: result.outcome,
      outcomeLabel: MARKET_QUERY_OUTCOME_LABELS[result.outcome.outcome],
      comparables: result.comparables.map(({ sourceKey: _k, sourceLabel: _l, ...rest }) => rest),
      marketContext: result.marketContext,
      requestedUrls: result.requestedUrls,
    };
  });
