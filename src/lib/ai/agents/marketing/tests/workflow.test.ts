/**
 * Stage 16 — fluxul Marketing Agent: preview fără scriere, aprobare umană
 * obligatorie pentru salvare/aplicare, versionare fără suprascriere.
 */
import { describe, expect, it } from "vitest";
import {
  applyMarketingApproval,
  completeMarketingStep,
  failMarketingState,
  finishMarketingPreview,
  initialMarketingState,
  isMarketingActionAllowed,
  statusOfMarketingState,
  suspendForMarketingApproval,
  validateMarketingResult,
  type MarketingResult,
  type MarketingWorkflowState,
} from "../workflow";
import { parseMarketingContent, stripJsonFence, marketingContentText } from "../content";

const propertyId = "11111111-1111-4111-8111-111111111111";

function result(overrides: Partial<MarketingResult> = {}): MarketingResult {
  return {
    propertyId,
    propertyLabel: "HB-100",
    channel: "olx",
    contentType: "listing",
    tone: "professional",
    length: "standard",
    content: {
      title: "Apartament 3 camere Militari",
      body: "Apartament cu 3 camere, 72 mp utili.",
      shortVariants: [],
      cta: null,
      hashtags: [],
      ideas: [],
    },
    validationStatus: "valid",
    issues: [],
    missingData: [],
    contextVersion: "v1",
    contextHash: "mkt-1",
    provider: "gemini",
    model: "gemini-2.5-flash",
    draftId: null,
    ...overrides,
  };
}

function generated(): MarketingWorkflowState {
  let state = initialMarketingState({
    propertyIds: [propertyId],
    channel: "olx",
    contentType: "listing",
    tone: "professional",
    length: "standard",
  });
  state = completeMarketingStep(state, "authenticate");
  state = completeMarketingStep(state, "resolve_organization");
  state = { ...state, results: [result()] };
  return finishMarketingPreview(state);
}

function suspended(): MarketingWorkflowState {
  return suspendForMarketingApproval(generated(), {
    mode: "save_draft",
    tool: "save_marketing_draft",
    resultIndex: 0,
    propertyId,
    propertyLabel: "HB-100",
    argumentsJson: JSON.stringify({ propertyId }),
    changes: [{ label: "Ciornă OLX", from: null, to: "Apartament 3 camere Militari" }],
    warnings: ["Anunțul publicat rămâne neschimbat."],
  });
}

describe("habitooMarketingWorkflow", () => {
  it("generarea simplă se încheie fără scriere și fără aprobare", () => {
    const state = generated();
    expect(statusOfMarketingState(state)).toBe("completed");
    expect(state.proposal).toBeNull();
    expect(state.execution).toBeNull();
  });

  it("propunerea de salvare suspendă fluxul", () => {
    const state = suspended();
    expect(statusOfMarketingState(state)).toBe("suspended");
    expect(isMarketingActionAllowed(state)).toBe(false);
  });

  it("fără aprobare explicită nu se execută nimic", () => {
    const rejected = applyMarketingApproval(suspended(), false);
    expect(isMarketingActionAllowed(rejected)).toBe(false);
    expect(validateMarketingResult(rejected).notes.join(" ").length).toBeGreaterThan(0);
  });

  it("după aprobare acțiunea devine permisă", () => {
    const approved = applyMarketingApproval(suspended(), true);
    expect(isMarketingActionAllowed(approved)).toBe(true);
  });

  it("o a doua decizie nu schimbă starea deja decisă", () => {
    const approved = applyMarketingApproval(suspended(), true);
    expect(applyMarketingApproval(approved, false)).toEqual(approved);
  });

  it("eșecul este stare explicită, nu text prezentat ca rezultat", () => {
    const failed = failMarketingState(generated(), "Providerul nu a răspuns.");
    expect(statusOfMarketingState(failed)).toBe("failed");
    expect(failed.failure).toBe("Providerul nu a răspuns.");
  });

  it("rezultatele rămân legate de proprietatea corectă", () => {
    const other = "22222222-2222-4222-8222-222222222222";
    const state: MarketingWorkflowState = {
      ...generated(),
      results: [result(), result({ propertyId: other, propertyLabel: "HB-200" })],
    };
    expect(state.results.map((item) => item.propertyId)).toEqual([propertyId, other]);
    expect(state.results[1]!.propertyLabel).toBe("HB-200");
  });
});

describe("parseMarketingContent", () => {
  it("acceptă JSON în bloc de cod", () => {
    const parsed = parseMarketingContent(
      '```json\n{"title":"T","body":"Text","shortVariants":[],"cta":null,"hashtags":[],"ideas":[]}\n```',
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.content.title).toBe("T");
      expect(marketingContentText(parsed.content)).toContain("Text");
    }
  });

  it("un răspuns care nu este JSON este eroare, nu rezultat", () => {
    expect(parseMarketingContent("Îmi pare rău, nu pot răspunde.").ok).toBe(false);
  });

  it("stripJsonFence păstrează JSON-ul simplu neatins", () => {
    expect(stripJsonFence('{"body":"x"}')).toBe('{"body":"x"}');
  });
});
