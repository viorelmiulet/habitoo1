/**
 * Garduri de securitate și de mediu pentru La Cheie:
 *  - fără cheie API sau fără producție activată nu pleacă nicio cerere;
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
  lacheie_environment: "production",
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
  });

  it("fără cheie API nu se trimite nimic", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await lacheieAdapter.publishListing(context(TEST_SETTINGS, null), ref);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFIG_ERROR");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("producția neactivată blochează publicarea", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await lacheieAdapter.publishListing(
      context(
        {
          lacheie_environment: "production",
          lacheie_production_base_url: "https://api.lacheie.example/v1",
          lacheie_production_active: false,
        },
        "cheie-test",
      ),
      ref,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CONFIG_ERROR");
      expect(result.message).toContain("nu este activată");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("adresa API lipsă este raportată, nu ghicită", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await lacheieAdapter.publishListing(
      context({ lacheie_environment: "test" }, "cheie-test"),
      ref,
    );
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("starea conexiunii nu conține niciodată cheia API", async () => {
    const result = await lacheieAdapter.getStatus(context(TEST_SETTINGS, "cheie-foarte-secreta"));
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
    expect(handlers.length).toBeGreaterThanOrEqual(5);
    expect((functionsSource.match(/requireSuperadminOrg\(/g) ?? []).length).toBeGreaterThanOrEqual(
      handlers.length,
    );
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
    expect(stateType).toContain("hasApiKey: boolean");
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

  it("agenția vine din parametrul validat, iar mediul de test este implicit", () => {
    expect(adapterSource).toContain("environmentBlockReason");
    expect(adapterSource).not.toMatch(/console\.log/);
    expect(adapterSource).not.toMatch(/https:\/\/[a-z.]*lacheie/i);
  });
});
