/**
 * Teste pentru fluxul de prospectare: pași, suspend/resume, aprobare umană
 * obligatorie și imposibilitatea importului fără aprobare.
 */
import { describe, expect, it } from "vitest";
import {
  applyProspectingApproval,
  completeProspectingStep,
  HABITOO_PROSPECTING_WORKFLOW,
  initialProspectingState,
  isImportAllowed,
  nextProspectingStep,
  PROSPECTING_STEPS,
  prospectingStatusOf,
  requiresHumanApproval,
  validateProspectingResult,
} from "../workflow";
import { emptyCriteria } from "../types";

function state() {
  return initialProspectingState({
    searchId: "11111111-1111-1111-1111-111111111111",
    criteria: emptyCriteria(),
    sourceIds: [],
  });
}

function advanceToApproval(candidateIds: string[]) {
  let current = state();
  for (const step of PROSPECTING_STEPS) {
    if (step === "human_approval") break;
    current = completeProspectingStep(current, step);
  }
  return { ...current, step: "human_approval" as const, candidateIds };
}

describe("definiția fluxului", () => {
  it("are numele și ordinea pașilor așteptate", () => {
    expect(HABITOO_PROSPECTING_WORKFLOW).toBe("habitooProspectingWorkflow");
    expect(PROSPECTING_STEPS[0]).toBe("authenticate_actor");
    expect(PROSPECTING_STEPS.at(-1)).toBe("complete");
    expect(nextProspectingStep("deduplicate")).toBe("ai_classify");
    expect(nextProspectingStep("complete")).toBeNull();
  });

  it("suspendă doar la aprobarea umană", () => {
    expect(requiresHumanApproval("human_approval")).toBe(true);
    expect(requiresHumanApproval("crm_import")).toBe(false);
    expect(prospectingStatusOf(advanceToApproval(["a"]))).toBe("suspended");
    expect(prospectingStatusOf(state())).toBe("running");
  });
});

describe("aprobarea umană", () => {
  const idA = "22222222-2222-2222-2222-222222222222";
  const idB = "33333333-3333-3333-3333-333333333333";
  const foreign = "44444444-4444-4444-4444-444444444444";

  it("reia fluxul după decizie și marchează statusul completat", () => {
    const suspended = advanceToApproval([idA, idB]);
    const resumed = applyProspectingApproval(suspended, { approvedIds: [idA], rejectedIds: [idB] });
    expect(resumed.approval?.approvedIds).toEqual([idA]);
    expect(resumed.step).toBe("crm_import");
    const done = completeProspectingStep(
      completeProspectingStep(completeProspectingStep(resumed, "crm_import"), "audit"),
      "complete",
    );
    expect(prospectingStatusOf(done)).toBe("completed");
  });

  it("ignoră ID-uri care nu fac parte din rulare", () => {
    const resumed = applyProspectingApproval(advanceToApproval([idA]), {
      approvedIds: [foreign],
      rejectedIds: [],
    });
    expect(resumed.approval?.approvedIds).toEqual([]);
    expect(isImportAllowed(resumed, foreign)).toBe(false);
  });

  it("permite importul numai pentru candidați aprobați explicit", () => {
    const resumed = applyProspectingApproval(advanceToApproval([idA, idB]), {
      approvedIds: [idA],
      rejectedIds: [idB],
    });
    expect(isImportAllowed(resumed, idA)).toBe(true);
    expect(isImportAllowed(resumed, idB)).toBe(false);
  });

  it("nu permite o a doua decizie pe aceeași rulare (anti dublu-click)", () => {
    const first = applyProspectingApproval(advanceToApproval([idA]), {
      approvedIds: [idA],
      rejectedIds: [],
    });
    const second = applyProspectingApproval(first, { approvedIds: [], rejectedIds: [idA] });
    expect(second).toEqual(first);
  });

  it("nu poate fi aprobat un flux care nu a ajuns la pasul de aprobare", () => {
    const early = state();
    expect(applyProspectingApproval(early, { approvedIds: [idA], rejectedIds: [] })).toEqual(early);
  });
});

describe("validarea candidaților", () => {
  it("semnalează lipsa surselor și a rezultatelor", () => {
    const result = validateProspectingResult(state());
    expect(result.ok).toBe(false);
    expect(result.notes.join(" ")).toContain("sursă");
  });

  it("marchează explicit folosirea datelor de test", () => {
    const withFixture = {
      ...state(),
      fixtureUsed: true,
      sourcesUsed: [{ id: "s", name: "Listă", providerKey: "manual_list", fixture: true }],
      counters: { ...state().counters, itemsFound: 2 },
    };
    expect(validateProspectingResult(withFixture).notes.join(" ")).toContain("date de test");
  });
});
