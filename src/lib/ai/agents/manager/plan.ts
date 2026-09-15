/**
 * Planner-ul Habitoo Manager (Stage 17) — modul pur, fără DB și fără model.
 *
 * Planul este construit determinist din intenție: pași ordonați, fiecare cu
 * agentul responsabil, tool-ul folosit și un status urmăribil. Bugetele
 * (pași, adâncime, timp) opresc orice buclă între agenți.
 */
import { MANAGER_AGENT_LABELS, type ManagerAgent, type ManagerIntent, type ManagerRouting } from "./intent";

export const MANAGER_WORKFLOW = "habitooManagerWorkflow";

/** Bugete de siguranță: fără ele un lanț de agenți ar putea rula la infinit. */
export const MANAGER_MAX_STEPS = 10;
export const MANAGER_MAX_DEPTH = 2;
export const MANAGER_TIME_BUDGET_MS = 90_000;

export const MANAGER_STEP_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "blocked",
  "awaiting_approval",
  "skipped",
] as const;

/** Valori serializabile: starea planului traversează granița client/server. */
export type ManagerJson =
  | string
  | number
  | boolean
  | null
  | ManagerJson[]
  | { [key: string]: ManagerJson };

export type ManagerStepStatus = (typeof MANAGER_STEP_STATUSES)[number];

/** Tipul de execuție al unui pas. Managerul nu are alt mod de a atinge date. */
export type ManagerStepKind =
  | "crm_context"
  | "crm_answer"
  | "acp_read"
  | "marketing_generate"
  | "prospecting_check"
  | "propose_action"
  | "unavailable";

