import { describe, expect, it } from "vitest";
import {
  activeBaseUrl,
  crudTestsPassed,
  environmentBlockReason,
  laCheieReadiness,
  readLaCheieSettings,
} from "../config";

const FULL = {
  lacheie_environment: "production",
  lacheie_test_base_url: "https://test.lacheie.example/api/v1",
  lacheie_production_base_url: "https://api.lacheie.example/v1",
  lacheie_production_active: true,
  lacheie_production_confirmed_at: "2026-01-01T10:00:00.000Z",
  lacheie_tests: { create: "t1", update: "t2", withdraw: "t3" },
};

describe("La Cheie — mediu și stare", () => {
  it("mediul implicit este test", () => {
    const settings = readLaCheieSettings({});
    expect(settings.environment).toBe("test");
    expect(settings.productionActive).toBe(false);
    expect(settings.offersPath).toBe("/offers");
  });

  it("producția este blocată până la confirmarea activării", () => {
    const settings = readLaCheieSettings({
      ...FULL,
      lacheie_production_active: false,
    });
    expect(environmentBlockReason(settings)).toContain("nu este activată");
    expect(laCheieReadiness({ hasApiKey: true, settings, lastError: null })).toBe(
      "production_blocked",
    );
  });

  it("producția confirmată permite cereri", () => {
    const settings = readLaCheieSettings(FULL);
    expect(environmentBlockReason(settings)).toBeNull();
    expect(activeBaseUrl(settings)).toBe("https://api.lacheie.example/v1");
    expect(laCheieReadiness({ hasApiKey: true, settings, lastError: null })).toBe("connected");
  });

  it("adresa lipsă înseamnă neconfigurat, nu presupunem un endpoint", () => {
    const settings = readLaCheieSettings({ lacheie_environment: "test" });
    expect(activeBaseUrl(settings)).toBeNull();
    expect(environmentBlockReason(settings)).toContain("test");
    expect(laCheieReadiness({ hasApiKey: true, settings, lastError: null })).toBe("not_configured");
  });

  it("fără cheie API starea este neconfigurat", () => {
    const settings = readLaCheieSettings(FULL);
    expect(laCheieReadiness({ hasApiKey: false, settings, lastError: null })).toBe(
      "not_configured",
    );
  });

  it("mediul de test fără toate testele CRUD apare ca „Testare”", () => {
    const settings = readLaCheieSettings({
      lacheie_environment: "test",
      lacheie_test_base_url: "https://test.lacheie.example/api/v1",
      lacheie_tests: { create: "t1" },
    });
    expect(crudTestsPassed(settings.crudTests)).toBe(false);
    expect(laCheieReadiness({ hasApiKey: true, settings, lastError: null })).toBe("testing");
  });

  it("o eroare recentă apare ca stare de eroare", () => {
    const settings = readLaCheieSettings(FULL);
    expect(laCheieReadiness({ hasApiKey: true, settings, lastError: "HTTP 500" })).toBe("error");
  });

  it("adresele se normalizează fără slash final", () => {
    const settings = readLaCheieSettings({
      lacheie_environment: "test",
      lacheie_test_base_url: "https://test.lacheie.example/api/v1/",
    });
    expect(activeBaseUrl(settings)).toBe("https://test.lacheie.example/api/v1");
  });
});
