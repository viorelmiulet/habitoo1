/**
 * Registry-ul providerilor de surse (Stage 13, extins în Stage 19).
 *
 * Agentul nu cunoaște niciun portal: cere date prin `ProspectingSourceProvider`.
 * O sursă nouă (feed autorizat, API cu contract, scraper intern autorizat) se
 * adaugă aici, fără modificări în workflow, tool-uri sau interfață.
 *
 * NU există niciun provider comercial de scraping (nici Bright Data): sursele
 * fără integrare autorizată primesc providerul `unavailable`, care răspunde
 * onest `source_unavailable` în loc să inventeze anunțuri.
 *
 * Integrările de publicare (ex. La Cheie) NU sunt surse de prospectare: ele
 * trimit ofertele agenției către portal și nu apar niciodată aici.
 */
import type {
  ProspectSource,
  ProspectingProviderAvailability,
  ProspectingProviderCapability,
  ProspectingSourceProvider,
} from "../types";
import { httpFeedProvider, HTTP_FEED_PROVIDER_KEY } from "./http-feed.server";
import { manualListProvider, MANUAL_LIST_PROVIDER_KEY } from "./manual-list.server";
import { unavailableProvider } from "./unavailable.server";

/** Chei rezervate pentru surse fără integrare autorizată: rămân indisponibile. */
export const PLANNED_PROVIDER_KEYS = ["olx", "imobiliare_ro", "storia", "publi24"] as const;

const PLANNED_LABELS: Record<(typeof PLANNED_PROVIDER_KEYS)[number], string> = {
  olx: "OLX",
  imobiliare_ro: "Imobiliare.ro",
  storia: "Storia",
  publi24: "Publi24",
};

const PROVIDERS: Record<string, ProspectingSourceProvider> = {
  [HTTP_FEED_PROVIDER_KEY]: httpFeedProvider,
  [MANUAL_LIST_PROVIDER_KEY]: manualListProvider,
  ...Object.fromEntries(
    PLANNED_PROVIDER_KEYS.map((key) => [key, unavailableProvider(key, PLANNED_LABELS[key])]),
  ),
};

export function resolveProspectingProvider(providerKey: string): ProspectingSourceProvider | null {
  return PROVIDERS[providerKey] ?? null;
}

export type ProspectingProviderInfo = {
  key: string;
  label: string;
  live: boolean;
  availability: ProspectingProviderAvailability;
  capabilities: readonly ProspectingProviderCapability[];
};

export function listProspectingProviders(): ProspectingProviderInfo[] {
  return Object.values(PROVIDERS).map((provider) => ({
    key: provider.key,
    label: provider.label,
    live: provider.live,
    availability: provider.availability,
    capabilities: provider.capabilities,
  }));
}

/** Disponibilitatea providerului; o cheie necunoscută este tot indisponibilă. */
export function providerAvailability(providerKey: string): ProspectingProviderAvailability {
  return resolveProspectingProvider(providerKey)?.availability ?? "unavailable";
}

/** Sursa este utilizabilă doar dacă e activă și are un provider implementat. */
export function sourceUsable(source: ProspectSource): boolean {
  return source.enabled && resolveProspectingProvider(source.providerKey) !== null;
}

/**
 * `true` doar dacă există cel puțin o sursă activă cu provider `live`, adică o
 * sursă externă reală configurată. Listele proprii (manual) nu contează ca
 * sursă reală de piață.
 */
export function hasLiveProspectingSource(sources: ProspectSource[]): boolean {
  return sources.some(
    (source) => source.enabled && providerAvailability(source.providerKey) === "live",
  );
}
