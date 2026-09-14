/**
 * Interfața de scraping — DOAR arhitectură (Stage 11).
 *
 * În această etapă NU există niciun provider de scraping (nici Bright Data,
 * nici altul) și nu se execută nicio cerere externă. Interfața există ca un
 * provider viitor (sau un scraper intern autorizat) să poată fi adăugat fără
 * a modifica agentul, tool-urile sau UI-ul.
 */

export const SCRAPING_NOT_CONFIGURED = "SCRAPING_NOT_CONFIGURED" as const;

export const SCRAPING_NOT_CONFIGURED_MESSAGE =
  "Colectarea externă de date nu este activată pentru Habitoo.";

export type ScrapingRequest = {
  url: string;
  purpose: "market_listing" | "property_detail";
};

export type ScrapingResult =
  | { ok: true; provider: string; content: string; fetchedAt: string }
  | { ok: false; code: typeof SCRAPING_NOT_CONFIGURED | "failed"; message: string };

export type ScrapingProvider = {
  readonly id: string;
  scrape(request: ScrapingRequest): Promise<ScrapingResult>;
};

/** Niciun provider configurat în Stage 11: întoarce mereu `null`. */
export function resolveScrapingProvider(): ScrapingProvider | null {
  return null;
}

export function scrapingStatus(): { configured: boolean; provider: null; message: string } {
  return { configured: false, provider: null, message: SCRAPING_NOT_CONFIGURED_MESSAGE };
}

/** Punct de intrare unic; în Stage 11 refuză controlat orice cerere. */
export async function runScraping(request: ScrapingRequest): Promise<ScrapingResult> {
  const provider = resolveScrapingProvider();
  if (!provider) {
    return {
      ok: false,
      code: SCRAPING_NOT_CONFIGURED,
      message: SCRAPING_NOT_CONFIGURED_MESSAGE,
    };
  }
  return provider.scrape(request);
}
