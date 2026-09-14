/**
 * Politica centrală de acțiuni AI (Stage 12).
 *
 * Sursa unică de adevăr pentru „ce poate executa AI-ul”. Modelul poate CERE
 * orice; execuția se face numai dacă tool-ul apare aici într-o categorie
 * activată. Categoriile:
 *
 *   READ             — citiri pure, fără aprobare.
 *   DRAFT            — generează text (ciornă), nu suprascrie date publicate.
 *   REVERSIBLE_WRITE — scriere reversibilă, DOAR cu aprobare umană explicită.
 *   HIGH_RISK        — dezactivat permanent în această etapă (ștergeri,
 *                      modificări de preț, semnare contracte, publicare pe
 *                      portaluri, trimitere email/WhatsApp/SMS, apeluri).
 */
export const AI_ACTION_CATEGORIES = ["READ", "DRAFT", "REVERSIBLE_WRITE", "HIGH_RISK"] as const;

export type AiActionCategory = (typeof AI_ACTION_CATEGORIES)[number];

/** Acțiunile reversibile activate explicit în Stage 12. */
export const ENABLED_REVERSIBLE_ACTIONS = [
  "create_task",
  "create_note",
  "update_lead_status",
  "create_client_property_match",
  "assign_lead",
  "create_property_match",
  "create_prospect",
  "approve_prospect",
  "reject_prospect",
  "import_prospect_to_crm",
  "link_prospect_to_existing_contact",
] as const;

/** Acțiunile de tip ciornă: produc text, nu modifică date publicate. */
export const ENABLED_DRAFT_ACTIONS = [
  "generate_property_description",
  "generate_offer_draft",
] as const;

/**
 * Acțiuni interzise. Nu există în registry, deci modelul nu le poate cere nici
 * pe nume; lista rămâne aici ca barieră explicită și testabilă.
 */
export const HIGH_RISK_ACTIONS = [
  "delete_property",
  "delete_contact",
  "delete_lead",
  "bulk_delete",
  "update_property_price",
  "update_acp_valuation",
  "sign_contract",
  "publish_to_portal",
  "withdraw_from_portal",
  "send_email",
  "send_whatsapp",
  "send_sms",
  "call_owner",
] as const;

const REVERSIBLE = new Set<string>(ENABLED_REVERSIBLE_ACTIONS);
const DRAFT = new Set<string>(ENABLED_DRAFT_ACTIONS);
const HIGH_RISK = new Set<string>(HIGH_RISK_ACTIONS);

/** Categoria unui tool: `null` dacă nu este cunoscut ca acțiune. */
export function actionCategory(tool: string, kind: "read" | "action" = "action"): AiActionCategory | null {
  if (HIGH_RISK.has(tool)) return "HIGH_RISK";
  if (DRAFT.has(tool)) return "DRAFT";
  if (REVERSIBLE.has(tool)) return "REVERSIBLE_WRITE";
  if (kind === "read") return "READ";
  return null;
}

export type AiActionPolicyDecision =
  | { allowed: true; category: Exclude<AiActionCategory, "HIGH_RISK">; requiresApproval: boolean }
  | { allowed: false; category: AiActionCategory | null; message: string };

/**
 * Verificarea de politică, apelată înainte de orice execuție de acțiune.
 * O acțiune necunoscută sau cu risc înalt nu se execută niciodată.
 */
export function checkActionPolicy(
  tool: string,
  kind: "read" | "action" = "action",
): AiActionPolicyDecision {
  const category = actionCategory(tool, kind);
  if (category === "HIGH_RISK") {
    return {
      allowed: false,
      category,
      message: "Această operațiune nu este disponibilă în Habitoo AI.",
    };
  }
  if (category === null) {
    return { allowed: false, category: null, message: "Acțiunea cerută nu există." };
  }
  return {
    allowed: true,
    category,
    // Ciornele și scrierile reversibile se persistă numai după aprobare.
    requiresApproval: category !== "READ",
  };
}

/** `true` doar pentru acțiunile pe care Habitoo le poate executa acum. */
export function isExecutableAction(tool: string): boolean {
  const decision = checkActionPolicy(tool);
  return decision.allowed && decision.category !== "READ";
}
