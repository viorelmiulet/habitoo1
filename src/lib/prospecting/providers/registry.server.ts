/**
 * Registry-ul providerilor de surse (Stage 13).
 *
 * Agentul nu cunoaște niciun portal: cere date prin `ProspectingSourceProvider`.
 * O sursă nouă (feed autorizat, API cu contract, scraper intern autorizat) se
 * adaugă aici, fără modificări în workflow, tool-uri sau interfață.
 *
 * NU există niciun provider comercial de scraping (nici Bright Data): sursele
 * fără integrare disponibilă rămân marcate ca neconfigurate.
 */
import type { ProspectSource, ProspectingSourceProvider } from "../types";
import { httpFeedProvider, HTTP_FEED_PROVIDER_KEY } from "./http-feed.server";
import { manualListProvider, MANUAL_LIST_PROVIDER_KEY } from "./manual-list.server";

const PROVIDERS: Record<string, ProspectingSourceProvider> = {
  [HTTP_FEED_PROVIDER_KEY]: httpFeedProvider,
  [MANUAL_LIST_PROVIDER_KEY]: manualListProvider,
};

/** Chei rezervate pentru surse fără integrare autorizată: rămân neconfigurate. */
export const PLANNED_PROVIDER_KEYS = [
  "olx",
  "imobiliare_ro",
  "storia",
  "publi24",
] as const;

export function resolveProspectingProvider(providerKey: string): ProspectingSourceProvider | null {
  return PROVIDERS[providerKey] ?? null;
}

export function listProspectingProviders(): { key: string; label: string; live: boolean }[] {
  return Object.values(PROVIDERS).map((provider) => ({
    key: provider.key,
    label: provider.label,
    live: provider.live,
  }));
}

/** Sursa este utilizabilă doar dacă e activă și are un provider implementat. */
export function sourceUsable(source: ProspectSource): boolean {
  return source.enabled && resolveProspectingProvider(source.providerKey) !== null;
}
