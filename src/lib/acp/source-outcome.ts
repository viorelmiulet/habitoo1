/**
 * Eticheta, în română, a felului în care a răspuns o sursă interogată live.
 * Funcție pură, folosită identic pe ecranul analizei și în raportul PDF.
 */
import { MARKET_QUERY_OUTCOME_LABELS, type MarketQueryOutcome } from "./market-query/port";

export function acpSourceOutcomeLabel(outcome: string | null | undefined): string | null {
  if (!outcome) return null;
  const known = outcome as MarketQueryOutcome;
  return MARKET_QUERY_OUTCOME_LABELS[known] ?? null;
}
