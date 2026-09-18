/**
 * Acțiuni CRM propuse de agent (Stage 14) — partea pură.
 *
 * Agentul poate DOAR propune. Fiecare propunere descrie exact ce se schimbă
 * (valoare actuală → valoare nouă), pe ce entitate și de ce. Execuția are loc
 * numai după aprobare umană explicită, în `tools.server.ts`.
 *
 * În Stage 14 nu există acțiuni de comunicare (email, WhatsApp, SMS, apel,
 * publicare): lista de mai jos este completă și închisă.
 */
import { z } from "zod";
import { argumentsFingerprint } from "../../security/approval";

export const CRM_ACTION_TOOLS = [
  "create_task",
  "create_note",
  "update_lead_status",
  "assign_lead",
  "create_property_match",
  "create_client_property_match",
  "generate_property_description",
  "generate_offer_draft",
] as const;

export type CrmActionTool = (typeof CRM_ACTION_TOOLS)[number];

export type CrmActionChange = {
  field: string;
  label: string;
  from: string | null;
  to: string;
};

export type CrmActionProposal = {
  tool: CrmActionTool;
  /** Parametrii serializați, ca propunerea să rămână urmăribilă în audit. */
  argumentsJson: string;
  /** Amprenta argumentelor la suspendare, verificată la aprobare. */
  argumentsHash?: string;
  entity: { type: "lead" | "contact" | "property" | "request"; id: string; label: string };
  changes: CrmActionChange[];
  reason: string;
  /** Cine devine responsabil, dacă acțiunea o precizează. */
  assigneeLabel: string | null;
  /** Termenul acțiunii, dacă există (ISO). */
  dueAt: string | null;
  /**
   * Starea citită în momentul propunerii. La aprobare se citește din nou: dacă
   * s-a schimbat între timp, acțiunea este BLOCATĂ, nu suprascrie.
   */
  precondition?: { field: string; label: string; value: string | null } | null;
  /** `draft` = produce text (ciornă); `write` = scriere reversibilă. */
  risk?: "draft" | "write";
  /** Efecte secundare și avertismente afișate utilizatorului. */
  warnings?: string[];
};

const LEAD_STAGES = [
  "new",
  "contacted",
  "qualified",
  "viewing",
  "offer",
  "negotiation",
  "transaction",
  "won",
  "lost",
] as const;

const uuid = z.string().uuid();

export const CRM_TASK_PRIORITIES = ["low", "normal", "high"] as const;

export const CRM_ACTION_SCHEMAS: Record<CrmActionTool, z.ZodTypeAny> = {
  create_task: z.object({
    leadId: uuid.nullable().optional(),
    contactId: uuid.nullable().optional(),
    propertyId: uuid.nullable().optional(),
    assigneeId: uuid.nullable().optional(),
    title: z.string().min(3).max(160),
    dueAt: z.string().min(8).max(40),
    priority: z.enum(CRM_TASK_PRIORITIES).nullable().optional(),
    description: z.string().max(1000).nullable().optional(),
  }),
  create_note: z.object({
    leadId: uuid.nullable().optional(),
    contactId: uuid.nullable().optional(),
    propertyId: uuid.nullable().optional(),
    title: z.string().min(3).max(160),
    body: z.string().min(1).max(2000),
  }),
  update_lead_status: z.object({
    leadId: uuid,
    stage: z.enum(LEAD_STAGES),
    /** Etapa citită la momentul propunerii; protejează împotriva stării învechite. */
    expectedStage: z.enum(LEAD_STAGES).nullable().optional(),
    reason: z.string().max(400).nullable().optional(),
  }),
  assign_lead: z.object({
    leadId: uuid,
    assigneeId: uuid,
    reason: z.string().max(400).nullable().optional(),
  }),
  create_property_match: z.object({
    requestId: uuid,
    propertyId: uuid,
    note: z.string().max(600).nullable().optional(),
  }),
  create_client_property_match: z.object({
    contactId: uuid,
    propertyId: uuid,
    reason: z.string().max(600).nullable().optional(),
  }),
  generate_property_description: z.object({
    propertyId: uuid,
    draft: z.string().min(40).max(4000),
    title: z.string().min(3).max(160).nullable().optional(),
  }),
  generate_offer_draft: z.object({
    propertyId: uuid,
    contactId: uuid.nullable().optional(),
    draft: z.string().min(40).max(4000),
    title: z.string().min(3).max(160).nullable().optional(),
  }),
};

/** Ciornele nu suprascriu nimic publicat: se salvează ca text separat. */
export const CRM_DRAFT_ACTIONS: readonly CrmActionTool[] = [
  "generate_property_description",
  "generate_offer_draft",
];

export function isCrmDraftAction(tool: CrmActionTool): boolean {
  return CRM_DRAFT_ACTIONS.includes(tool);
}

export function isCrmActionTool(name: string): name is CrmActionTool {
  return (CRM_ACTION_TOOLS as readonly string[]).includes(name);
}

