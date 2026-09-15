/**
 * `habitooProspectingWorkflow` — definiția pură a fluxului (Stage 13).
 *
 * START → authenticate_actor → resolve_organization → validate_search →
 * create_run → resolve_sources → fetch_source_data → normalize_results →
 * deduplicate → ai_classify → deterministic_score → validate_candidates →
 * persist_candidates → human_approval (SUSPEND) → crm_import → audit →
 * complete → END
 *
 * Modulul nu atinge baza de date și nu apelează providerul: descrie doar
 * tranzițiile și starea, ca suspend/resume să poată fi testat determinist.
 * Persistența trăiește în `runtime.server.ts`, pe `ai_workflow_runs`.
 */
import type { ProspectSearchCriteria, ProspectingProviderAvailability } from "./types";

export const HABITOO_PROSPECTING_WORKFLOW = "habitooProspectingWorkflow";

export const PROSPECTING_STEPS = [
  "authenticate_actor",
  "resolve_organization",
  "validate_search",
  "create_run",
  "resolve_sources",
  "fetch_source_data",
  "normalize_results",
  "deduplicate",
  "ai_classify",
  "deterministic_score",
  "validate_candidates",
  "persist_candidates",
  "human_approval",
  "crm_import",
  "audit",
  "complete",
] as const;

export type ProspectingStep = (typeof PROSPECTING_STEPS)[number];

export type ProspectingWorkflowStatus = "running" | "suspended" | "completed" | "failed";

export type ProspectingCounters = {
  itemsFound: number;
  itemsNormalized: number;
  duplicatesFound: number;
  candidatesFound: number;
  errorsCount: number;
};

export function emptyCounters(): ProspectingCounters {
  return {
    itemsFound: 0,
    itemsNormalized: 0,
    duplicatesFound: 0,
    candidatesFound: 0,
    errorsCount: 0,
  };
}

export type ProspectingWorkflowState = {
  step: ProspectingStep;
  completed: ProspectingStep[];
  searchId: string;
  runId: string | null;
  criteria: ProspectSearchCriteria;
  sourceIds: string[];
  /** Sursele efectiv folosite, cu marcarea explicită a datelor de test. */
  sourcesUsed: {
    id: string;
    name: string;
    providerKey: string;
    fixture: boolean;
    availability?: ProspectingProviderAvailability;
  }[];
  /**
   * Disponibilitatea reală a surselor rulării. `unavailable` înseamnă că nicio
   * sursă externă autorizată nu este conectată, deci rularea NU raportează
   * date de piață.
   */
  sourceAvailability: ProspectingProviderAvailability;
  counters: ProspectingCounters;
  /** Candidații propuși spre aprobare (ID-uri de prospecte deja persistate). */
  candidateIds: string[];
  approval: {
    decidedAt: string;
    approvedIds: string[];
    rejectedIds: string[];
  } | null;
  importedProspectIds: string[];
  notes: string[];
  warnings: string[];
  fixtureUsed: boolean;
};

export function initialProspectingState(input: {
  searchId: string;
  criteria: ProspectSearchCriteria;
  sourceIds: string[];
}): ProspectingWorkflowState {
  return {
    step: "authenticate_actor",
    completed: [],
    searchId: input.searchId,
    runId: null,
    criteria: input.criteria,
    sourceIds: input.sourceIds,
    sourcesUsed: [],
    sourceAvailability: "unavailable",
    counters: emptyCounters(),
    candidateIds: [],
    approval: null,
    importedProspectIds: [],
    notes: [],
    warnings: [],
    fixtureUsed: false,
  };
}

export function nextProspectingStep(step: ProspectingStep): ProspectingStep | null {
  const index = PROSPECTING_STEPS.indexOf(step);
  if (index < 0 || index === PROSPECTING_STEPS.length - 1) return null;
  return PROSPECTING_STEPS[index + 1] as ProspectingStep;
}

/** Aprobarea umană este singurul pas care suspendă fluxul. */
export function requiresHumanApproval(step: ProspectingStep): boolean {
  return step === "human_approval";
}

export function completeProspectingStep(
  state: ProspectingWorkflowState,
  step: ProspectingStep,
): ProspectingWorkflowState {
  const completed = state.completed.includes(step) ? state.completed : [...state.completed, step];
  const following = nextProspectingStep(step);
  return { ...state, completed, step: following ?? step };
}

/** Statusul derivat din stare: sursa unică de adevăr pentru UI și baza de date. */
export function prospectingStatusOf(state: ProspectingWorkflowState): ProspectingWorkflowStatus {
  if (state.completed.includes("complete")) return "completed";
  if (state.step === "human_approval" && state.approval === null) return "suspended";
  return "running";
}

/**
 * Aplică decizia umană. Doar candidații propuși de acest flux pot fi aprobați;
 * orice alt ID este ignorat, deci nu se poate importa nimic din afara rulării.
 */
export function applyProspectingApproval(
  state: ProspectingWorkflowState,
  decision: { approvedIds: string[]; rejectedIds: string[] },
  decidedAt: string = new Date().toISOString(),
): ProspectingWorkflowState {
  if (state.step !== "human_approval" || state.approval !== null) return state;
  const allowed = new Set(state.candidateIds);
  const approvedIds = [...new Set(decision.approvedIds)].filter((id) => allowed.has(id));
  const rejectedIds = [...new Set(decision.rejectedIds)].filter(
    (id) => allowed.has(id) && !approvedIds.includes(id),
  );
  const withDecision: ProspectingWorkflowState = {
    ...state,
    approval: { decidedAt, approvedIds, rejectedIds },
    completed: state.completed.includes("human_approval")
      ? state.completed
      : [...state.completed, "human_approval"],
    step: "crm_import",
  };
  if (approvedIds.length === 0) {
    return {
      ...withDecision,
      notes: [...withDecision.notes, "Nicio oportunitate nu a fost aprobată pentru import."],
    };
  }
  return withDecision;
}

/** Validarea candidaților înainte de persistare: fără date, fără concluzii. */
export function validateProspectingResult(state: ProspectingWorkflowState): {
  ok: boolean;
  notes: string[];
} {
  const notes: string[] = [];
  if (state.sourcesUsed.length === 0) {
    notes.push("Nicio sursă activă nu a putut fi folosită pentru această căutare.");
  }
  if (state.counters.itemsFound === 0) {
    notes.push("Sursele nu au returnat anunțuri pentru criteriile alese.");
  }
  if (state.fixtureUsed) {
    notes.push("Rularea a folosit date de test marcate explicit, nu date reale de piață.");
  }
  return { ok: notes.length === 0, notes };
}

/** Importul CRM este permis numai pentru candidați aprobați explicit. */
export function isImportAllowed(state: ProspectingWorkflowState, prospectId: string): boolean {
  return state.approval?.approvedIds.includes(prospectId) === true;
}
