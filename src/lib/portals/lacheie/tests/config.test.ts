import { describe, expect, it } from "vitest";
import {
  activeBaseUrl,
  LACHEIE_DEFAULT_PROPERTIES_PATH,
  LACHEIE_ENVIRONMENT,
  LACHEIE_PRODUCTION_BASE_URL,
  isLegacyLaCheieTestEnvironmentError,
  laCheiePropertiesPath,
  laCheieReadiness,
  normalizeLaCheiePortalSettings,
  readLaCheieSettings,
} from "../config";

describe("La Cheie — mediu unic (production) și stare", () => {
  it("singurul mediu este production", () => {
    const settings = readLaCheieSettings({});
    expect(settings.environment).toBe("production");
    expect(LACHEIE_ENVIRONMENT).toBe("production");
    expect(settings.propertiesPath).toBe("/properties");
    expect(LACHEIE_DEFAULT_PROPERTIES_PATH).toBe("/properties");
  });

  it("adresa API este cea documentată, fixată server-side", () => {
    expect(activeBaseUrl()).toBe(LACHEIE_PRODUCTION_BASE_URL);
    expect(LACHEIE_PRODUCTION_BASE_URL).toBe("https://api.lacheie.ro/api/partners/v1");
    expect(LACHEIE_PRODUCTION_BASE_URL.endsWith("/")).toBe(false);
  });

  it("construiește doar endpointurile documentate pentru proprietăți", () => {
    expect(laCheiePropertiesPath()).toBe("/properties");
    expect(laCheiePropertiesPath("HBT 1/SALE")).toBe("/properties/HBT%201%2FSALE");
  });

  it("setările vechi de mediu de test sunt ignorate", () => {
    const settings = readLaCheieSettings({
      lacheie_environment: "test",
      lacheie_test_base_url: "https://test.lacheie.example/api/v1",
      lacheie_production_base_url: "https://wrong.example/v1",
      lacheie_production_active: false,
      lacheie_offers_path: "/offers",
    });
    expect(settings.environment).toBe("production");
    expect(settings.propertiesPath).toBe("/properties");
    expect(activeBaseUrl()).toBe(LACHEIE_PRODUCTION_BASE_URL);
  });

  it("elimină cheile TEST istorice înainte de traseul generic de publicare", () => {
    const normalized = normalizeLaCheiePortalSettings({
      allow_live: true,
      lacheie_environment: "test",
      lacheie_test_base_url: "https://test.invalid/v1",
      lacheie_production_active: false,
      lacheie_production_base_url: "https://wrong.invalid/v1",
    });
    expect(normalized).toEqual({ allow_live: true });
    expect(normalized).not.toHaveProperty("lacheie_environment");
    expect(normalized).not.toHaveProperty("lacheie_test_base_url");
  });

  it("nu mai afișează eroarea TEST persistată de versiunea veche", () => {
    const oldError = ["Adresa API pentru mediul", "de test nu este configurată."].join(" ");
    expect(isLegacyLaCheieTestEnvironmentError(oldError)).toBe(true);
    expect(
      normalizeLaCheiePortalSettings({ allow_live: true, lacheie_catalog_error: oldError }),
    ).toEqual({ allow_live: true });
  });

  it("agenția activă fără eroare înseamnă production conectat", () => {
    expect(laCheieReadiness({ hasApiKey: true, lastError: null })).toBe("connected");
  });

  it("fără agenție activă starea este neconfigurat", () => {
    expect(laCheieReadiness({ hasApiKey: false, lastError: null })).toBe("not_configured");
  });

  it("o eroare recentă apare ca stare de eroare", () => {
    expect(laCheieReadiness({ hasApiKey: true, lastError: "HTTP 500" })).toBe("error");
  });
});
