/**
 * Workflow: pași, suspendare la aprobare, reluare și validare.
 */
import { describe, expect, it } from "vitest";
import {
  applyApproval,
  completeStep,
  DIAGNOSTIC_STEPS,
  HABITOO_DIAGNOSTIC_WORKFLOW,
  initialWorkflowState,
  nextStep,
  requiresApproval,
  statusOf,
  validateWorkflowResult,
} from "../workflows/diagnostic";

function runToApproval() {
  let state = initialWorkflowState({ question: "Ce am în Cluj?", propertyId: null });
  state = completeStep(state, "authenticate");
  state = completeStep(state, "resolve_organization");
  state = { ...completeStep(state, "build_context"), contextCategories: ["property"] };
  state = {
    ...completeStep(state, "agent"),
    proposal: {
      tool: "search_properties",
      argumentsJson: JSON.stringify({ query: "Cluj" }),
      reason: "Căutare în portofoliu.",
      readOnly: true,
    },
  };
  return state;
}

describe("habitooDiagnosticWorkflow", () => {
  it("are numele și ordinea pașilor documentate", () => {
    expect(HABITOO_DIAGNOSTIC_WORKFLOW).toBe("habitooDiagnosticWorkflow");
    expect(DIAGNOSTIC_STEPS[0]).toBe("authenticate");
    expect(DIAGNOSTIC_STEPS[DIAGNOSTIC_STEPS.length - 1]).toBe("respond");
    expect(nextStep("build_context")).toBe("agent");
    expect(nextStep("respond")).toBeNull();
  });

  it("suspendă exact la pasul de aprobare umană", () => {
    const state = runToApproval();
    expect(state.step).toBe("approval");
    expect(requiresApproval(state.step)).toBe(true);
    expect(statusOf(state)).toBe("suspended");
  });

  it("reluarea aprobată trece la execuția tool-ului de citire", () => {
    const resumed = applyApproval(runToApproval(), true, "2026-01-01T00:00:00.000Z");
    expect(resumed.step).toBe("read_tool");
    expect(resumed.approval).toEqual({ approved: true, decidedAt: "2026-01-01T00:00:00.000Z" });
    expect(statusOf(resumed)).toBe("running");
  });

  it("respingerea sare peste tool și notează decizia", () => {
    const resumed = applyApproval(runToApproval(), false);
    expect(resumed.step).toBe("validate");
    expect(resumed.notes.join(" ")).toContain("respins");
  });

  it("propunerea este întotdeauna read-only în Stage 11", () => {
    expect(runToApproval().proposal?.readOnly).toBe(true);
  });

  it("fluxul se închide după respond", () => {
    let state = applyApproval(runToApproval(), true);
    state = { ...completeStep(state, "read_tool"), toolSummary: "3 proprietăți" };
    state = completeStep(state, "validate");
    state = { ...completeStep(state, "respond"), answer: "Am citit 3 proprietăți." };
    expect(statusOf(state)).toBe("completed");
  });

  it("validarea semnalează o citire aprobată fără rezultat", () => {
    const state = { ...applyApproval(runToApproval(), true), toolSummary: null };
    expect(validateWorkflowResult(state).ok).toBe(false);
  });

  it("starea este pur serializabilă (poate fi salvată și reluată după restart)", () => {
    const state = runToApproval();
    const roundTrip = JSON.parse(JSON.stringify(state));
    expect(roundTrip).toEqual(state);
    expect(statusOf(roundTrip)).toBe("suspended");
    expect(applyApproval(roundTrip, true).step).toBe("read_tool");
  });
});
