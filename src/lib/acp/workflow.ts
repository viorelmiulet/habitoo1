/**
 * Etapa 6 ACP: logica pură a fluxului „proprietate → ACP → recomandare de preț".
 *
 * Aici stau doar funcții deterministe, fără acces la bază de date: derivarea
 * statusului de workflow din rândul analizei și compararea prețului proprietății
 * cu prețul recomandat de motorul ACP. Nicio valoare nu este inventată: dacă
 * datele lipsesc, rezultatul este `null`.
 */

export type AcpWorkflowStatus =
  | "none"
  | "preparing"
  | "running"
  | "completed"
  | "insufficient_data"
  | "error";

export const ACP_WORKFLOW_STATUS_LABELS: Record<AcpWorkflowStatus, string> = {
  none: "Fără analiză",
  preparing: "În pregătire",
  running: "Analiză în curs",
  completed: "Finalizată",
  insufficient_data: "Date insuficiente",
  error: "Eroare",
};

export const ACP_WORKFLOW_STATUS_TONES: Record<
  AcpWorkflowStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  none: "neutral",
  preparing: "neutral",
  running: "info",
  completed: "success",
  insufficient_data: "warning",
  error: "danger",
};

export type AcpWorkflowStatusInput = {
  /** Statusul din `acp_analyses.status`: draft | running | completed | archived. */
  status: string | null | undefined;
  errorMessage?: string | null;
  comparablesUsed?: number | null;
  estimatedValue?: number | null;
} | null;

/**
 * Traduce statusul existent al analizei în statusul de workflow afișat în CRM.
 * Nu introduce statusuri noi în bază: `acp_analyses.status` rămâne neschimbat.
 */
export function acpWorkflowStatus(row: AcpWorkflowStatusInput): AcpWorkflowStatus {
  if (!row) return "none";
  const status = (row.status ?? "").trim();
  if (status === "running") return "running";
  if (row.errorMessage) return "error";
  if (status === "draft") return "preparing";
  if (status === "completed" || status === "archived") {
    const used = Number(row.comparablesUsed ?? 0);
    const value = row.estimatedValue;
    if (!Number.isFinite(used) || used <= 0) return "insufficient_data";
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return "insufficient_data";
    }
    return "completed";
  }
  return "preparing";
}

export type AcpPriceComparison = {
  currentPrice: number | null;
  recommendedPrice: number | null;
  currency: string;
  /** Diferența valorică (recomandat − actual), null dacă lipsește un termen. */
  differenceAmount: number | null;
  /** Diferența procentuală față de prețul actual, rotunjită la o zecimală. */
  differencePercent: number | null;
  direction: "higher" | "lower" | "equal" | "unknown";
  /** True doar dacă există un preț recomandat valid de aplicat. */
  canApply: boolean;
};

function finiteOrNull(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n;
}

/** Compară prețul curent al proprietății cu prețul recomandat ACP, fără NaN/Infinity. */
export function acpPriceComparison(params: {
  currentPrice: unknown;
  recommendedPrice: unknown;
  currency?: string | null;
}): AcpPriceComparison {
  const currentPrice = finiteOrNull(params.currentPrice);
  const recommended = finiteOrNull(params.recommendedPrice);
  const recommendedPrice = recommended !== null && recommended > 0 ? recommended : null;
  const currency = (params.currency ?? "EUR") || "EUR";

  if (recommendedPrice === null) {
    return {
      currentPrice,
      recommendedPrice: null,
      currency,
      differenceAmount: null,
      differencePercent: null,
      direction: "unknown",
      canApply: false,
    };
  }

  if (currentPrice === null || currentPrice <= 0) {
    return {
      currentPrice,
      recommendedPrice,
      currency,
      differenceAmount: null,
      differencePercent: null,
      direction: "unknown",
      canApply: true,
    };
  }

  const differenceAmount = Math.round(recommendedPrice - currentPrice);
  const differencePercent = Math.round(((recommendedPrice - currentPrice) / currentPrice) * 1000) / 10;
  const direction =
    differenceAmount > 0 ? "higher" : differenceAmount < 0 ? "lower" : ("equal" as const);

  return {
    currentPrice,
    recommendedPrice,
    currency,
    differenceAmount,
    differencePercent,
    direction,
    canApply: differenceAmount !== 0,
  };
}

/** Textul afișat înainte de aplicarea prețului recomandat. */
export function acpPriceDeltaLabel(comparison: AcpPriceComparison): string | null {
  if (comparison.differenceAmount === null || comparison.differencePercent === null) return null;
  const sign = comparison.differenceAmount > 0 ? "+" : "";
  return `${sign}${comparison.differenceAmount} ${comparison.currency} (${sign}${comparison.differencePercent}%)`;
}
