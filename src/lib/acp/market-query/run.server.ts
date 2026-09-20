/**
 * Rularea interogării live (server-only).
 *
 * Sursele activate sunt întrebate în paralel, fiecare cu propriul timp maxim de
 * așteptare. O sursă care expiră sau dă eroare este consemnată și sărită:
 * analiza continuă cu rezultatele parțiale. Nimic nu se salvează în afara
 * analizei — în tabelul de surse se actualizează doar contoarele de rezultat.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AcpSubject } from "../scoring";
import { marketQueryCriteriaForSource, marketQueryCriteriaKey } from "./criteria";
import { normalizeMarketQueryComparables } from "./normalize";
import {
  marketQueryAdapter,
  type MarketQueryComparable,
  type MarketQueryCriteria,
  type MarketQuerySourceConfig,
  type MarketQuerySourceOutcome,
} from "./port";
import { marketQueryCacheGet, marketQueryCacheSet } from "./session-cache";
import "./adapters.register";

type Admin = SupabaseClient<Database>;

export type MarketQueryLiveComparable = MarketQueryComparable & {
  sourceKey: string;
  sourceLabel: string;
};

export type MarketQueryRunResult = {
  comparables: MarketQueryLiveComparable[];
  outcomes: MarketQuerySourceOutcome[];
  /** `true` când rezultatul a venit din cache-ul de sesiune. */
  fromCache: boolean;
};

const EMPTY_RESULT: MarketQueryRunResult = { comparables: [], outcomes: [], fromCache: false };

export async function loadMarketQuerySources(
  admin: Admin,
  options: { onlyEnabled?: boolean } = {},
): Promise<MarketQuerySourceConfig[]> {
  let query = admin
    .from("market_query_sources")
    .select("key,label,base_url,enabled,timeout_ms,radius_km,price_band_percent")
    .order("label", { ascending: true });
  if (options.onlyEnabled) query = query.eq("enabled", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    key: row.key,
    label: row.label,
    baseUrl: row.base_url,
    enabled: Boolean(row.enabled),
    timeoutMs: row.timeout_ms ?? 4000,
    radiusKm: Number(row.radius_km ?? 5),
    priceBandPercent: row.price_band_percent ?? 40,
  }));
}

async function recordOutcome(
  admin: Admin,
  source: MarketQuerySourceConfig,
  outcome: MarketQuerySourceOutcome,
): Promise<void> {
  const column =
    outcome.outcome === "answered"
      ? "answered_count"
      : outcome.outcome === "empty"
        ? "empty_count"
        : outcome.outcome === "timeout"
          ? "timeout_count"
          : "error_count";
  const { data } = await admin
    .from("market_query_sources")
    .select(column)
    .eq("key", source.key)
    .maybeSingle();
  const current = Number((data as Record<string, unknown> | null)?.[column] ?? 0);
  await admin
    .from("market_query_sources")
    .update({
      [column]: current + 1,
      last_outcome: outcome.outcome,
      last_query_at: new Date().toISOString(),
    } as never)
    .eq("key", source.key);
}

/** O interogare a unei singure surse, cu timeout propriu. Nu aruncă niciodată. */
export async function querySingleSource(input: {
  source: MarketQuerySourceConfig;
  criteria: MarketQueryCriteria;
}): Promise<{ outcome: MarketQuerySourceOutcome; comparables: MarketQueryLiveComparable[] }> {
  const { source, criteria } = input;
  const adapter = marketQueryAdapter(source.key);
  const base = { sourceKey: source.key, sourceLabel: source.label };
  if (!adapter) {
    return {
      comparables: [],
      outcome: {
        ...base,
        outcome: "error",
        comparables: 0,
        detail: "Sursa nu are încă un adaptor de interogare.",
      },
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, source.timeoutMs);
  try {
    const raw = await adapter.query({ criteria, source, signal: controller.signal });
    const normalized = normalizeMarketQueryComparables(raw ?? []);
    if (normalized.length === 0) {
      return {
        comparables: [],
        outcome: { ...base, outcome: "empty", comparables: 0, detail: null },
      };
    }
    return {
      comparables: normalized.map((c) => ({ ...c, ...base })),
      outcome: {
        ...base,
        outcome: "answered",
        comparables: normalized.length,
        detail: null,
      },
    };
  } catch (error) {
    if (timedOut) {
      return {
        comparables: [],
        outcome: {
          ...base,
          outcome: "timeout",
          comparables: 0,
          detail: `Sursa nu a răspuns în ${source.timeoutMs} ms.`,
        },
      };
    }
    return {
      comparables: [],
      outcome: {
        ...base,
        outcome: "error",
        comparables: 0,
        detail: error instanceof Error ? error.message : "Interogarea a eșuat.",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Întreabă toate sursele activate. Fără surse activate nu se face nicio cerere
 * și nu se consemnează nimic.
 */
export async function runMarketQuery(
  admin: Admin,
  subject: AcpSubject,
): Promise<MarketQueryRunResult> {
  const sources = await loadMarketQuerySources(admin, { onlyEnabled: true });
  if (sources.length === 0) return EMPTY_RESULT;

  const cacheKey = sources
    .map(
      (s) =>
        `${s.key}#${marketQueryCriteriaKey(marketQueryCriteriaForSource(subject, s))}`,
    )
    .sort()
    .join("||");
  const cached = marketQueryCacheGet<MarketQueryRunResult>(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  const results = await Promise.all(
    sources.map((source) =>
      querySingleSource({
        source,
        criteria: marketQueryCriteriaForSource(subject, source),
      }),
    ),
  );

  const comparables: MarketQueryLiveComparable[] = [];
  const outcomes: MarketQuerySourceOutcome[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i]!;
    outcomes.push(result.outcome);
    comparables.push(...result.comparables);
    await recordOutcome(admin, sources[i]!, result.outcome);
  }

  const payload: MarketQueryRunResult = { comparables, outcomes, fromCache: false };
  marketQueryCacheSet(cacheKey, payload);
  return payload;
}
