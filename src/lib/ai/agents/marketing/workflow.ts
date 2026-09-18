/**
 * `habitooMarketingWorkflow` — definiția pură a fluxului de marketing (Stage 16).
 *
 * Fluxul:
 *   authenticate → resolve_organization → resolve_properties → build_context →
 *   generate → validate_facts → respond → [approval (SUSPEND) → persist →
 *   validate] → audit → complete
 *
 * Generarea este doar preview: nu modifică nimic. Salvarea ciornei în CRM sau
 * aplicarea textului peste anunț sunt scrieri reversibile și trec obligatoriu
 * prin aprobare umană. Persistența stării stă în `runtime.server.ts`
 * (`ai_workflow_runs`), deci un flux suspendat supraviețuiește reîncărcării
 * paginii și repornirii serverului.
 */
import type {
  MarketingChannel,
  MarketingContentType,
  MarketingLength,
  MarketingTone,
} from "./channels";
import type { MarketingContent } from "./content";
import type { MarketingFactIssue, MarketingMissingField } from "./facts";

export const HABITOO_MARKETING_WORKFLOW = "habitooMarketingWorkflow";

export const MARKETING_STEPS = [
  "authenticate",
  "resolve_organization",
  "resolve_properties",
  "build_context",
  "generate",
  "validate_facts",
  "respond",
  "approval",
  "persist",
  "validate",
  "audit",
  "complete",
] as const;

export type MarketingStep = (typeof MARKETING_STEPS)[number];

export type MarketingWorkflowStatus = "running" | "suspended" | "completed" | "failed";

export type MarketingResult = {
  propertyId: string;
  propertyLabel: string;
  channel: MarketingChannel;
  contentType: MarketingContentType;
  tone: MarketingTone;
  length: MarketingLength;
  content: MarketingContent;
  validationStatus: "valid" | "warning" | "invalid";
  issues: MarketingFactIssue[];
  missingData: MarketingMissingField[];
  contextVersion: string;
  contextHash: string;
  provider: string;
  model: string;
  /** Ciorna salvată din acest rezultat, dacă a fost aprobată. */
  draftId: string | null;
};

export type MarketingMode = "save_draft" | "apply_to_property";

export type MarketingProposal = {
  mode: MarketingMode;
  tool: "save_marketing_draft" | "apply_marketing_draft";
  resultIndex: number;
  propertyId: string;
  propertyLabel: string;
  argumentsJson: string;
  /** Amprenta argumentelor la suspendare, verificată la aprobare. */
  argumentsHash?: string;
  changes: { label: string; from: string | null; to: string }[];
  warnings: string[];
};

export type MarketingWorkflowState = {
  step: MarketingStep;
  completed: MarketingStep[];
  input: {
    propertyIds: string[];
    channel: MarketingChannel;
    contentType: MarketingContentType;
    tone: MarketingTone;
    length: MarketingLength;
    notes: string | null;
  };
  results: MarketingResult[];
  /** Proprietăți pentru care generarea a eșuat, cu motivul afișabil. */
  failures: { propertyId: string; message: string }[];
  proposal: MarketingProposal | null;
  approval: { approved: boolean; decidedAt: string } | null;
  execution: {
    ok: boolean;
    message: string;
    entityId: string | null;
    code?: string | null;
  } | null;
  notes: string[];
  failure: string | null;
};

export function initialMarketingState(input: {
  propertyIds: string[];
  channel: MarketingChannel;
  contentType: MarketingContentType;
  tone: MarketingTone;
  length: MarketingLength;
  notes?: string | null;
}): MarketingWorkflowState {
  return {
    step: "authenticate",
    completed: [],
    input: {
      propertyIds: input.propertyIds,
      channel: input.channel,
      contentType: input.contentType,
      tone: input.tone,
      length: input.length,
      notes: input.notes ?? null,
    },
    results: [],
    failures: [],
    proposal: null,
    approval: null,
    execution: null,
    notes: [],
    failure: null,
  };
}

function withStep(state: MarketingWorkflowState, step: MarketingStep): MarketingWorkflowState {
  const index = MARKETING_STEPS.indexOf(step);
  const next = MARKETING_STEPS[index + 1] ?? "complete";
  return {
    ...state,
    step: next,
    completed: [...new Set([...state.completed, step])],
  };
}

export function completeMarketingStep(
  state: MarketingWorkflowState,
  step: MarketingStep,
): MarketingWorkflowState {
  return withStep(state, step);
}

/** Fluxul se încheie fără nicio scriere: preview livrat, date neatinse. */
export function finishMarketingPreview(state: MarketingWorkflowState): MarketingWorkflowState {
  return {
    ...state,
    step: "complete",
    completed: [
      ...new Set([...state.completed, "respond", "audit", "complete"] as MarketingStep[]),
    ],
  };
}

export function failMarketingState(
  state: MarketingWorkflowState,
  message: string,
): MarketingWorkflowState {
  return { ...state, failure: message, step: "complete" };
}

/** Fluxul intră în așteptarea deciziei umane pentru o scriere reversibilă. */
export function suspendForMarketingApproval(
  state: MarketingWorkflowState,
  proposal: MarketingProposal,
): MarketingWorkflowState {
  return {
    ...state,
    proposal,
    approval: null,
    execution: null,
    failure: null,
    step: "approval",
    completed: [...new Set([...state.completed, "respond"] as MarketingStep[])],
  };
}

export function applyMarketingApproval(
  state: MarketingWorkflowState,
  approved: boolean,
): MarketingWorkflowState {
  if (state.proposal === null) return state;
  // O decizie este definitivă: o a doua cerere nu rescrie starea.
  if (state.approval) return state;
  return {
    ...state,
    approval: { approved, decidedAt: new Date().toISOString() },
    step: approved ? "persist" : "validate",
  };
}

/** Execuția are loc numai cu aprobare explicită și cu propunere validă. */
export function isMarketingActionAllowed(state: MarketingWorkflowState): boolean {
  return state.proposal !== null && state.approval?.approved === true;
}

export function statusOfMarketingState(state: MarketingWorkflowState): MarketingWorkflowStatus {
  if (state.failure !== null) return "failed";
  if (state.step === "approval" && state.approval === null) return "suspended";
  if (state.step === "complete") return "completed";
  return "running";
}

export function validateMarketingResult(state: MarketingWorkflowState): { notes: string[] } {
  const notes: string[] = [];
  if (state.approval?.approved === false) {
    notes.push("Propunerea a fost respinsă. Nicio dată nu a fost modificată.");
  }
  if (state.execution?.ok === false) {
    notes.push("Operațiunea nu a fost finalizată. Datele au rămas neschimbate.");
  }
  if (state.execution?.ok === true && state.proposal?.mode === "apply_to_property") {
    notes.push("Textul a fost aplicat pe proprietate. Versiunea anterioară rămâne în istoric.");
  }
  return { notes };
}
