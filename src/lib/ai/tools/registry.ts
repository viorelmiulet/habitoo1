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
  | "get_comparables";

export type AiToolDefinition = {
  name: AiToolName;
  description: string;
  capability: AiCapability;
  /** Categoria de context pe care o alimentează rezultatul. */
  category: "property" | "client" | "lead" | "acp" | "prospect";
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
