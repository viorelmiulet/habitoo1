/**
 * Planner-ul Habitoo Manager (Stage 17): ordinea pașilor, bugetele, starea
 * durabilă și aprobarea legată de payload-ul exact.
 */
import { describe, expect, it } from "vitest";
import { routeManagerRequest } from "../intent";
import {
  applyApproval,
  budgetExceeded,
  buildManagerPlan,
  completeStep,
  failPlan,
  findStep,
  isApprovedForExecution,
  MANAGER_MAX_STEPS,
  MANAGER_TIME_BUDGET_MS,
  nextPendingStep,
  payloadHash,
  startStep,
  statusOfPlan,
  suspendForApproval,
} from "../plan";

const PROPERTY = "11111111-1111-4111-8111-111111111111";

function plan(request: string, propertyIds: string[] = [PROPERTY]) {
  return buildManagerPlan({
    planId: "plan-1",
    request,
    routing: routeManagerRequest(request),
    propertyIds,
    channel: "olx",
    contentType: "listing",
    tone: "professional",
    length: "standard",
  });
}

describe("buildManagerPlan", () => {
  it("ordonează pașii: context CRM → ACP → marketing → propunere", () => {
    const state = plan("Pregătește proprietatea pentru promovare");
    expect(state.steps.map((step) => step.kind)).toEqual([
      "crm_context",
      "acp_read",
      "marketing_generate",
      "propose_action",
    ]);
    expect(state.steps.map((step) => step.index)).toEqual([0, 1, 2, 3]);
  });

  it("nu adaugă pas de scriere când cererea este doar previzualizare", () => {
    const state = plan("Pregătește proprietatea pentru promovare, dar nu aplica nimic");
    expect(state.previewOnly).toBe(true);
    expect(state.steps.some((step) => step.kind === "propose_action")).toBe(false);
  });

  it("planul de prospectare începe cu verificarea surselor", () => {
    const state = plan("Găsește proprietăți noi care merită promovate", []);
    expect(state.steps[0]?.kind).toBe("prospecting_check");
  });

  it("o capabilitate inexistentă produce un singur pas indisponibil", () => {
    const state = plan("Publică anunțul pe OLX automat", []);
    expect(state.steps).toHaveLength(1);
    expect(state.steps[0]?.kind).toBe("unavailable");
  });

  it("respectă bugetul de pași și de adâncime", () => {
    const state = plan("Pregătește proprietatea pentru promovare");
    expect(state.steps.length).toBeLessThanOrEqual(MANAGER_MAX_STEPS);
    expect(budgetExceeded(state)).toBeNull();
    expect(budgetExceeded(state, state.startedAtMs + MANAGER_TIME_BUDGET_MS + 1)).toContain(
      "timpul alocat",
    );
  });

  it("depășirea adâncimii oprește planul", () => {
    const state = { ...plan("Pregătește proprietatea pentru promovare"), depth: 9 };
    expect(budgetExceeded(state)).toContain("adâncimea");
  });
});

describe("execuția pașilor", () => {
  it("marchează pașii în ordine și adună sursele", () => {
    let state = plan("Pregătește proprietatea pentru promovare");
    const first = nextPendingStep(state)!;
    state = startStep(state, first.id);
    expect(findStep(state, first.id)?.status).toBe("running");
    state = completeStep(state, first.id, { properties: 1 }, "CRM Habitoo");
    expect(findStep(state, first.id)?.status).toBe("completed");
    expect(state.sources).toContain("CRM Habitoo");
    expect(nextPendingStep(state)?.kind).toBe("acp_read");
    expect(statusOfPlan(state)).toBe("running");
  });

  it("un plan eșuat rămâne eșuat", () => {
    const state = failPlan(plan("Ce lead-uri necesită follow-up?", []), "eroare");
    expect(statusOfPlan(state)).toBe("failed");
  });
});

describe("aprobarea umană", () => {
  const payload = { tool: "save_marketing_draft", marketingRunId: "run-1", argumentsJson: "{}" };

  function suspended() {
    const state = plan("Pregătește proprietatea pentru promovare");
    const step = state.steps.find((item) => item.kind === "propose_action")!;
    return suspendForApproval(state, {
      stepId: step.id,
      tool: "save_marketing_draft",
      label: "Salvare ciornă",
      argumentsJson: "{}",
      changes: [],
      warnings: [],
      payload,
    });
  }

  it("suspendă planul înainte de execuție", () => {
    const state = suspended();
    expect(statusOfPlan(state)).toBe("suspended");
    expect(state.approval?.payloadHash).toBe(payloadHash(payload));
    expect(isApprovedForExecution(state, payload)).toBe(false);
  });

  it("execută doar payload-ul aprobat", () => {
    const state = applyApproval(suspended(), true);
    expect(isApprovedForExecution(state, payload)).toBe(true);
    expect(isApprovedForExecution(state, { ...payload, argumentsJson: '{"x":1}' })).toBe(false);
  });

  it("respingerea nu permite execuția", () => {
    const state = applyApproval(suspended(), false);
    expect(isApprovedForExecution(state, payload)).toBe(false);
  });

  it("decizia este definitivă: nu se poate schimba după aprobare", () => {
    const once = applyApproval(suspended(), true);
    const twice = applyApproval(once, false);
    expect(twice.approvalDecision?.approved).toBe(true);
  });

  it("hash-ul este stabil față de ordinea cheilor", () => {
    expect(payloadHash({ a: 1, b: 2 })).toBe(payloadHash({ b: 2, a: 1 }));
    expect(payloadHash({ a: 1 })).not.toBe(payloadHash({ a: 2 }));
  });
});
