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
 *  - versiunea 4: în plus, locația vine din distanță când există coordonate
 *    (comparabilele directe la cel mult 2 km), ansamblurile rezidențiale sunt
 *    zone proprii, garsoniera = apartament cu 1 cameră și verificarea de
 *    bun-simț față de prețul de listare.
 *  - versiunea 5: în plus, ofertele inactive din ultimele 12 luni intră cu o
 *    pondere care scade cu vechimea (mediană ponderată); cele active rămân
 *    prioritare, iar cele inactive mai vechi de 12 luni sunt excluse.
 */

export const ACP_ENGINE_VERSIONS = [1, 2, 3, 4, 5] as const;

export type AcpEngineVersion = (typeof ACP_ENGINE_VERSIONS)[number];

/** Versiunea folosită pentru analizele și versiunile noi. */
export const ACP_CURRENT_ENGINE_VERSION: AcpEngineVersion = 5;

export const ACP_ENGINE_VERSION_LABELS: Record<AcpEngineVersion, string> = {
  1: "Motor v1 — fără ajustare în timp",
  2: "Motor v2 — ajustare în timp cu indicele național",
  3: "Motor v3 — comparabile cerute live de la surse partenere",
  4: "Motor v4 — locație după distanță și ansambluri rezidențiale",
  5: "Motor v5 — oferte inactive din ultimele 12 luni, ponderate după vechime",
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


/** De la versiunea 4: locație după distanță, ansambluri, garsonieră = 1 cameră. */
export function engineSupportsGeoLocation(version: number): boolean {
  return version >= 4;
}

/**
 * Versiunea folosită la „Recalculează" în loc: analizele v3 (care oricum
 * interoghează live sursele) trec la motorul curent doar la cererea
 * utilizatorului; v1/v2 rămân reproductibile identic.
 */
export function engineVersionForRerun(stored: AcpEngineVersion): AcpEngineVersion {
  return stored >= 3 ? ACP_CURRENT_ENGINE_VERSION : stored;
}

/** De la versiunea 5: ofertele inactive (≤ 12 luni) cu pondere după vechime. */
export function engineSupportsAgeWeighting(version: number): boolean {
  return version >= 5;
}
