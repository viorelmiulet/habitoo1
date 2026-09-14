/**
 * Registrul adaptoarelor de surse de piață.
 *
 * Orice sursă fără feed/API autorizat configurat primește un adaptor
 * `not_configured`: interfața explică situația, dar nu simulăm o sincronizare
 * reușită și nu inventăm endpoint-uri.
 */
import { NOT_CONFIGURED_MESSAGE, type MarketSourceAdapter } from "./adapter";
import { createHabitooInternalAdapter, type HabitooAdapterDeps } from "./adapters/habitoo";
import { findMarketSource, MARKET_SOURCES, type MarketSourceDefinition } from "./sources";

export function createNotConfiguredAdapter(
  definition: MarketSourceDefinition,
): MarketSourceAdapter {
  return {
    getSourceInfo() {
      return {
        id: definition.id,
        name: definition.name,
        provider: definition.portalId ?? definition.id,
        description: definition.description,
        notes: definition.notes ?? null,
        formats: definition.formats,
        pull: false,
        configured: false,
        orgScoped: false,
      };
    },
    async testConnection() {
      return { ok: false, message: NOT_CONFIGURED_MESSAGE };
    },
    async fetchRecords() {
      throw new Error(NOT_CONFIGURED_MESSAGE);
    },
  };
}

export type RegistryDeps = { habitoo: HabitooAdapterDeps };

/** Toate adaptoarele, în ordinea din registrul de surse. */
export function createMarketAdapters(deps: RegistryDeps): MarketSourceAdapter[] {
  return MARKET_SOURCES.map((definition) =>
    definition.id === "habitoo_internal"
      ? createHabitooInternalAdapter(deps.habitoo)
      : createNotConfiguredAdapter(definition),
  );
}

export function createMarketAdapter(
  source: string,
  deps: RegistryDeps,
): MarketSourceAdapter | null {
  const definition = findMarketSource(source);
  if (!definition) return null;
  return definition.id === "habitoo_internal"
    ? createHabitooInternalAdapter(deps.habitoo)
    : createNotConfiguredAdapter(definition);
}
