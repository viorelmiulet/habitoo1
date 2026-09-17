/**
 * Garduri de securitate și configurare pentru La Cheie:
 *  - fără cheie API nu pleacă nicio cerere;
 *  - cheia API nu este niciodată returnată către frontend;
 *  - jurnalul nu conține secrete sau payload brut;
 *  - fiecare server function cere rol de Superadmin și validează inputul.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { lacheieAdapter } from "../../adapters/lacheie.server";
import { getPortalDefinition } from "../../registry";

function context(settings: Record<string, unknown>, credential: string | null) {
  const definition = getPortalDefinition("lacheie")!;
  return {
    organizationId: "11111111-1111-1111-1111-111111111111",
    definition,
    direction: "habitoo_to_portal" as never,
    authenticationMode: "portal_api_key" as never,
    externalAccountId: null,
    portalCredential: credential,
    settings,
    allowLiveRequests: true,
  };
}

const TEST_SETTINGS = {
  allow_live: true,
};

const ref = { propertyId: "22222222-2222-2222-2222-222222222222", externalId: null };

describe("La Cheie — garduri înainte de orice request", () => {
  it("portalul este declarat în registru cu capabilitățile reale", () => {
    const definition = getPortalDefinition("lacheie");
    expect(definition?.capabilities).toContain("publish_listing");
    expect(definition?.capabilities).toContain("withdraw_listing");
    // Etapa nu include import de lead-uri, bulk sau webhook-uri.
    expect(definition?.capabilities).not.toContain("fetch_leads");
    expect(definition?.capabilities).not.toContain("webhook_receive");
    expect(definition?.authentication).toEqual(["portal_api_key"]);
    // Agențiile NU introduc nicio cheie: cheia de furnizor stă în secretele de server.
    expect(definition?.configuration_schema.fields).toEqual([]);
    expect(`${definition?.description} ${definition?.notes}`).toContain("production-only");
    expect(`${definition?.description} ${definition?.notes}`).not.toMatch(/mediu(l)? de test/i);
  });

  it("fără agenție activată nu se trimite nimic", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await lacheieAdapter.publishListing(context(TEST_SETTINGS, null), ref);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFIG_ERROR");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("nu există mediu de test: activarea agenției rămâne singurul blocaj de configurare", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await lacheieAdapter.publishListing(
      context({ lacheie_environment: "test", lacheie_production_active: false }, ""),
      ref,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CONFIG_ERROR");
      expect(result.message).not.toMatch(/mediu(l)? de test/i);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("starea conexiunii nu conține niciodată cheia de furnizor", async () => {
    process.env["LACHEIE_CRM_API_KEY"] = "lc_crm_cheie-foarte-secreta";
    const result = await lacheieAdapter.getStatus(context(TEST_SETTINGS, "cheie-foarte-secreta"));
    delete process.env["LACHEIE_CRM_API_KEY"];
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.stringify(result.data)).not.toContain("cheie-foarte-secreta");
  });

  it("retragerea fără configurare nu contactează portalul", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await lacheieAdapter.withdrawListing(context(TEST_SETTINGS, null), ref);
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("La Cheie — reguli verificabile în cod", () => {
  const functionsSource = readFileSync("src/lib/portals/lacheie.functions.ts", "utf8");
  const adapterSource = readFileSync("src/lib/portals/adapters/lacheie.server.ts", "utf8");

  it("fiecare server function cere Superadmin și validează inputul", () => {
    const handlers = functionsSource.match(/createServerFn\(/g) ?? [];
    expect(handlers.length).toBeGreaterThanOrEqual(6);
    const guards =
      (functionsSource.match(/requireSuperadmin\(/g) ?? []).length +
      (functionsSource.match(/requireLaCheieActivator\(/g) ?? []).length;
    expect(guards).toBeGreaterThanOrEqual(handlers.length);
    expect((functionsSource.match(/\.inputValidator\(/g) ?? []).length).toBe(handlers.length);
    expect((functionsSource.match(/requireActiveOrgAuth/g) ?? []).length).toBeGreaterThanOrEqual(
      handlers.length,
    );
  });

  it("starea returnată către frontend nu include credențiale", () => {
    const stateType = functionsSource.slice(
      functionsSource.indexOf("export type LaCheieState"),
      functionsSource.indexOf("export const getLaCheieState"),
    );
    expect(stateType).not.toMatch(/apiKey\s*:\s*string/);
    expect(stateType).not.toMatch(/credential|secret|token/i);
    expect(stateType).toContain("hasProviderKey: boolean");
  });

  it("jurnalul nu salvează payload sau antete", () => {
    const logBlock = functionsSource.slice(
      functionsSource.indexOf("async function logLaCheie"),
      functionsSource.indexOf("export type LaCheieState"),
    );
    const code = logBlock
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toMatch(/payload|authorization|apiKey|portalCredential/i);
  });

  it("adaptorul folosește adresa production fixată central, fără mediu de test", () => {
    expect(adapterSource).toContain("activeBaseUrl");
    expect(adapterSource).not.toContain("environmentBlockReason");
    expect(adapterSource).not.toMatch(/console\.log/);
    // Adresa nu este hardcodată în adaptor: vine din config.
    expect(adapterSource).not.toMatch(/https:\/\/[a-z.]*lacheie/i);
    expect(adapterSource).toContain('path: "/account"');
    expect(adapterSource).toContain("laCheiePropertiesPath(offer.external_id)");
    expect(adapterSource).toContain("laCheiePropertiesPath(id)");
    // Ofertele se scriu exclusiv prin PUT /properties/{external_id}.
    expect(adapterSource).not.toContain('method: "POST"');

    expect(adapterSource).toContain('method: "PUT"');
    expect(adapterSource).toContain('method: "DELETE"');
    expect(adapterSource).not.toContain("/offers");
  });

  it("mesajul vechi de configurare TEST nu mai poate fi produs", () => {
    const obsoleteMessage = ["Adresa API pentru mediul", "de test nu este configurată"].join(" ");
    const sources = [
      functionsSource,
      adapterSource,
      readFileSync("src/lib/portals/lacheie/config.ts", "utf8"),
      readFileSync("src/lib/portals/lacheie/http.ts", "utf8"),
      readFileSync("src/lib/portals/registry.ts", "utf8"),
    ].join("\n");
    expect(sources).not.toContain(obsoleteMessage);
  });

  it("catalogul lipsă se sincronizează prin GET chiar dacă scrierile live sunt oprite", () => {
    expect(adapterSource).toContain("if (!catalog) {");
    expect(adapterSource).not.toContain("if (!catalog && ctx.allowLiveRequests)");
    expect(adapterSource).toContain("refreshLaCheieCatalog");
    expect(adapterSource).not.toContain(
      "Catalogul La Cheie nu este sincronizat. Rulează „Reîmprospătează catalogul” înainte de publicare.",
    );
  });
});
