/**
 * Configurarea conexiunii La Cheie, citită din `portal_connections.settings`.
 * Pur: nu atinge rețeaua, nu decriptează nimic, nu vede cheia API.
 *
 * Mediul TEST este implicit. PRODUCTION rămâne blocat până când La Cheie
 * confirmă activarea agenției, iar Superadminul bifează confirmarea în Habitoo:
 * documentația nu descrie niciun endpoint de auto-activare, deci nu inventăm unul.
 */

export const LACHEIE_PORTAL_KEY = "lacheie";
export const LACHEIE_DEFAULT_OFFERS_PATH = "/offers";
export const LACHEIE_SOURCE_VERSION_HEADER = "X-Source-Version";
/** Limitele documentate de La Cheie, aplicate și local ca protecție. */
export const LACHEIE_WRITE_LIMIT_PER_MINUTE = 60;
export const LACHEIE_READ_LIMIT_PER_MINUTE = 120;

export type LaCheieEnvironment = "test" | "production";

export type LaCheieCrudTests = {
  create: string | null;
  update: string | null;
  withdraw: string | null;
};

export type LaCheieSettings = {
  environment: LaCheieEnvironment;
  testBaseUrl: string | null;
  productionBaseUrl: string | null;
  /** Confirmarea manuală că La Cheie a activat producția pentru agenție. */
  productionActive: boolean;
  productionConfirmedAt: string | null;
  offersPath: string;
  crudTests: LaCheieCrudTests;
  catalogFetchedAt: string | null;
  catalogError: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readLaCheieSettings(settings: Record<string, unknown> | null): LaCheieSettings {
  const raw = settings ?? {};
  const tests = (raw["lacheie_tests"] ?? {}) as Record<string, unknown>;
  return {
    environment: raw["lacheie_environment"] === "production" ? "production" : "test",
    testBaseUrl: text(raw["lacheie_test_base_url"]),
    productionBaseUrl: text(raw["lacheie_production_base_url"]),
    productionActive: raw["lacheie_production_active"] === true,
    productionConfirmedAt: text(raw["lacheie_production_confirmed_at"]),
    offersPath: text(raw["lacheie_offers_path"]) ?? LACHEIE_DEFAULT_OFFERS_PATH,
    crudTests: {
      create: text(tests["create"]),
      update: text(tests["update"]),
      withdraw: text(tests["withdraw"]),
    },
    catalogFetchedAt: text(raw["lacheie_catalog_fetched_at"]),
    catalogError: text(raw["lacheie_catalog_error"]),
  };
}

export function crudTestsPassed(tests: LaCheieCrudTests): boolean {
  return Boolean(tests.create && tests.update && tests.withdraw);
}

/** Adresa API a mediului activ. `null` = mediul nu este configurat. */
export function activeBaseUrl(settings: LaCheieSettings): string | null {
  const raw =
    settings.environment === "production" ? settings.productionBaseUrl : settings.testBaseUrl;
  return raw ? raw.replace(/\/+$/, "") : null;
}

export type LaCheieReadiness =
  | "not_configured"
  | "testing"
  | "connected"
  | "error"
  | "production_blocked";

/** Starea afișată în UI, derivată din configurare + ultimul rezultat. */
export function laCheieReadiness(input: {
  hasApiKey: boolean;
  settings: LaCheieSettings;
  lastError: string | null;
}): LaCheieReadiness {
  if (!input.hasApiKey || !activeBaseUrl(input.settings)) return "not_configured";
  if (input.settings.environment === "production" && !input.settings.productionActive) {
    return "production_blocked";
  }
  if (input.lastError) return "error";
  if (input.settings.environment === "test" && !crudTestsPassed(input.settings.crudTests)) {
    return "testing";
  }
  return "connected";
}

export const LACHEIE_READINESS_LABEL: Record<LaCheieReadiness, string> = {
  not_configured: "Neconfigurat",
  testing: "Testare",
  connected: "Conectat",
  error: "Eroare",
  production_blocked: "Producție neactivată",
};

/**
 * Gard de mediu: în producție nu pleacă nicio cerere până la confirmarea
 * activării de către La Cheie.
 */
export function environmentBlockReason(settings: LaCheieSettings): string | null {
  if (!activeBaseUrl(settings)) {
    return settings.environment === "production"
      ? "Adresa API pentru producție nu este configurată."
      : "Adresa API pentru mediul de test nu este configurată.";
  }
  if (settings.environment === "production" && !settings.productionActive) {
    return "Producția La Cheie nu este activată pentru această agenție. Rămâne activ mediul de test până la confirmarea La Cheie.";
  }
  return null;
}
