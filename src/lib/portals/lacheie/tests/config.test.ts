import { describe, expect, it } from "vitest";
import {
  activeBaseUrl,
  LACHEIE_DEFAULT_PROPERTIES_PATH,
  LACHEIE_ENVIRONMENT,
  LACHEIE_PRODUCTION_BASE_URL,
  laCheiePropertiesPath,
  laCheieReadiness,
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

  it("cheia salvată fără eroare înseamnă production conectat", () => {
    expect(laCheieReadiness({ hasApiKey: true, lastError: null })).toBe("connected");
  });

  it("fără cheie API starea este neconfigurat", () => {
    expect(laCheieReadiness({ hasApiKey: false, lastError: null })).toBe("not_configured");
  });

  it("o eroare recentă apare ca stare de eroare", () => {
    expect(laCheieReadiness({ hasApiKey: true, lastError: "HTTP 500" })).toBe("error");
  });
});
