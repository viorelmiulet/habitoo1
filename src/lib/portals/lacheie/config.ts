/**
 * Configurarea conexiunii La Cheie, citită din `portal_connections.settings`.
 * Pur: nu atinge rețeaua, nu decriptează nimic, nu vede cheia API.
 *
 * La Cheie oferă un singur mediu real: PRODUCTION. Nu există un mediu de test
 * separat, deci nu cerem și nu presupunem o adresă de test. Adresa API este
 * fixată server-side la endpointul documentat.
 */

export const LACHEIE_PORTAL_KEY = "lacheie";
/** Singurul endpoint documentat de La Cheie (production-only). */
export const LACHEIE_PRODUCTION_BASE_URL = "https://api.lacheie.ro/api/partners/v1";
/** Endpointul documentat pentru operațiile CRUD pe anunțuri. */
export const LACHEIE_DEFAULT_PROPERTIES_PATH = "/properties";
/** Endpointul documentat pentru înregistrarea/administrarea agențiilor. */
export const LACHEIE_AGENCIES_PATH = "/agencies";
export const LACHEIE_SOURCE_VERSION_HEADER = "X-Source-Version";
/** Headerul care leagă o cerere de agenția conectată. */
export const LACHEIE_AGENCY_HEADER = "X-Agency-External-ID";
/** Limitele documentate de La Cheie, aplicate și local ca protecție. */
export const LACHEIE_WRITE_LIMIT_PER_MINUTE = 60;
export const LACHEIE_READ_LIMIT_PER_MINUTE = 120;
export const LACHEIE_AGENCY_LIMIT_PER_MINUTE = 60;


/** Un singur mediu real: producție. */
export type LaCheieEnvironment = "production";
export const LACHEIE_ENVIRONMENT: LaCheieEnvironment = "production";

export type LaCheieSettings = {
  environment: LaCheieEnvironment;
  propertiesPath: typeof LACHEIE_DEFAULT_PROPERTIES_PATH;
  catalogFetchedAt: string | null;
  catalogError: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Recunoaște exclusiv eroarea istorică produsă de vechiul model cu mediu TEST. */
export function isLegacyLaCheieTestEnvironmentError(value: unknown): boolean {
  const message = text(value)?.toLocaleLowerCase("ro-RO") ?? "";
  return message.includes("api") && message.includes("mediul de test") && message.includes("configurat");
}

/** Curăță setările persistate înainte să intre în adaptorul generic. */
export function normalizeLaCheiePortalSettings(
  settings: Record<string, unknown> | null,
): Record<string, unknown> {
  const raw = settings ?? {};
  const catalogError = isLegacyLaCheieTestEnvironmentError(raw["lacheie_catalog_error"])
    ? null
    : text(raw["lacheie_catalog_error"]);
  return {
    allow_live: raw["allow_live"] === true,
    ...(text(raw["lacheie_catalog_fetched_at"])
      ? { lacheie_catalog_fetched_at: text(raw["lacheie_catalog_fetched_at"]) }
      : {}),
    ...(catalogError ? { lacheie_catalog_error: catalogError } : {}),
  };
}

export function readLaCheieSettings(settings: Record<string, unknown> | null): LaCheieSettings {
  const raw = normalizeLaCheiePortalSettings(settings);
  return {
    environment: LACHEIE_ENVIRONMENT,
    // Toate setările istorice de mediu, URL și cale sunt ignorate intenționat.
    propertiesPath: LACHEIE_DEFAULT_PROPERTIES_PATH,
    catalogFetchedAt: text(raw["lacheie_catalog_fetched_at"]),
    catalogError: text(raw["lacheie_catalog_error"]),
  };
}

/** Adresa API a integrării: constantă, nu editabilă de utilizator. */
export function activeBaseUrl(_settings?: LaCheieSettings): string {
  return LACHEIE_PRODUCTION_BASE_URL.replace(/\/+$/, "");
}

/** Construiește exclusiv endpointurile documentate `/properties`. */
export function laCheiePropertiesPath(externalId?: string): string {
  return externalId
    ? `${LACHEIE_DEFAULT_PROPERTIES_PATH}/${encodeURIComponent(externalId)}`
    : LACHEIE_DEFAULT_PROPERTIES_PATH;
}

export type LaCheieReadiness = "not_configured" | "connected" | "error";

/** Starea afișată în UI, derivată din configurare + ultimul rezultat. */
export function laCheieReadiness(input: {
  hasApiKey: boolean;
  lastError: string | null;
}): LaCheieReadiness {
  if (!input.hasApiKey) return "not_configured";
  if (input.lastError) return "error";
  return "connected";
}

export const LACHEIE_READINESS_LABEL: Record<LaCheieReadiness, string> = {
  not_configured: "Neconfigurat",
  connected: "Production conectat",
  error: "Eroare",
};
