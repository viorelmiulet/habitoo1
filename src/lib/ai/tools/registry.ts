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
  category: "property" | "client" | "lead" | "acp";
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
    schema: z.object({ propertyId: uuid }),
    parameters: objectSchema({ propertyId: { type: "string" } }, ["propertyId"]),
  },
  {
    name: "search_clients",
    description: "Caută clienți/contacte ale agenției după nume, email, telefon sau tip.",
    capability: "read:contacts",
    category: "client",
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
    schema: z.object({ clientId: uuid }),
    parameters: objectSchema({ clientId: { type: "string" } }, ["clientId"]),
  },
  {
    name: "search_leads",
    description: "Caută leaduri ale agenției după text, etapă sau sursă.",
    capability: "read:leads",
    category: "lead",
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
    schema: z.object({ leadId: uuid }),
    parameters: objectSchema({ leadId: { type: "string" } }, ["leadId"]),
  },
  {
    name: "get_acp",
    description:
      "Returnează cea mai recentă analiză comparativă de piață (ACP) finalizată a unei proprietăți.",
    capability: "read:acp",
    category: "acp",
    schema: z.object({ propertyId: uuid }),
    parameters: objectSchema({ propertyId: { type: "string" } }, ["propertyId"]),
  },
  {
    name: "get_acp_history",
    description: "Returnează istoricul versiunilor ACP ale unei proprietăți.",
    capability: "read:acp",
    category: "acp",
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
    schema: z.object({ analysisId: uuid, limit: searchLimit }),
    parameters: objectSchema({ analysisId: { type: "string" }, limit: { type: "integer" } }, [
      "analysisId",
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

/** Declarațiile trimise providerului (fără detalii interne). */
export function aiToolDeclarations(): AiToolDeclaration[] {
  return AI_TOOLS.map((tool) => ({
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
