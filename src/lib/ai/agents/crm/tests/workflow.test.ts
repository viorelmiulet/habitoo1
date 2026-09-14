import { describe, expect, it } from "vitest";
import {
  applyCrmApproval,
  completeCrmStep,
  finishWithoutAction,
  initialCrmState,
  isCrmActionAllowed,
  statusOfCrmState,
  validateCrmResult,
} from "../workflow";
import { buildCrmProposal } from "../actions";

const proposal = buildCrmProposal({
  tool: "update_lead_status",
  args: { leadId: "11111111-1111-4111-8111-111111111111", stage: "contacted" },
  entity: { type: "lead", id: "11111111-1111-4111-8111-111111111111", label: "Ion Popescu" },
  changes: [{ field: "stage", label: "Etapă", from: "Nou", to: "Contactat" }],
  reason: "Cerut de utilizator",
});

function suspended() {
  let state = initialCrmState({ question: "Treci leadul în contactat" });
  state = completeCrmStep(state, "authenticate");
  state = completeCrmStep(state, "resolve_organization");
  state = completeCrmStep(state, "classify_request");
  state = completeCrmStep(state, "build_context");
  state = completeCrmStep(state, "read_tools");
  state = completeCrmStep(state, "analyze");
  state = { ...state, answer: "Leadul este în etapa Nou." };
  state = completeCrmStep(state, "respond");
  return { ...state, proposal, step: "approval" as const };
}

describe("habitooCrmWorkflow", () => {
  it("suspendă fluxul la propunerea de acțiune", () => {
    const state = suspended();
    expect(statusOfCrmState(state)).toBe("suspended");
    expect(isCrmActionAllowed(state)).toBe(false);
  });

  it("fără aprobare nu se poate executa acțiunea", () => {
    const rejected = applyCrmApproval(suspended(), false);
    expect(isCrmActionAllowed(rejected)).toBe(false);
    expect(rejected.step).toBe("validate");
    expect(rejected.notes.join(" ")).toContain("respins");
  });

  it("după aprobare fluxul trece la execuție", () => {
    const approved = applyCrmApproval(suspended(), true);
    expect(approved.step).toBe("execute_action");
    expect(isCrmActionAllowed(approved)).toBe(true);
  });

  it("o a doua decizie nu schimbă starea deja decisă", () => {
    const approved = applyCrmApproval(suspended(), true);
    const again = applyCrmApproval(approved, false);
    expect(again).toEqual(approved);
  });

  it("fără propunere fluxul se încheie singur", () => {
    let state = initialCrmState({ question: "Care sunt prioritățile mele?" });
    state = { ...state, answer: "3 lead-uri prioritare." };
    state = finishWithoutAction(state);
    expect(statusOfCrmState(state)).toBe("completed");
    expect(state.proposal).toBeNull();
  });

  it("validarea semnalează duplicatul și lipsa rezultatului", () => {
    let state = applyCrmApproval(suspended(), true);
    expect(validateCrmResult(state).notes.join(" ")).toContain("nu a produs");
    state = {
      ...state,
      execution: { ok: true, message: "deja existent", entityId: "x", duplicate: true },
    };
    expect(validateCrmResult(state).notes.join(" ")).toContain("duplicat");
  });
});

describe("eșec explicit la propunere", () => {
  it("o cerere de modificare care nu poate fi propusă marchează fluxul ca eșuat", async () => {
    const { failCrmState } = await import("../workflow");
    let state = initialCrmState({ question: "Treci leadul în negotiation" });
    state = { ...state, answer: "Leadul este în etapa Nou." };
    state = failCrmState(state, "Serviciul AI este momentan aglomerat.");
    expect(statusOfCrmState(state)).toBe("failed");
    expect(state.proposal).toBeNull();
    expect(isCrmActionAllowed(state)).toBe(false);
    expect(state.notes.join(" ")).toContain("aglomerat");
  });
});