export type ManagerStep = {
  id: string;
  index: number;
  kind: ManagerStepKind;
  agent: ManagerAgent | "manager";
  title: string;
  /** Tool-ul allowlisted folosit de pas (`null` pentru pași de orchestrare). */
  tool: string | null;
  status: ManagerStepStatus;
  /** Intrarea controlată a pasului: doar câmpuri pe listă albă. */
  input: Record<string, ManagerJson>;
  /** Rezumat sigur al rezultatului, fără secrete și fără prompturi interne. */
  output: Record<string, ManagerJson> | null;
  /** Sursa rezultatului: motorul ACP determinist, CRM-ul, agentul de marketing. */
  source: string | null;
  retryCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ManagerApprovalRequest = {
  stepId: string;
  tool: string;
  label: string;
  /** Payload-ul exact care va fi executat; aprobarea este legată de hash-ul lui. */
  argumentsJson: string;
  payloadHash: string;
  changes: { label: string; from: string | null; to: string }[];
  warnings: string[];
  requestedAt: string;
};

export type ManagerRunStatus = "running" | "suspended" | "completed" | "failed";

export type ManagerPlanState = {
  planId: string;
  intent: ManagerIntent;
  agents: ManagerAgent[];
  previewOnly: boolean;
  request: string;
  depth: number;
  steps: ManagerStep[];
  currentStepId: string | null;
  approval: ManagerApprovalRequest | null;
  approvalDecision: { approved: boolean; payloadHash: string; decidedAt: string } | null;
  execution: { ok: boolean; message: string; entityId: string | null } | null;
  /** Rezultatul final, în limbaj clar, cu sursele folosite. */
  summary: string | null;
  sources: string[];
  notes: string[];
  failure: string | null;
  startedAtMs: number;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/**
 * Amprenta payload-ului aprobat. Dacă payload-ul se schimbă după aprobare,
 * hash-ul nu mai corespunde și execuția este refuzată.
 */
export function payloadHash(payload: unknown): string {
  const text = stableStringify(payload);
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = (h1 ^ code) * 0x01000193;
    h2 = (h2 + code * (i + 1)) >>> 0;
  }
  const a = (h1 >>> 0).toString(16).padStart(8, "0");
  const b = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${a}${b}`;
}

function step(
  index: number,
  kind: ManagerStepKind,
  agent: ManagerAgent | "manager",
  title: string,
  tool: string | null,
  input: Record<string, ManagerJson> = {},
): ManagerStep {
  return {
    id: `s${index + 1}`,
    index,
    kind,
    agent,
    title,
    tool,
    status: "pending",
    input,
    output: null,
    source: null,
    retryCount: 0,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
  };
}

export type ManagerPlanInput = {
  planId: string;
  request: string;
  routing: ManagerRouting;
  propertyIds: string[];
  channel: string;
  contentType: string;
  tone: string;
  length: string;
  depth?: number;
};

/** Construiește planul determinist pentru o cerere rutată. */
export function buildManagerPlan(input: ManagerPlanInput): ManagerPlanState {
  const { routing } = input;
  const steps: ManagerStep[] = [];
  const push = (
    kind: ManagerStepKind,
    agent: ManagerAgent | "manager",
    title: string,
    tool: string | null,
    stepInput: Record<string, ManagerJson> = {},
  ) => {
    if (steps.length >= MANAGER_MAX_STEPS) return;
    steps.push(step(steps.length, kind, agent, title, tool, stepInput));
  };

  if (routing.intent === "unavailable") {
    push("unavailable", "manager", "Capabilitate indisponibilă", null, {
      reason: routing.unavailableReason,
    });
  } else {
    if (routing.intent === "prospecting_discovery") {
      push("prospecting_check", "prospecting", "Verificare surse de prospectare", "list_prospecting_sources");
    }
    if (routing.agents.includes("crm")) {
      if (input.propertyIds.length > 0) {
        push("crm_context", "crm", "Context proprietăți din CRM", "get_property", {
          propertyIds: input.propertyIds,
        });
      } else {
        push("crm_answer", "crm", `Analiză ${MANAGER_AGENT_LABELS.crm}`, null, {
          question: input.request,
        });
      }
    }
    if (routing.agents.includes("acp") && input.propertyIds.length > 0) {
      push("acp_read", "acp", "Rezultatul motorului ACP determinist", "get_acp", {
        propertyIds: input.propertyIds,
      });
    }
    if (routing.agents.includes("marketing") && input.propertyIds.length > 0) {
      push("marketing_generate", "marketing", "Generare texte de marketing", null, {
        propertyIds: input.propertyIds,
        channel: input.channel,
        contentType: input.contentType,
        tone: input.tone,
        length: input.length,
      });
      if (!routing.previewOnly) {
        push("propose_action", "manager", "Salvare ciornă (necesită aprobare)", "save_marketing_draft", {
          propertyIds: input.propertyIds,
        });
      }
    }
  }

  return {
    planId: input.planId,
    intent: routing.intent,
    agents: routing.agents,
    previewOnly: routing.previewOnly,
    request: input.request,
    depth: Math.min(input.depth ?? 1, MANAGER_MAX_DEPTH),
    steps,
    currentStepId: steps[0]?.id ?? null,
    approval: null,
    approvalDecision: null,
    execution: null,
    summary: null,
    sources: [],
    notes: [],
    failure: null,
    startedAtMs: Date.now(),
  };
}

function replaceStep(state: ManagerPlanState, next: ManagerStep): ManagerPlanState {
  return {
    ...state,
    steps: state.steps.map((item) => (item.id === next.id ? next : item)),
  };
}

export function findStep(state: ManagerPlanState, stepId: string): ManagerStep | null {
  return state.steps.find((item) => item.id === stepId) ?? null;
}

export function nextPendingStep(state: ManagerPlanState): ManagerStep | null {
  return state.steps.find((item) => item.status === "pending") ?? null;
}

export function startStep(state: ManagerPlanState, stepId: string): ManagerPlanState {
  const current = findStep(state, stepId);
  if (!current) return state;
  return {
    ...replaceStep(state, {
      ...current,
      status: "running",
      startedAt: new Date().toISOString(),
    }),
    currentStepId: stepId,
  };
}

export function completeStep(
  state: ManagerPlanState,
  stepId: string,
  output: Record<string, ManagerJson>,
  source: string | null,
): ManagerPlanState {
  const current = findStep(state, stepId);
  if (!current) return state;
  const next = replaceStep(state, {
    ...current,
    status: "completed",
    output,
    source,
    finishedAt: new Date().toISOString(),
  });
  return {
    ...next,
    sources: source && !next.sources.includes(source) ? [...next.sources, source] : next.sources,
  };
}

export function failStep(
  state: ManagerPlanState,
  stepId: string,
  message: string,
  kind: "failed" | "blocked" = "failed",
): ManagerPlanState {
  const current = findStep(state, stepId);
  if (!current) return state;
  return replaceStep(state, {
    ...current,
    status: kind,
    errorMessage: message,
    finishedAt: new Date().toISOString(),
  });
}

export function retryStep(state: ManagerPlanState, stepId: string): ManagerPlanState {
  const current = findStep(state, stepId);
  if (!current) return state;
  return replaceStep(state, { ...current, retryCount: current.retryCount + 1 });
}

export function skipRemainingSteps(state: ManagerPlanState, note: string): ManagerPlanState {
  return {
    ...state,
    steps: state.steps.map((item) =>
      item.status === "pending" ? { ...item, status: "skipped" } : item,
    ),
    notes: [...state.notes, note],
  };
}

/** Suspendă planul exact înainte de execuția acțiunii aprobabile. */
export function suspendForApproval(
  state: ManagerPlanState,
  request: Omit<ManagerApprovalRequest, "payloadHash" | "requestedAt"> & { payload: unknown },
): ManagerPlanState {
  const current = findStep(state, request.stepId);
  const approval: ManagerApprovalRequest = {
    stepId: request.stepId,
    tool: request.tool,
    label: request.label,
    argumentsJson: request.argumentsJson,
    payloadHash: payloadHash(request.payload),
    changes: request.changes,
    warnings: request.warnings,
    requestedAt: new Date().toISOString(),
  };
  const withStep = current
    ? replaceStep(state, { ...current, status: "awaiting_approval" })
    : state;
  return { ...withStep, approval, currentStepId: request.stepId };
}

/** Decizia umană. Fără aprobare explicită nu se execută nimic persistent. */
export function applyApproval(state: ManagerPlanState, approved: boolean): ManagerPlanState {
  if (!state.approval) return state;
  if (state.approvalDecision) return state;
  return {
    ...state,
    approvalDecision: {
      approved,
      payloadHash: state.approval.payloadHash,
      decidedAt: new Date().toISOString(),
    },
  };
}

/**
 * `true` doar când există o aprobare pozitivă pentru EXACT payload-ul curent.
 * Un payload schimbat între aprobare și execuție invalidează aprobarea.
 */
export function isApprovedForExecution(state: ManagerPlanState, payload: unknown): boolean {
  if (!state.approval || !state.approvalDecision) return false;
  if (!state.approvalDecision.approved) return false;
  if (state.approvalDecision.payloadHash !== state.approval.payloadHash) return false;
  return payloadHash(payload) === state.approval.payloadHash;
}

export function statusOfPlan(state: ManagerPlanState): ManagerRunStatus {
  if (state.failure) return "failed";
  if (state.approval && !state.approvalDecision) return "suspended";
  if (state.steps.some((item) => item.status === "failed")) {
    return state.steps.some((item) => item.status === "completed") ? "completed" : "failed";
  }
  if (state.steps.some((item) => item.status === "pending" || item.status === "running")) {
    return "running";
  }
  return "completed";
}

export function budgetExceeded(state: ManagerPlanState, nowMs = Date.now()): string | null {
  if (state.steps.length > MANAGER_MAX_STEPS) return "Planul depășește numărul maxim de pași.";
  if (state.depth > MANAGER_MAX_DEPTH) return "Planul depășește adâncimea maximă de orchestrare.";
  if (nowMs - state.startedAtMs > MANAGER_TIME_BUDGET_MS) {
    return "Planul a depășit timpul alocat. Reia-l când vrei.";
  }
  return null;
}

export function failPlan(state: ManagerPlanState, message: string): ManagerPlanState {
  return { ...state, failure: message, currentStepId: null };
}