/** Etapele finale nu se redeschid prin agent: tranziția este blocată. */
const TERMINAL_STAGES = new Set<string>(["won", "lost"]);

export function isAllowedLeadTransition(from: string, to: string): boolean {
  if (!(LEAD_STAGES as readonly string[]).includes(to)) return false;
  if (from === to) return false;
  if (TERMINAL_STAGES.has(from)) return false;
  return true;
}

/**
 * Validează parametrii unei acțiuni. Fără date valide nu există propunere:
 * modelul nu poate strecura câmpuri necunoscute sau entități lipsă.
 */
export function validateCrmAction(
  tool: string,
  args: unknown,
): { ok: true; tool: CrmActionTool; data: Record<string, unknown> } | { ok: false; message: string } {
  if (!isCrmActionTool(tool)) {
    return { ok: false, message: "Acțiunea cerută nu există." };
  }
  const parsed = CRM_ACTION_SCHEMAS[tool].safeParse(args ?? {});
  if (!parsed.success) {
    return { ok: false, message: "Datele acțiunii propuse sunt incomplete sau invalide." };
  }
  const data = parsed.data as Record<string, unknown>;
  if (tool === "create_task" || tool === "create_note") {
    if (!data["leadId"] && !data["contactId"] && !data["propertyId"]) {
      return { ok: false, message: "Acțiunea trebuie legată de un lead, client sau proprietate." };
    }
  }
  if (tool === "create_task") {
    const due = Date.parse(String(data["dueAt"]));
    if (!Number.isFinite(due)) {
      return { ok: false, message: "Termenul propus nu este o dată validă." };
    }
  }
  if (tool === "update_lead_status" && typeof data["expectedStage"] === "string") {
    if (!isAllowedLeadTransition(String(data["expectedStage"]), String(data["stage"]))) {
      return { ok: false, message: "Tranziția de etapă cerută nu este permisă." };
    }
  }
  return { ok: true, tool, data };
}

/**
 * Cheia de idempotență: aceeași propunere aprobată de două ori nu poate crea
 * două rânduri. Include ziua pentru activități, ca un follow-up pentru mâine să
 * rămână unul singur chiar dacă butonul este apăsat de mai multe ori.
 */
export function crmActionIdempotencyKey(
  organizationId: string,
  proposal: Pick<CrmActionProposal, "tool" | "argumentsJson">,
): string {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(proposal.argumentsJson) as Record<string, unknown>;
  } catch {
    args = {};
  }
  const day = typeof args["dueAt"] === "string" ? String(args["dueAt"]).slice(0, 10) : "";
  const parts = [
    organizationId,
    proposal.tool,
    String(args["leadId"] ?? ""),
    String(args["contactId"] ?? ""),
    String(args["propertyId"] ?? ""),
    String(args["requestId"] ?? ""),
    String(args["stage"] ?? ""),
    String(args["assigneeId"] ?? ""),
    String(args["title"] ?? ""),
    day,
  ];
  return parts.join("|");
}

export const CRM_ACTION_LABELS: Record<CrmActionTool, string> = {
  create_task: "Creare activitate (task)",
  create_note: "Adăugare notă",
  update_lead_status: "Schimbare etapă lead",
  assign_lead: "Alocare lead",
  create_property_match: "Înregistrare potrivire cerere ↔ proprietate",
  create_client_property_match: "Înregistrare potrivire client ↔ proprietate",
  generate_property_description: "Ciornă de descriere pentru proprietate",
  generate_offer_draft: "Ciornă de ofertă",
};

export const LEAD_STAGE_LABELS: Record<string, string> = {
  new: "Nou",
  contacted: "Contactat",
  qualified: "Calificat",
  viewing: "Vizionare",
  offer: "Ofertă",
  negotiation: "Negociere",
  transaction: "Tranzacție",
  won: "Câștigat",
  lost: "Pierdut",
};

/** Construiește propunerea afișată utilizatorului la aprobare. */
export function buildCrmProposal(input: {
  tool: CrmActionTool;
  args: Record<string, unknown>;
  entity: CrmActionProposal["entity"];
  changes: CrmActionChange[];
  reason: string;
  assigneeLabel?: string | null;
  dueAt?: string | null;
  precondition?: CrmActionProposal["precondition"];
  warnings?: string[];
}): CrmActionProposal {
  const argumentsJson = JSON.stringify(input.args);
  return {
    tool: input.tool,
    argumentsJson,
    argumentsHash: argumentsFingerprint(argumentsJson),
    entity: input.entity,
    changes: input.changes,
    reason: input.reason,
    assigneeLabel: input.assigneeLabel ?? null,
    dueAt: input.dueAt ?? null,
    precondition: input.precondition ?? null,
    risk: isCrmDraftAction(input.tool) ? "draft" : "write",
    warnings: input.warnings ?? [],
  };
}
