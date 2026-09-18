/**
 * Server functions pentru indicele de preț al locuințelor (Eurostat).
 *
 * Citirea și sincronizarea sunt rezervate superadminului. Nimic din ACP nu
 * folosește încă aceste date.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  EUROSTAT_HPI_DATASET,
  EUROSTAT_HPI_UNIT,
  MARKET_INDEX_SERIES_LIST,
  type MarketIndexSeries,
} from "./eurostat";
import type { IndexSeriesCoverage, IndexRunRecord } from "./eurostat.server";

type AuthContext = { userId: string; supabase: { rpc: (fn: string) => Promise<{ data: unknown }> } };

async function requireSuperadmin(context: AuthContext): Promise<void> {
  const { data } = await context.supabase.rpc("is_superadmin");
  if (data !== true) {
    throw new Error("Această operațiune este rezervată administratorilor platformei.");
  }
}

async function loadRepository() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createIndicesRepository } = await import("./eurostat.server");
  return createIndicesRepository(supabaseAdmin as never);
}

export type MarketPriceIndexOverview = {
  dataset: string;
  unit: string;
  series: IndexSeriesCoverage[];
  runs: IndexRunRecord[];
};

export const getMarketPriceIndexOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MarketPriceIndexOverview> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const repository = await loadRepository();
    const [series, runs] = await Promise.all([repository.coverage(), repository.lastRuns(5)]);
    return { dataset: EUROSTAT_HPI_DATASET, unit: EUROSTAT_HPI_UNIT, series, runs };
  });

export const syncMarketPriceIndicesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ force: z.boolean().optional() }).parse(data ?? {}))
  .handler(async ({ context, data }) => {
    await requireSuperadmin(context as unknown as AuthContext);
    const repository = await loadRepository();
    const { syncMarketPriceIndices } = await import("./eurostat.server");
    const outcome = await syncMarketPriceIndices(repository, {
      actorId: (context as unknown as AuthContext).userId,
      force: data.force ?? true,
    });
    return {
      status: outcome.status,
      counts: outcome.counts,
      errors: outcome.errors,
      series: outcome.series.map((entry) => ({
        series: entry.series as MarketIndexSeries,
        counts: entry.counts,
        newest: entry.newest,
      })),
      seriesList: MARKET_INDEX_SERIES_LIST,
    };
  });
