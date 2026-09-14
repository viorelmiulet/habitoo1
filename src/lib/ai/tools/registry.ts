/**
 * Registry-ul de tool-uri Habitoo (Stage 11A — doar citire).
 *
 * Fiecare tool declară: capabilitatea necesară, schema Zod de validare și
 * schema JSON trimisă providerului. Tool-urile distructive nu există în
 * registry, deci modelul nu le poate cere nici măcar prin nume.
 */
import { z } from "zod";
import type { AiCapability } from "../security/permissions";
import type { AiToolDeclaration } from "../providers/types";
import { CRM_ACTION_SCHEMAS } from "../agents/crm/actions";

const uuid = z.string().uuid("Identificator invalid.");

const searchLimit = z.number().int().min(1).max(20).optional();

export type AiToolName =
  | "search_prospects"
  | "get_prospect"
  | "get_prospecting_run"
  | "list_prospecting_sources"
  | "preview_source"
  | "get_prospect_duplicates"
  | "score_prospect"
  | "create_prospect"
  | "approve_prospect"
  | "reject_prospect"
  | "import_prospect_to_crm"
  | "link_prospect_to_existing_contact"
  | "search_properties"
  | "get_property"
  | "search_clients"
  | "get_client"
  | "search_leads"
  | "get_lead"
  | "get_acp"
  | "get_acp_history"
  | "get_acp_report"
  | "get_comparables"
  | "search_crm_properties"
  | "search_crm_contacts"
  | "search_crm_leads"
  | "search_crm_requests"
  | "get_crm_contact"
  | "get_crm_lead"
  | "get_crm_property"
  | "get_crm_activity_history"
  | "match_client_to_properties"
  | "get_crm_priorities"
  | "create_task"
  | "create_note"
  | "update_lead_status"
  | "assign_lead"
  | "create_property_match"
  | "create_client_property_match"
  | "generate_property_description"
  | "generate_offer_draft";

export type AiToolDefinition = {
  name: AiToolName;
  description: string;
  capability: AiCapability;
  /** Categoria de context pe care o alimentează rezultatul. */
  category: "property" | "client" | "lead" | "acp" | "prospect" | "crm";
  /**
   * `read` = citire pură; `action` = modifică date CRM și cere OBLIGATORIU
   * aprobare umană explicită înainte de execuție.
   */
  kind: "read" | "action";
  schema: z.ZodTypeAny;
  parameters: Record<string, unknown>;
};

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required };
}

