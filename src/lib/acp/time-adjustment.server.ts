/**
 * Citirea indicelui trimestrial pentru ajustarea în timp (motor ACP v2).
 *
 * Exclusiv din tabelul `market_price_indices` — la momentul analizei nu se face
 * niciun apel HTTP. Dacă tabelul este gol, întoarcem `null` și motorul se
 * comportă ca înainte, cu o notă explicativă.
 */
import type { AcpPriceIndexSnapshot } from "./time-adjustment";

type AnyClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => any;
    };
  };
};

/** Seria folosită de ajustarea în timp: indicele total, nu defalcările. */
export const ACP_TIME_INDEX_SERIES = "total";

export async function loadAcpPriceIndex(admin: AnyClient): Promise<AcpPriceIndexSnapshot | null> {
  try {
    const { data, error } = await admin
      .from("market_price_indices")
      .select("source,dataset,series,unit,region,base_label,period_year,period_quarter,index_value")
      .eq("series", ACP_TIME_INDEX_SERIES)
      .order("period_year", { ascending: true })
      .order("period_quarter", { ascending: true });
    if (error) return null;
    const rows = (data ?? []) as {
      source: string | null;
      dataset: string | null;
      series: string | null;
      unit: string | null;
      region: string | null;
      base_label: string | null;
      period_year: number | null;
      period_quarter: number | null;
      index_value: number | string | null;
    }[];
    const points = rows
      .map((row) => {
        const value =
          typeof row.index_value === "number" ? row.index_value : Number(row.index_value);
        if (!Number.isFinite(value) || value <= 0) return null;
        if (!row.period_year || !row.period_quarter) return null;
        return { year: row.period_year, quarter: row.period_quarter, value };
      })
      .filter((point): point is { year: number; quarter: number; value: number } => point !== null);
    if (points.length === 0) return null;
    const first = rows[0]!;
    return {
      source: first.source ?? "eurostat",
      dataset: first.dataset ?? "prc_hpi_q",
      series: first.series ?? ACP_TIME_INDEX_SERIES,
      unit: first.unit ?? "I15_Q",
      baseLabel: first.base_label ?? "2015=100",
      region: first.region ?? "RO",
      points,
    };
  } catch {
    return null;
  }
}
