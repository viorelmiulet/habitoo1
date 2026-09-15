/**
 * Teste de securitate pentru prospecting: autorizarea tool-urilor, separarea
 * citire/acțiune, aprobarea obligatorie, izolarea între agenții, auditul fără
 * PII și providerii (fără Bright Data, fără scraping activ).
 */
import { describe, expect, it } from "vitest";
import { authorizeAiTool } from "@/lib/ai/security/permissions";
import { aiToolCapability, aiToolDeclarations, AI_TOOLS, isAiActionTool } from "@/lib/ai/tools/registry";
import { buildProspectingAuditRow, PROSPECTING_AUDIT_ACTIONS } from "../audit";
import { listProspectingProviders, resolveProspectingProvider, sourceUsable } from "../providers/registry.server";
import { robotsAllows } from "../providers/http-feed.server";
import type { ProspectSource } from "../types";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const actorA = { userId: "user-a", organizationId: ORG_A, role: "agent" as const };

describe("registry-ul de tool-uri", () => {
  it("conține tool-urile de citire și de acțiune cerute", () => {
    const names = AI_TOOLS.map((tool) => tool.name);
    for (const name of [
      "search_prospects",
      "get_prospect",
      "get_prospecting_run",
      "list_prospecting_sources",
      "preview_source",
      "get_prospect_duplicates",
      "score_prospect",
    ]) {
      expect(names).toContain(name);
      expect(isAiActionTool(name)).toBe(false);
    }
    for (const name of [
      "create_prospect",
      "approve_prospect",
      "reject_prospect",
      "import_prospect_to_crm",
      "link_prospect_to_existing_contact",
    ]) {
      expect(names).toContain(name);
      expect(isAiActionTool(name)).toBe(true);
    }
  });

  it("nu expune implicit tool-urile de acțiune către model", () => {
    const declared = aiToolDeclarations().map((tool) => tool.name);
    expect(declared).toContain("search_prospects");
    expect(declared).not.toContain("import_prospect_to_crm");
    expect(aiToolDeclarations(true).map((t) => t.name)).toContain("import_prospect_to_crm");
  });

  it("nu conține tool-uri distructive sau de comunicare", () => {
    const names = AI_TOOLS.map((tool) => tool.name);
    for (const forbidden of [
      "send_email",
      "send_whatsapp",
      "publish_portal",
      "delete_property",
      "change_price",
      "create_contract",
      "delete_prospect",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });
});

describe("autorizarea tool-urilor de prospecting", () => {
  it("permite citirea unui utilizator cu agenție", () => {
    expect(authorizeAiTool(actorA, "search_prospects", aiToolCapability).allowed).toBe(true);
  });

  it("respinge utilizatorii fără agenție", () => {
    const result = authorizeAiTool(
      { userId: "user-x", role: "agent" },
      "search_prospects",
      aiToolCapability,
    );
    expect(result.allowed).toBe(false);
  });

  it("respinge sesiunile invalide", () => {
    expect(authorizeAiTool(null, "get_prospect", aiToolCapability).allowed).toBe(false);
  });

  it("respinge tool-urile inexistente cerute de model", () => {
    const result = authorizeAiTool(actorA, "delete_all_prospects", aiToolCapability);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("unknown_tool");
  });

  it("nu acceptă organizația din argumentele modelului", () => {
    // `authorizeAiTool` folosește exclusiv actorul verificat server-side.
    const result = authorizeAiTool(
      { ...actorA, organizationId: ORG_A },
      "get_prospect",
      aiToolCapability,
    );
    expect(result.allowed).toBe(true);
    const foreign = authorizeAiTool(
      { userId: "user-a", role: "agent" },
      "get_prospect",
      aiToolCapability,
    );
    expect(foreign.allowed).toBe(false);
  });
});

describe("auditul de prospecting", () => {
  it("scrie evenimentele cu agenția și fără PII", () => {
    const row = buildProspectingAuditRow({
      organizationId: ORG_A,
      actorId: "user-a",
      action: PROSPECTING_AUDIT_ACTIONS.prospectImported,
      entityId: "prospect-1",
      details: { leadId: "lead-1", sellerPhone: "+40722333444", apiKey: "secret" },
    });
    expect(row?.organization_id).toBe(ORG_A);
    expect(row?.entity).toBe("prospecting");
    expect(JSON.stringify(row?.new_values)).not.toContain("+40722333444");
    expect(JSON.stringify(row?.new_values)).not.toContain("secret");
    expect(row?.new_values?.["leadId"]).toBe("lead-1");
  });

  it("nu scrie nimic fără agenție (fără scurgeri cross-org)", () => {
    expect(
      buildProspectingAuditRow({
        organizationId: null,
        actorId: "user-a",
        action: PROSPECTING_AUDIT_ACTIONS.runStarted,
      }),
    ).toBeNull();
    expect(ORG_A).not.toBe(ORG_B);
  });
});

describe("providerii de surse", () => {
  function source(overrides: Partial<ProspectSource> = {}): ProspectSource {
    return {
      id: "s1",
      organizationId: ORG_A,
      name: "Feed test",
      sourceType: "feed",
      providerKey: "http_feed",
      baseUrl: null,
      enabled: false,
      configuration: {},
      ...overrides,
    };
  }

  it("nu include niciun provider comercial de scraping", () => {
    const keys = listProspectingProviders().map((provider) => provider.key);
    expect(keys).not.toContain("brightdata");
    expect(keys).not.toContain("bright_data");
    // Sursele fără integrare autorizată există doar ca provideri „unavailable".
    expect(keys.sort()).toEqual([
      "http_feed",
      "imobiliare_ro",
      "manual_list",
      "olx",
      "publi24",
      "storia",
    ]);
    for (const provider of listProspectingProviders()) {
      expect(["live", "manual", "unavailable"]).toContain(provider.availability);
    }
  });

  it("marchează sursele fără integrare ca inutilizabile", () => {
    // OLX are un provider onest „indisponibil", care nu livrează niciodată date.
    expect(resolveProspectingProvider("olx")?.availability).toBe("unavailable");
    expect(sourceUsable(source({ providerKey: "olx", enabled: true }))).toBe(false);
    expect(sourceUsable(source({ enabled: false }))).toBe(false);
  });

  it("refuză controlat colectarea când sursa nu este configurată", async () => {
    const provider = resolveProspectingProvider("http_feed");
    const result = await provider!.search(
      {
        transactionType: null,
        propertyType: null,
        county: null,
        city: null,
        zone: null,
        priceMin: null,
        priceMax: null,
        roomsMin: null,
        roomsMax: null,
        surfaceMin: null,
        surfaceMax: null,
        keywords: [],
      },
      source(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_configured");
  });

  it("respectă robots.txt", () => {
    const robots = "User-agent: *\nDisallow: /anunturi\n";
    expect(robotsAllows(robots, "/anunturi/1")).toBe(false);
    expect(robotsAllows(robots, "/feed.json")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow:\n", "/orice")).toBe(true);
  });
});
