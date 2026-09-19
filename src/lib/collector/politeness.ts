/**
 * Motorul de politețe al colectorului — logică pură.
 *
 * Reguli fixe: o singură cerere pe domeniu, pauza cerută de sursă sau de
 * robots.txt (cea mai mare dintre ele), un agent de utilizator care spune
 * cine suntem și cum ne contactezi, cereri condiționate (ETag/Last-Modified)
 * și un plafon de pagini pe rulare. Fără proxy, fără mascare, fără CAPTCHA,
 * fără reîncercări în lanț: 403/429 opresc rularea sursei, cu motiv salvat.
 */

export const COLLECTOR_USER_AGENT =
  "HabitooCollector/1.0 (+https://habitoo.ro/colector; contact@habitoo.ro)";

/** Colectăm doar text: niciodată bytes de imagine. */
export const COLLECTOR_ACCEPT_HEADER = "text/html,application/xhtml+xml,application/xml;q=0.9";

export const MIN_CRAWL_DELAY_MS = 1000;
export const MAX_PAGES_HARD_CAP = 500;

export function effectiveCrawlDelayMs(
  sourceDelayMs: number | null | undefined,
  robotsDelayMs: number | null | undefined,
): number {
  return Math.max(MIN_CRAWL_DELAY_MS, sourceDelayMs ?? 0, robotsDelayMs ?? 0);
}

export function pageCap(maxPagesPerRun: number | null | undefined): number {
  const value = maxPagesPerRun ?? 1;
  return Math.max(1, Math.min(Math.floor(value), MAX_PAGES_HARD_CAP));
}

export type CollectorStopReason =
  | "forbidden"
  | "rate_limited"
  | "page_cap"
  | "budget"
  | "robots_disallow"
  | "no_more_pages"
  | "too_many_errors"
  | "no_adapter"
  | "fetch_failed";

export const COLLECTOR_STOP_LABEL: Record<CollectorStopReason, string> = {
  forbidden: "Sursa a refuzat accesul (403); rularea s-a oprit.",
  rate_limited: "Sursa a cerut să încetinim (429); rularea s-a oprit.",
  page_cap: "S-a atins numărul maxim de pagini pe rulare.",
  budget: "S-a atins timpul alocat rulării; se continuă la următoarea.",
  robots_disallow: "robots.txt interzice această cale.",
  no_more_pages: "Nu mai sunt pagini de parcurs.",
  too_many_errors: "Prea multe erori consecutive; rularea s-a oprit.",
  no_adapter: "Sursa nu are încă un adaptor de citire.",
  fetch_failed: "Cererea către sursă a eșuat.",
};

export const MAX_CONSECUTIVE_ERRORS = 3;

/** 403/429 opresc rularea sursei; celelalte erori se numără. */
export function stopReasonForStatus(status: number): CollectorStopReason | null {
  if (status === 403 || status === 401 || status === 451) return "forbidden";
  if (status === 429) return "rate_limited";
  return null;
}

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/** 304 = conținut nemodificat: pagina se numără, dar nu se reprocesează. */
export function isNotModified(status: number): boolean {
  return status === 304;
}

export function conditionalHeaders(input: {
  etag?: string | null;
  lastModified?: string | null;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (input.etag) headers["If-None-Match"] = input.etag;
  if (input.lastModified) headers["If-Modified-Since"] = input.lastModified;
  return headers;
}

export function collectorRequestHeaders(input: {
  etag?: string | null;
  lastModified?: string | null;
}): Record<string, string> {
  return {
    "User-Agent": COLLECTOR_USER_AGENT,
    Accept: COLLECTOR_ACCEPT_HEADER,
    "Accept-Language": "ro,en;q=0.8",
    ...conditionalHeaders(input),
  };
}