export const AI_TOOLS: readonly AiToolDefinition[] = [
  {
    name: "search_properties",
    description:
      "Caută proprietăți din portofoliul agenției după text, oraș, tip, tranzacție sau interval de preț.",
    capability: "read:properties",
    category: "property",
    kind: "read",
    schema: z.object({
      query: z.string().max(120).optional(),
      city: z.string().max(80).optional(),
      propertyType: z.string().max(40).optional(),
      transaction: z.enum(["sale", "rent"]).optional(),
      minPrice: z.number().nonnegative().optional(),
      maxPrice: z.number().nonnegative().optional(),
      limit: searchLimit,
    }),
    parameters: objectSchema({
      query: { type: "string", description: "Text liber: titlu, referință, adresă" },
      city: { type: "string" },
      propertyType: { type: "string" },
      transaction: { type: "string", enum: ["sale", "rent"] },
      minPrice: { type: "number" },
      maxPrice: { type: "number" },
      limit: { type: "integer", description: "Maximum 20" },
    }),
  },
  {
    name: "get_property",
    description: "Returnează detaliile unei proprietăți din agenție, după ID.",
    capability: "read:properties",
    category: "property",
    kind: "read",
    schema: z.object({ propertyId: uuid }),
    parameters: objectSchema({ propertyId: { type: "string" } }, ["propertyId"]),
  },
  {
    name: "search_clients",
    description: "Caută clienți/contacte ale agenției după nume, email, telefon sau tip.",
    capability: "read:contacts",
    category: "client",
    kind: "read",
    schema: z.object({
      query: z.string().max(120).optional(),
      type: z.string().max(40).optional(),
      limit: searchLimit,
    }),
    parameters: objectSchema({
      query: { type: "string" },
      type: { type: "string" },
      limit: { type: "integer" },
    }),
  },
  {
    name: "get_client",
    description: "Returnează detaliile unui client/contact al agenției, după ID.",
    capability: "read:contacts",
    category: "client",
    kind: "read",
    schema: z.object({ clientId: uuid }),
    parameters: objectSchema({ clientId: { type: "string" } }, ["clientId"]),
  },
  {
    name: "search_leads",
    description: "Caută leaduri ale agenției după text, etapă sau sursă.",
    capability: "read:leads",
    category: "lead",
    kind: "read",
    schema: z.object({
      query: z.string().max(120).optional(),
      stage: z.string().max(40).optional(),
      limit: searchLimit,
    }),
    parameters: objectSchema({
      query: { type: "string" },
      stage: { type: "string" },
      limit: { type: "integer" },
    }),
  },
  {
    name: "get_lead",
    description: "Returnează detaliile unui lead al agenției, după ID.",
    capability: "read:leads",
    category: "lead",
    kind: "read",
    schema: z.object({ leadId: uuid }),
    parameters: objectSchema({ leadId: { type: "string" } }, ["leadId"]),
  },
  {
    name: "get_acp",
    description:
      "Returnează cea mai recentă analiză comparativă de piață (ACP) finalizată a unei proprietăți.",
    capability: "read:acp",
    category: "acp",
    kind: "read",
    schema: z.object({ propertyId: uuid }),
    parameters: objectSchema({ propertyId: { type: "string" } }, ["propertyId"]),
  },
  {
    name: "get_acp_history",
    description: "Returnează istoricul versiunilor ACP ale unei proprietăți.",
    capability: "read:acp",
    category: "acp",
    kind: "read",
    schema: z.object({ propertyId: uuid, limit: searchLimit }),
    parameters: objectSchema({ propertyId: { type: "string" }, limit: { type: "integer" } }, [
      "propertyId",
    ]),
  },
  {
    name: "get_acp_report",
    description:
      "Returnează metadatele rapoartelor PDF ale unei analize ACP (versiune, dată, stare). Nu returnează fișierul.",
    capability: "read:acp",
    category: "acp",
    kind: "read",
    schema: z.object({ analysisId: uuid, limit: searchLimit }),
    parameters: objectSchema({ analysisId: { type: "string" }, limit: { type: "integer" } }, [
      "analysisId",
    ]),
  },
  {
    name: "get_comparables",
    description:
      "Returnează comparabilele selectate ale unei analize ACP, cu scor de similaritate și preț ajustat.",
    capability: "read:acp",
    category: "acp",
    kind: "read",
    schema: z.object({ analysisId: uuid, limit: searchLimit }),
    parameters: objectSchema({ analysisId: { type: "string" }, limit: { type: "integer" } }, [
      "analysisId",
    ]),
  },
  /* --------------------- Prospecting: tool-uri de CITIRE -------------------- */
  {
    name: "search_prospects",
    description:
      "Caută oportunități (prospecte) descoperite de agent, după text, oraș, tip vânzător, status sau scor minim.",
    capability: "read:prospecting",
    category: "prospect",
    kind: "read",
    schema: z.object({
      query: z.string().max(120).optional(),
      city: z.string().max(80).optional(),
      sellerType: z.enum(["unknown", "private", "agency", "developer"]).optional(),
      status: z
        .enum(["new", "reviewed", "approved", "imported", "rejected", "duplicate", "expired", "error"])
        .optional(),
      minScore: z.number().min(0).max(100).optional(),
      limit: searchLimit,
    }),
    parameters: objectSchema({
      query: { type: "string" },
      city: { type: "string" },
      sellerType: { type: "string", enum: ["unknown", "private", "agency", "developer"] },
      status: { type: "string" },
      minScore: { type: "number" },
      limit: { type: "integer" },
    }),
  },
  {
    name: "get_prospect",
    description: "Returnează detaliile unei oportunități din agenție, după ID.",
    capability: "read:prospecting",
    category: "prospect",
    kind: "read",
    schema: z.object({ prospectId: uuid }),
    parameters: objectSchema({ prospectId: { type: "string" } }, ["prospectId"]),
  },
  {
    name: "get_prospecting_run",
    description: "Returnează starea și contoarele unei rulări de prospectare.",
    capability: "read:prospecting",
    category: "prospect",
    kind: "read",
    schema: z.object({ runId: uuid }),
    parameters: objectSchema({ runId: { type: "string" } }, ["runId"]),
  },
  {
    name: "list_prospecting_sources",
    description: "Listează sursele de prospectare disponibile agenției și starea lor.",
    capability: "read:prospecting",
    category: "prospect",
    kind: "read",
    schema: z.object({ limit: searchLimit }),
    parameters: objectSchema({ limit: { type: "integer" } }),
  },
  {
    name: "preview_source",
    description:
      "Verifică starea unei surse (health check) fără să colecteze date, pentru diagnostic.",
    capability: "read:prospecting",
    category: "prospect",
    kind: "read",
    schema: z.object({ sourceId: uuid }),
    parameters: objectSchema({ sourceId: { type: "string" } }, ["sourceId"]),
  },
  {
    name: "get_prospect_duplicates",
    description: "Returnează oportunitățile din același grup de duplicate.",
    capability: "read:prospecting",
    category: "prospect",
    kind: "read",
    schema: z.object({ prospectId: uuid }),
    parameters: objectSchema({ prospectId: { type: "string" } }, ["prospectId"]),
  },
  {
    name: "score_prospect",
    description:
      "Returnează scorul determinist de oportunitate și explicația lui, exact cum a fost calculat.",
    capability: "read:prospecting",
    category: "prospect",
    kind: "read",
    schema: z.object({ prospectId: uuid }),
    parameters: objectSchema({ prospectId: { type: "string" } }, ["prospectId"]),
  },
  /* ------- Prospecting: tool-uri de ACȚIUNE (numai cu aprobare umană) ------- */
  {
    name: "create_prospect",
    description:
      "Creează manual o oportunitate în agenție. Necesită aprobare umană explicită.",
    capability: "write:prospecting",
    category: "prospect",
    kind: "action",
    schema: z.object({
      title: z.string().min(3).max(240),
      sourceUrl: z.string().url().max(500).optional(),
      city: z.string().max(80).optional(),
      price: z.number().positive().optional(),
      rooms: z.number().int().min(1).max(30).optional(),
      surfaceUseful: z.number().positive().optional(),
      sellerPhone: z.string().max(30).optional(),
      description: z.string().max(4000).optional(),
    }),
    parameters: objectSchema(
      {
        title: { type: "string" },
        sourceUrl: { type: "string" },
        city: { type: "string" },
        price: { type: "number" },
        rooms: { type: "integer" },
        surfaceUseful: { type: "number" },
        sellerPhone: { type: "string" },
        description: { type: "string" },
      },
      ["title"],
    ),
  },
  {
    name: "approve_prospect",
    description: "Marchează o oportunitate ca aprobată. Necesită aprobare umană explicită.",
    capability: "write:prospecting",
    category: "prospect",
    kind: "action",
    schema: z.object({ prospectId: uuid, notes: z.string().max(500).optional() }),
    parameters: objectSchema({ prospectId: { type: "string" }, notes: { type: "string" } }, [
      "prospectId",
    ]),
  },
  {
    name: "reject_prospect",
    description: "Marchează o oportunitate ca respinsă. Necesită aprobare umană explicită.",
    capability: "write:prospecting",
    category: "prospect",
    kind: "action",
    schema: z.object({ prospectId: uuid, notes: z.string().max(500).optional() }),
    parameters: objectSchema({ prospectId: { type: "string" }, notes: { type: "string" } }, [
      "prospectId",
    ]),
  },
  {
    name: "import_prospect_to_crm",
    description:
      "Importă o oportunitate aprobată în CRM (contact + lead), idempotent. Necesită aprobare umană explicită.",
    capability: "write:prospecting",
    category: "prospect",
    kind: "action",
    schema: z.object({ prospectId: uuid }),
    parameters: objectSchema({ prospectId: { type: "string" } }, ["prospectId"]),
  },
  {
    name: "link_prospect_to_existing_contact",
    description:
      "Asociază o oportunitate aprobată unui contact existent, fără a crea un duplicat. Necesită aprobare umană explicită.",
    capability: "write:prospecting",
    category: "prospect",
    kind: "action",
    schema: z.object({ prospectId: uuid, contactId: uuid }),
    parameters: objectSchema({ prospectId: { type: "string" }, contactId: { type: "string" } }, [
      "prospectId",
      "contactId",
    ]),
  },
  /* ------------------- CRM Agent (Stage 14): tool-uri de CITIRE ------------------- */
  {
    name: "search_crm_properties",
    description:
      "Caută proprietăți în CRM cu filtre CRM: text, oraș, tip, tranzacție, camere, preț, status și proprietăți adăugate recent.",
    capability: "read:properties",
    category: "crm",
    kind: "read",
    schema: z.object({
      query: z.string().max(120).optional(),
      city: z.string().max(80).optional(),
      propertyType: z.string().max(40).optional(),
      transaction: z.enum(["sale", "rent"]).optional(),
      status: z.string().max(30).optional(),
      roomsMin: z.number().int().min(1).max(30).optional(),
      roomsMax: z.number().int().min(1).max(30).optional(),
      minPrice: z.number().nonnegative().optional(),
      maxPrice: z.number().nonnegative().optional(),
      createdWithinDays: z.number().int().min(1).max(365).optional(),
      limit: searchLimit,
    }),
    parameters: objectSchema({
      query: { type: "string" },
      city: { type: "string" },
      propertyType: { type: "string" },
      transaction: { type: "string", enum: ["sale", "rent"] },
      status: { type: "string" },
      roomsMin: { type: "integer" },
      roomsMax: { type: "integer" },
      minPrice: { type: "number" },
      maxPrice: { type: "number" },
      createdWithinDays: { type: "integer" },
      limit: { type: "integer" },
    }),
  },
  {
    name: "search_crm_contacts",
    description:
      "Caută clienți în CRM după text, tip, status, responsabil sau clienți cu cereri active.",
    capability: "read:contacts",
    category: "crm",
    kind: "read",
    schema: z.object({
      query: z.string().max(120).optional(),
      type: z.string().max(40).optional(),
      status: z.string().max(40).optional(),
      assignedToMe: z.boolean().optional(),
      withActiveRequests: z.boolean().optional(),
      limit: searchLimit,
    }),
    parameters: objectSchema({
      query: { type: "string" },
      type: { type: "string" },
      status: { type: "string" },
      assignedToMe: { type: "boolean" },
      withActiveRequests: { type: "boolean" },
      limit: { type: "integer" },
    }),
  },
  {
    name: "search_crm_leads",
    description:
      "Caută leaduri în CRM după text, etapă, sursă (inclusiv „prospecting”), responsabil, zile fără activitate sau lipsa follow-up-ului.",
    capability: "read:leads",
    category: "crm",
    kind: "read",
    schema: z.object({
      query: z.string().max(120).optional(),
      stage: z.string().max(40).optional(),
      source: z.string().max(40).optional(),
      assignedToMe: z.boolean().optional(),
      noActivityDays: z.number().int().min(1).max(365).optional(),
      withoutFollowup: z.boolean().optional(),
      createdWithinDays: z.number().int().min(1).max(365).optional(),
      openOnly: z.boolean().optional(),
      limit: searchLimit,
    }),
    parameters: objectSchema({
      query: { type: "string" },
      stage: { type: "string" },
      source: { type: "string", description: "Ex.: prospecting, site, portal" },
      assignedToMe: { type: "boolean" },
      noActivityDays: { type: "integer" },
      withoutFollowup: { type: "boolean" },
      createdWithinDays: { type: "integer" },
      openOnly: { type: "boolean" },
      limit: { type: "integer" },
    }),
  },
  {
    name: "search_crm_requests",
    description:
      "Caută cereri ale clienților (ce caută clientul) după text, tip, oraș, camere, buget sau status.",
    capability: "read:requests",
    category: "crm",
    kind: "read",
    schema: z.object({
      query: z.string().max(120).optional(),
      kind: z.enum(["buy", "rent", "invest"]).optional(),
      city: z.string().max(80).optional(),
      contactId: uuid.optional(),
      roomsMin: z.number().int().min(1).max(30).optional(),
      maxBudget: z.number().nonnegative().optional(),
      status: z.string().max(30).optional(),
      limit: searchLimit,
    }),
    parameters: objectSchema({
      query: { type: "string" },
      kind: { type: "string", enum: ["buy", "rent", "invest"] },
      city: { type: "string" },
      contactId: { type: "string" },
      roomsMin: { type: "integer" },
      maxBudget: { type: "number" },
      status: { type: "string" },
      limit: { type: "integer" },
    }),
  },
  {
    name: "get_crm_contact",
    description:
      "Returnează un client cu cererile lui active și leadurile asociate, din agenția utilizatorului.",
    capability: "read:contacts",
    category: "crm",
    kind: "read",
    schema: z.object({ contactId: uuid }),
    parameters: objectSchema({ contactId: { type: "string" } }, ["contactId"]),
  },
  {
    name: "get_crm_lead",
    description:
      "Returnează un lead cu etapa, responsabilul, ultima interacțiune, follow-up-ul planificat și scorul de prioritate calculat determinist.",
    capability: "read:leads",
    category: "crm",
    kind: "read",
    schema: z.object({ leadId: uuid }),
    parameters: objectSchema({ leadId: { type: "string" } }, ["leadId"]),
  },
  {
    name: "get_crm_property",
    description: "Returnează o proprietate cu datele relevante pentru discuția cu clientul.",
    capability: "read:properties",
    category: "crm",
    kind: "read",
    schema: z.object({ propertyId: uuid }),
    parameters: objectSchema({ propertyId: { type: "string" } }, ["propertyId"]),
  },
  {
    name: "get_crm_activity_history",
    description:
      "Returnează istoricul de activități (apeluri, întâlniri, vizionări, taskuri, note) pentru un lead, client sau proprietate.",
    capability: "read:activities",
    category: "crm",
    kind: "read",
    schema: z.object({
      leadId: uuid.optional(),
      contactId: uuid.optional(),
      propertyId: uuid.optional(),
      limit: searchLimit,
    }),
    parameters: objectSchema({
      leadId: { type: "string" },
      contactId: { type: "string" },
      propertyId: { type: "string" },
      limit: { type: "integer" },
    }),
  },
  {
    name: "match_client_to_properties",
    description:
      "Calculează potrivirile dintre cererea unui client și proprietățile agenției, cu scor determinist, criterii îndeplinite și criterii lipsă.",
    capability: "read:properties",
    category: "crm",
    kind: "read",
    schema: z.object({
      contactId: uuid.optional(),
      requestId: uuid.optional(),
      minScore: z.number().min(0).max(100).optional(),
      limit: searchLimit,
    }),
    parameters: objectSchema({
      contactId: { type: "string" },
      requestId: { type: "string" },
      minScore: { type: "number" },
      limit: { type: "integer" },
    }),
  },
  {
    name: "get_crm_priorities",
    description:
      "Returnează leadurile prioritare, cele fără follow-up și cele stagnante, cu scor de prioritate explicabil (calculat determinist de Habitoo).",
    capability: "read:leads",
    category: "crm",
    kind: "read",
    schema: z.object({
      focus: z.enum(["priority", "without_followup", "stagnant"]).optional(),
      days: z.number().int().min(1).max(365).optional(),
      assignedToMe: z.boolean().optional(),
      limit: searchLimit,
    }),
    parameters: objectSchema({
      focus: { type: "string", enum: ["priority", "without_followup", "stagnant"] },
      days: { type: "integer" },
      assignedToMe: { type: "boolean" },
      limit: { type: "integer" },
    }),
  },
  /* ---------- CRM Agent: tool-uri de ACȚIUNE (numai cu aprobare umană) ---------- */
  {
    name: "create_task",
    description:
      "Propune o activitate (task/follow-up) legată de un lead, client sau proprietate. Necesită aprobare umană explicită.",
    capability: "write:crm",
    category: "crm",
    kind: "action",
    schema: CRM_ACTION_SCHEMAS.create_task,
    parameters: objectSchema(
      {
        leadId: { type: "string" },
        contactId: { type: "string" },
        propertyId: { type: "string" },
        assigneeId: { type: "string" },
        title: { type: "string" },
        dueAt: { type: "string", description: "Data și ora în format ISO" },
        priority: { type: "string", enum: ["low", "normal", "high"] },
        description: { type: "string" },
      },
      ["title", "dueAt"],
    ),
  },
  {
    name: "create_note",
    description:
      "Propune o notă în istoricul unui lead, client sau proprietate. Necesită aprobare umană explicită.",
    capability: "write:crm",
    category: "crm",
    kind: "action",
    schema: CRM_ACTION_SCHEMAS.create_note,
    parameters: objectSchema(
      {
        leadId: { type: "string" },
        contactId: { type: "string" },
        propertyId: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
      },
      ["title", "body"],
    ),
  },
  {
    name: "update_lead_status",
    description:
      "Propune schimbarea etapei unui lead, cu motiv. Necesită aprobare umană explicită.",
    capability: "write:crm",
    category: "crm",
    kind: "action",
    schema: CRM_ACTION_SCHEMAS.update_lead_status,
    parameters: objectSchema(
      {
        leadId: { type: "string" },
        stage: { type: "string" },
        reason: { type: "string" },
      },
      ["leadId", "stage"],
    ),
  },
  {
    name: "assign_lead",
    description:
      "Propune alocarea unui lead către un membru al agenției. Necesită aprobare umană explicită.",
    capability: "write:crm",
    category: "crm",
    kind: "action",
    schema: CRM_ACTION_SCHEMAS.assign_lead,
    parameters: objectSchema(
      { leadId: { type: "string" }, assigneeId: { type: "string" }, reason: { type: "string" } },
      ["leadId", "assigneeId"],
    ),
  },
  {
    name: "create_property_match",
    description:
      "Propune înregistrarea unei potriviri între cererea unui client și o proprietate, ca activitate de urmărire. Necesită aprobare umană explicită.",
    capability: "write:crm",
    category: "crm",
    kind: "action",
    schema: CRM_ACTION_SCHEMAS.create_property_match,
    parameters: objectSchema(
      { requestId: { type: "string" }, propertyId: { type: "string" }, note: { type: "string" } },
      ["requestId", "propertyId"],
    ),
  },
  {
    name: "create_client_property_match",
    description:
      "Propune înregistrarea unei potriviri între un client și o proprietate, cu motiv. Nu creează o potrivire duplicată. Necesită aprobare umană explicită.",
    capability: "write:crm",
    category: "crm",
    kind: "action",
    schema: CRM_ACTION_SCHEMAS.create_client_property_match,
    parameters: objectSchema(
      { contactId: { type: "string" }, propertyId: { type: "string" }, reason: { type: "string" } },
      ["contactId", "propertyId"],
    ),
  },
  {
    name: "generate_property_description",
    description:
      "Propune o CIORNĂ de descriere pentru o proprietate, scrisă doar din câmpurile proprietății. Nu înlocuiește descrierea publicată și nu publică nimic. Necesită aprobare umană explicită.",
    capability: "write:crm",
    category: "crm",
    kind: "action",
    schema: CRM_ACTION_SCHEMAS.generate_property_description,
    parameters: objectSchema(
      {
        propertyId: { type: "string" },
        draft: { type: "string", description: "Textul ciornei, în română" },
        title: { type: "string" },
      },
      ["propertyId", "draft"],
    ),
  },
  {
    name: "generate_offer_draft",
    description:
      "Propune o CIORNĂ de ofertă/anunț pentru o proprietate, opțional pentru un client. Nu publică pe portaluri și nu modifică valorile ACP. Necesită aprobare umană explicită.",
    capability: "write:crm",
    category: "crm",
    kind: "action",
    schema: CRM_ACTION_SCHEMAS.generate_offer_draft,
    parameters: objectSchema(
      {
        propertyId: { type: "string" },
        contactId: { type: "string" },
        draft: { type: "string", description: "Textul ciornei, în română" },
        title: { type: "string" },
      },
      ["propertyId", "draft"],
    ),
  },
] as const;


const BY_NAME = new Map<string, AiToolDefinition>(AI_TOOLS.map((tool) => [tool.name, tool]));

export function findAiTool(name: string): AiToolDefinition | null {
  return BY_NAME.get(name) ?? null;
}

/** Capabilitatea necesară pentru un tool, sau `null` dacă tool-ul nu există. */
export function aiToolCapability(name: string): AiCapability | null {
  return BY_NAME.get(name)?.capability ?? null;
}

export function isAiActionTool(name: string): boolean {
  return BY_NAME.get(name)?.kind === "action";
}

/**
 * Declarațiile trimise providerului. Implicit doar tool-urile de citire:
 * acțiunile intră în conversație numai când fluxul cere explicit aprobare.
 */
export function aiToolDeclarations(includeActions = false): AiToolDeclaration[] {
  return AI_TOOLS.filter((tool) => includeActions || tool.kind === "read").map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

/** Tool-uri interzise în această etapă: prezența lor în registry ar fi un bug. */
export const AI_FORBIDDEN_TOOL_NAMES = [
  "send_email",
  "send_whatsapp",
  "publish_portal",
  "delete_property",
  "change_price",
  "create_contract",
] as const;
