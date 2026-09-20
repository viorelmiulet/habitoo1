/**
 * Versiunile motorului determinist ACP.
 *
 * O schimbare de metodologie nu modifică niciodată o versiune existentă: se
 * introduce versiunea următoare, iar analizele deja salvate rămân legate de
 * versiunea cu care au fost calculate și se reproduc identic.
 *
 *  - versiunea 1: motorul original (scoring + ajustări de caracteristici).
 *  - versiunea 2: în plus, aducerea prețului fiecărui comparabil la trimestrul
 *    analizei cu indicele trimestrial național al prețurilor locuințelor
 *    (Eurostat), citit exclusiv din baza de date.
 *  - versiunea 3: în plus, comparabilele pot fi cerute live surselor partenere
 *    activate, în momentul rulării. Versiunile 1 și 2 nu fac niciodată cereri
 *    de rețea, deci analizele lor se reproduc identic.
 */

export const ACP_ENGINE_VERSIONS = [1, 2, 3] as const;

export type AcpEngineVersion = (typeof ACP_ENGINE_VERSIONS)[number];

/** Versiunea folosită pentru analizele și versiunile noi. */
export const ACP_CURRENT_ENGINE_VERSION: AcpEngineVersion = 3;

export const ACP_ENGINE_VERSION_LABELS: Record<AcpEngineVersion, string> = {
  1: "Motor v1 — fără ajustare în timp",
  2: "Motor v2 — ajustare în timp cu indicele național",
  3: "Motor v3 — comparabile cerute live de la surse partenere",
};

/** Normalizează o valoare stocată la o versiune cunoscută (implicit 1). */
export function normalizeAcpEngineVersion(value: unknown): AcpEngineVersion {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  const truncated = Math.trunc(numeric);
  return (ACP_ENGINE_VERSIONS as readonly number[]).includes(truncated)
    ? (truncated as AcpEngineVersion)
    : 1;
}

/** Doar de la versiunea 2 se aplică ajustarea în timp. */
export function engineSupportsTimeAdjustment(version: AcpEngineVersion): boolean {
  return version >= 2;
}

/** Doar de la versiunea 3 se cer comparabile live surselor partenere. */
export function engineSupportsLiveMarketQuery(version: number): boolean {
  return version >= 3;
}

