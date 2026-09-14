/**
 * `habitooDiagnosticWorkflow` — definiția pură a fluxului (Stage 11).
 *
 * Fluxul:
 *   START → authenticate → resolve_organization → build_context → agent →
 *   approval (SUSPEND) → read_tool → validate → respond → END
 *
 * Modulul nu atinge baza de date și nu apelează providerul: descrie doar
 * tranzițiile. Persistența (SUSPEND/RESUME după restart) și execuția reală
 * stau în `runtime.server.ts`. Astfel starea poate fi testată determinist.
 */

export const HABITOO_DIAGNOSTIC_WORKFLOW = "habitooDiagnosticWorkflow";

export const DIAGNOSTIC_STEPS = [
  "authenticate",
  "resolve_organization",
  "build_context",
  "agent",
  "approval",
  "read_tool",
  "validate",
  "respond",
] as const;

export type DiagnosticStep = (typeof DIAGNOSTIC_STEPS)[number];

export type WorkflowStatus = "running" | "suspended" | "completed" | "failed";

/** Acțiunea propusă de agent. În Stage 11 poate fi DOAR o citire. */
export type ProposedAction = {
  tool: string;
  /** Parametrii serializați (JSON), ca propunerea să rămână urmăribilă. */
  argumentsJson: string;
  /** Explicație în limbaj natural, afișată utilizatorului la aprobare. */
  reason: string;
  readOnly: true;
};

export type WorkflowState = {
  step: DiagnosticStep;
  completed: DiagnosticStep[];
  input: { question: string; propertyId: string | null };
  contextCategories: string[];
  proposal: ProposedAction | null;
  approval: { approved: boolean; decidedAt: string } | null;
  toolSummary: string | null;
  answer: string | null;
  notes: string[];
};

export function initialWorkflowState(input: {
  question: string;
  propertyId?: string | null;
}): WorkflowState {
  return {
    step: "authenticate",
    completed: [],
    input: { question: input.question, propertyId: input.propertyId ?? null },
    contextCategories: [],
    proposal: null,
    approval: null,
    toolSummary: null,
    answer: null,
    notes: [],
  };
}

export function nextStep(step: DiagnosticStep): DiagnosticStep | null {
  const index = DIAGNOSTIC_STEPS.indexOf(step);
  if (index < 0 || index === DIAGNOSTIC_STEPS.length - 1) return null;
  return DIAGNOSTIC_STEPS[index + 1] as DiagnosticStep;
}

/** Pasul de aprobare umană este singurul care suspendă fluxul. */
export function requiresApproval(step: DiagnosticStep): boolean {
  return step === "approval";
}

export function completeStep(state: WorkflowState, step: DiagnosticStep): WorkflowState {
  const completed = state.completed.includes(step) ? state.completed : [...state.completed, step];
  const following = nextStep(step);
  return { ...state, completed, step: following ?? step };
}

/** Statusul derivat din stare: sursa unică de adevăr pentru UI și DB. */
export function statusOf(state: WorkflowState): WorkflowStatus {
  if (state.answer !== null && state.completed.includes("respond")) return "completed";
  if (state.step === "approval" && state.proposal !== null && state.approval === null) {
    return "suspended";
  }
  return "running";
}

/**
 * Aplică decizia umană. Aprobarea trece la execuția tool-ului de citire;
 * respingerea sare peste tool și merge direct la validare, cu o notă.
 */
export function applyApproval(
  state: WorkflowState,
  approved: boolean,
  decidedAt: string = new Date().toISOString(),
): WorkflowState {
  if (state.step !== "approval" || state.proposal === null) return state;
  const withDecision: WorkflowState = {
    ...state,
    approval: { approved, decidedAt },
    completed: state.completed.includes("approval")
      ? state.completed
      : [...state.completed, "approval"],
  };
  if (approved) return { ...withDecision, step: "read_tool" };
  return {
    ...withDecision,
    step: "validate",
    notes: [...withDecision.notes, "Utilizatorul a respins citirea propusă."],
  };
}

/** Validarea rezultatului înainte de răspuns: fără date, fără concluzii. */
export function validateWorkflowResult(state: WorkflowState): {
  ok: boolean;
  notes: string[];
} {
  const notes: string[] = [];
  if (state.approval?.approved && state.toolSummary === null) {
    notes.push("Citirea aprobată nu a returnat date.");
  }
  if (state.contextCategories.length === 0) {
    notes.push("Contextul disponibil a fost minim.");
  }
  return { ok: notes.length === 0, notes };
}
