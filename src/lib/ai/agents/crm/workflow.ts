/**
 * `habitooCrmWorkflow` — definiția pură a fluxului CRM (Stage 14).
 *
 * Fluxul:
 *   authenticate → resolve_organization → classify_request → build_context →
 *   read_tools → analyze → respond → [action_proposal → approval (SUSPEND) →
 *   execute_action → validate] → audit → complete
 *
 * Modulul nu atinge baza de date și nu apelează providerul: descrie doar
 * tranzițiile, ca starea să fie testabilă determinist. Persistența și execuția
 * reală stau în `runtime.server.ts` (`ai_workflow_runs`), deci un flux suspendat
 * supraviețuiește reîncărcării paginii și repornirii serverului.
 */
import type { CrmActionProposal } from "./actions";
import type { CrmIntent } from "./filters";

export const HABITOO_CRM_WORKFLOW = "habitooCrmWorkflow";

export const CRM_STEPS = [
  "authenticate",
  "resolve_organization",
  "classify_request",
  "build_context",
  "read_tools",
  "analyze",
  "respond",
  "action_proposal",
  "approval",
  "execute_action",
  "validate",
  "audit",
  "complete",
] as const;

export type CrmStep = (typeof CRM_STEPS)[number];

export type CrmWorkflowStatus = "running" | "suspended" | "completed" | "failed";

export type CrmWorkflowState = {
  step: CrmStep;
  completed: CrmStep[];
  input: { question: string; leadId: string | null; contactId: string | null };
  intent: CrmIntent | null;
  contextCategories: string[];
  readSummary: string | null;
  answer: string | null;
  proposal: CrmActionProposal | null;
  approval: { approved: boolean; decidedAt: string } | null;
  execution: { ok: boolean; message: string; entityId: string | null; duplicate: boolean } | null;
  notes: string[];
  /** Eșec explicit: cererea de modificare nu a putut fi transformată în propunere. */
  failure: string | null;
};


export function initialCrmState(input: {
  question: string;
  leadId?: string | null;
  contactId?: string | null;
}): CrmWorkflowState {
  return {
    step: "authenticate",
    completed: [],
    input: {
      question: input.question,
      leadId: input.leadId ?? null,
      contactId: input.contactId ?? null,
    },
    intent: null,
    contextCategories: [],
    readSummary: null,
    answer: null,
    proposal: null,
    approval: null,
    execution: null,
    notes: [],
  };
}

export function nextCrmStep(step: CrmStep): CrmStep | null {
  const index = CRM_STEPS.indexOf(step);
  if (index < 0 || index === CRM_STEPS.length - 1) return null;
  return CRM_STEPS[index + 1] as CrmStep;
}

export function completeCrmStep(state: CrmWorkflowState, step: CrmStep): CrmWorkflowState {
  const completed = state.completed.includes(step) ? state.completed : [...state.completed, step];
  const following = nextCrmStep(step);
  return { ...state, completed, step: following ?? step };
}

/** Fără propunere fluxul se încheie după răspuns: nu suspendă degeaba. */
export function finishWithoutAction(state: CrmWorkflowState): CrmWorkflowState {
  return {
    ...state,
    proposal: null,
    step: "complete",
    completed: [...new Set([...state.completed, "respond", "audit", "complete"])] as CrmStep[],
  };
}

export function statusOfCrmState(state: CrmWorkflowState): CrmWorkflowStatus {
  if (state.step === "complete" && state.completed.includes("complete")) return "completed";
  if (state.step === "approval" && state.proposal !== null && state.approval === null) {
    return "suspended";
  }
  if (state.execution && state.execution.ok === false) return "failed";
  return "running";
}

/** Aplică decizia umană. Fără aprobare, fluxul NU ajunge la execuție. */
export function applyCrmApproval(
  state: CrmWorkflowState,
  approved: boolean,
  decidedAt: string = new Date().toISOString(),
): CrmWorkflowState {
  if (state.step !== "approval" || state.proposal === null) return state;
  const withDecision: CrmWorkflowState = {
    ...state,
    approval: { approved, decidedAt },
    completed: state.completed.includes("approval")
      ? state.completed
      : [...state.completed, "approval"],
  };
  if (approved) return { ...withDecision, step: "execute_action" };
  return {
    ...withDecision,
    step: "validate",
    notes: [...withDecision.notes, "Utilizatorul a respins acțiunea propusă."],
  };
}

/** Sursa unică de adevăr pentru „se poate executa acțiunea?”. */
export function isCrmActionAllowed(state: CrmWorkflowState): boolean {
  return state.proposal !== null && state.approval?.approved === true;
}

export function validateCrmResult(state: CrmWorkflowState): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  if (state.approval?.approved && state.execution === null) {
    notes.push("Acțiunea aprobată nu a produs un rezultat.");
  }
  if (state.execution?.duplicate) {
    notes.push("Acțiunea exista deja: nu am creat un duplicat.");
  }
  if (state.answer === null && state.readSummary === null) {
    notes.push("Fluxul nu a produs date noi.");
  }
  return { ok: notes.length === 0, notes };
}
