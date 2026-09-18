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
 */

export const ACP_ENGINE_VERSIONS = [1, 2] as const;

export type AcpEngineVersion = (typeof ACP_ENGINE_VERSIONS)[number];

/** Versiunea folosită pentru analizele și versiunile noi. */
export const ACP_CURRENT_ENGINE_VERSION: AcpEngineVersion = 2;

export const ACP_ENGINE_VERSION_LABELS: Record<AcpEngineVersion, string> = {
  1: "Motor v1 — fără ajustare în timp",
  2: "Motor v2 — ajustare în timp cu indicele național",
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
