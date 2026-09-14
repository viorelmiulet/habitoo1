/**
 * Execuția tool-urilor Habitoo — server-side, cu clientul de serviciu.
 *
 * Lanțul obligatoriu, în această ordine:
 *   autentificare (middleware) → apartenență la agenție → permisiune de rol →
 *   autorizare tool → validare parametri → interogare filtrată pe agenție.
 *
 * Fiecare interogare filtrează explicit `organization_id` cu organizația
 * actorului verificat server-side. Un ID cunoscut din altă agenție nu poate
 * returna date: filtrul este aplicat în plus față de identificator.
 */
import type { AiActor, AiSource } from "../gateway/types";
import { authorizeAiTool } from "../security/permissions";
import { aiToolCapability, findAiTool, type AiToolDefinition } from "./registry";
import { sanitizeCrmValue } from "../security/injection";

export type AiToolExecution =
  | { ok: true; data: unknown; sources: AiSource[]; summary: string; capability: string }
  | { ok: false; error: string; code: "denied" | "invalid_input" | "not_found" | "failed" };

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const PROPERTY_FIELDS =
  "id,reference,title,property_type,transaction_kind,status,city,county,district,rooms,usable_surface,surface,floor,build_year,price,currency,archived_at";

const CONTACT_FIELDS = "id,first_name,last_name,type,status,source,tags,notes";
const LEAD_FIELDS = "id,name,stage,score,source,value,property_id,next_followup_at";
const ACP_FIELDS =
  "id,property_id,version,status,estimated_value,estimated_min,estimated_max,recommended_listing_price,confidence_score,comparables_used,snapshot_at,created_at";

function propertyView(row: Record<string, unknown>) {
  return {
    id: row["id"],
    reference: row["reference"],
    title: row["title"],
    propertyType: row["property_type"],
    transaction: row["transaction_kind"],
    status: row["status"],
    city: row["city"],
    county: row["county"],
    district: row["district"],
    rooms: row["rooms"],
    usableSurface: row["usable_surface"] ?? row["surface"],
    floor: row["floor"],
    buildYear: row["build_year"],
    price: row["price"],
    currency: row["currency"],
    archived: Boolean(row["archived_at"]),
  };
}

function contactView(row: Record<string, unknown>) {
  return {
    id: row["id"],
    name: `${row["first_name"] ?? ""} ${row["last_name"] ?? ""}`.trim(),
    type: row["type"],
    status: row["status"],
    source: row["source"],
    tags: row["tags"],
    notes: row["notes"],
  };
}

function leadView(row: Record<string, unknown>) {
  return {
    id: row["id"],
    name: row["name"],
    stage: row["stage"],
    score: row["score"],
    source: row["source"],
    value: row["value"],
    propertyId: row["property_id"],
    nextFollowupAt: row["next_followup_at"],
  };
}

function acpView(row: Record<string, unknown>) {
  return {
    id: row["id"],
    propertyId: row["property_id"],
    version: row["version"],
    status: row["status"],
    estimatedValue: row["estimated_value"],
    estimatedMin: row["estimated_min"],
    estimatedMax: row["estimated_max"],
    recommendedListingPrice: row["recommended_listing_price"],
    confidenceScore: row["confidence_score"],
    comparablesUsed: row["comparables_used"],
    snapshotAt: row["snapshot_at"] ?? row["created_at"],
  };
}

function limitOf(args: Record<string, unknown>, fallback = 8): number {
  const raw = args["limit"];
  return typeof raw === "number" && Number.isFinite(raw) ? Math.min(Math.max(1, raw), 20) : fallback;
}

function escapeLike(value: string): string {
  return value.replace(/[%_,()]/g, " ").trim();
}

export type AiToolExecutionOptions = {
  /**
   * `true` doar când utilizatorul a aprobat explicit acțiunea (în interfață sau
   * în pasul de aprobare al fluxului). Modelul nu poate seta niciodată acest
   * indicator: vine din codul serverului, nu din argumentele tool-ului.
   */
  approvalGranted?: boolean;
};

async function runTool(
  tool: AiToolDefinition,
  actor: AiActor,
  args: Record<string, unknown>,
  options: AiToolExecutionOptions,
): Promise<AiToolExecution> {
  if (tool.category === "prospect") {
    const { runProspectingTool } = await import("@/lib/prospecting/tools.server");
    return runProspectingTool(actor, tool.name, args, tool.capability, {
      approvalGranted: options.approvalGranted === true,
    });
  }
  if (tool.category === "crm") {
    const { runCrmTool } = await import("@/lib/ai/agents/crm/tools.server");
    return runCrmTool(actor, tool.name, args, tool.capability, {
      approvalGranted: options.approvalGranted === true,
    });
  }
  const admin = await loadAdmin();
  const org = actor.organizationId;
  const capability = tool.capability;

  switch (tool.name) {
    case "search_properties": {
      let query = admin
        .from("properties")
        .select(PROPERTY_FIELDS)
        .eq("organization_id", org)
        .is("deleted_at", null)
        .limit(limitOf(args));
      const text = typeof args["query"] === "string" ? escapeLike(args["query"]) : "";
      if (text !== "") {
        query = query.or(
          `title.ilike.%${text}%,reference.ilike.%${text}%,city.ilike.%${text}%,district.ilike.%${text}%`,
        );
      }
      if (typeof args["city"] === "string" && args["city"] !== "") {
        query = query.ilike("city", `%${escapeLike(args["city"])}%`);
      }
      if (typeof args["propertyType"] === "string" && args["propertyType"] !== "") {
        query = query.eq("property_type", args["propertyType"]);
      }
      if (args["transaction"] === "sale" || args["transaction"] === "rent") {
        query = query.eq("transaction_kind", args["transaction"] === "sale" ? "sale" : "rent");
      }
      if (typeof args["minPrice"] === "number") query = query.gte("price", args["minPrice"]);
      if (typeof args["maxPrice"] === "number") query = query.lte("price", args["maxPrice"]);

      const { data, error } = await query;
      if (error) {
        console.error("[ai] search_properties failed", error.message);
        return { ok: false, error: "Căutarea proprietăților nu a reușit.", code: "failed" };
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        ok: true,
        capability,
        data: rows.map(propertyView),
        summary: `${rows.length} proprietăți`,
        sources: rows.map((row) => ({
          type: "property" as const,
          id: String(row["id"]),
          label: String(row["reference"] ?? row["title"] ?? "Proprietate"),
        })),
      };
    }
    case "get_property": {
      const { data, error } = await admin
        .from("properties")
        .select(PROPERTY_FIELDS)
        .eq("id", String(args["propertyId"]))
        .eq("organization_id", org)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) {
        console.error("[ai] get_property failed", error.message);
        return { ok: false, error: "Proprietatea nu a putut fi citită.", code: "failed" };
      }
      if (!data) {
        return { ok: false, error: "Proprietatea nu există în agenția ta.", code: "not_found" };
      }
      const row = data as unknown as Record<string, unknown>;
      return {
        ok: true,
        capability,
        data: propertyView(row),
        summary: "1 proprietate",
        sources: [
          {
            type: "property",
            id: String(row["id"]),
            label: String(row["reference"] ?? row["title"] ?? "Proprietate"),
          },
        ],
      };
    }
    case "search_clients": {
      let query = admin
        .from("contacts")
        .select(CONTACT_FIELDS)
        .eq("organization_id", org)
        .limit(limitOf(args));
      const text = typeof args["query"] === "string" ? escapeLike(args["query"]) : "";
      if (text !== "") {
        query = query.or(
          `first_name.ilike.%${text}%,last_name.ilike.%${text}%,email.ilike.%${text}%,phone.ilike.%${text}%`,
        );
      }
      if (typeof args["type"] === "string" && args["type"] !== "") {
        query = query.eq("type", args["type"] as never);
      }
      const { data, error } = await query;
      if (error) {
        console.error("[ai] search_clients failed", error.message);
        return { ok: false, error: "Căutarea clienților nu a reușit.", code: "failed" };
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        ok: true,
        capability,
        data: rows.map(contactView),
        summary: `${rows.length} clienți`,
        sources: rows.map((row) => ({
          type: "contact" as const,
          id: String(row["id"]),
          label: `${row["first_name"] ?? ""} ${row["last_name"] ?? ""}`.trim() || "Contact",
        })),
      };
    }
    case "get_client": {
      const { data, error } = await admin
        .from("contacts")
        .select(CONTACT_FIELDS)
        .eq("id", String(args["clientId"]))
        .eq("organization_id", org)
        .maybeSingle();
      if (error) {
        console.error("[ai] get_client failed", error.message);
        return { ok: false, error: "Clientul nu a putut fi citit.", code: "failed" };
      }
      if (!data) return { ok: false, error: "Clientul nu există în agenția ta.", code: "not_found" };
      const row = data as unknown as Record<string, unknown>;
      return {
        ok: true,
        capability,
        data: contactView(row),
        summary: "1 client",
        sources: [
          {
            type: "contact",
            id: String(row["id"]),
            label: `${row["first_name"] ?? ""} ${row["last_name"] ?? ""}`.trim() || "Contact",
          },
        ],
      };
    }
    case "search_leads": {
      let query = admin
        .from("leads")
        .select(LEAD_FIELDS)
        .eq("organization_id", org)
        .limit(limitOf(args));
      const text = typeof args["query"] === "string" ? escapeLike(args["query"]) : "";
      if (text !== "") {
        query = query.or(`name.ilike.%${text}%,email.ilike.%${text}%,phone.ilike.%${text}%`);
      }
      if (typeof args["stage"] === "string" && args["stage"] !== "") {
        query = query.eq("stage", args["stage"] as never);
      }
      const { data, error } = await query;
      if (error) {
        console.error("[ai] search_leads failed", error.message);
        return { ok: false, error: "Căutarea leadurilor nu a reușit.", code: "failed" };
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        ok: true,
        capability,
        data: rows.map(leadView),
        summary: `${rows.length} leaduri`,
        sources: rows.map((row) => ({
          type: "lead" as const,
          id: String(row["id"]),
          label: String(row["name"] ?? "Lead"),
        })),
      };
    }
    case "get_lead": {
      const { data, error } = await admin
        .from("leads")
        .select(LEAD_FIELDS)
        .eq("id", String(args["leadId"]))
        .eq("organization_id", org)
        .maybeSingle();
      if (error) {
        console.error("[ai] get_lead failed", error.message);
        return { ok: false, error: "Leadul nu a putut fi citit.", code: "failed" };
      }
      if (!data) return { ok: false, error: "Leadul nu există în agenția ta.", code: "not_found" };
      const row = data as unknown as Record<string, unknown>;
      return {
        ok: true,
        capability,
        data: leadView(row),
        summary: "1 lead",
        sources: [{ type: "lead", id: String(row["id"]), label: String(row["name"] ?? "Lead") }],
      };
    }
    case "get_acp": {
      const { data, error } = await admin
        .from("acp_analyses")
        .select(ACP_FIELDS)
        .eq("organization_id", org)
        .eq("property_id", String(args["propertyId"]))
        .eq("status", "completed")
        .order("version", { ascending: false })
        .limit(1);
      if (error) {
        console.error("[ai] get_acp failed", error.message);
        return { ok: false, error: "Analiza ACP nu a putut fi citită.", code: "failed" };
      }
      const row = ((data ?? []) as unknown as Record<string, unknown>[])[0];
      if (!row) {
        return {
          ok: false,
          error: "Nu există o analiză ACP finalizată pentru această proprietate.",
          code: "not_found",
        };
      }
      return {
        ok: true,
        capability,
        data: acpView(row),
        summary: `ACP v${row["version"]}`,
        sources: [{ type: "acp", id: String(row["id"]), label: `ACP v${row["version"]}` }],
      };
    }
    case "get_acp_history": {
      const { data, error } = await admin
        .from("acp_analyses")
        .select(ACP_FIELDS)
        .eq("organization_id", org)
        .eq("property_id", String(args["propertyId"]))
        .order("version", { ascending: false })
        .limit(limitOf(args, 10));
      if (error) {
        console.error("[ai] get_acp_history failed", error.message);
        return { ok: false, error: "Istoricul ACP nu a putut fi citit.", code: "failed" };
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      if (rows.length === 0) {
        return {
          ok: false,
          error: "Nu există analize ACP pentru această proprietate.",
          code: "not_found",
        };
      }
      return {
        ok: true,
        capability,
        data: rows.map(acpView),
        summary: `${rows.length} versiuni ACP`,
        sources: rows.map((row) => ({
          type: "acp" as const,
          id: String(row["id"]),
          label: `ACP v${row["version"]}`,
        })),
      };
    }
    case "get_acp_report": {
      const analysisId = String(args["analysisId"]);
      // Proprietatea analizei este verificată prin `organization_id`: un ID din
      // altă agenție nu poate ajunge la rapoartele ei.
      const { data: analysis } = await admin
        .from("acp_analyses")
        .select("id,version,property_id")
        .eq("id", analysisId)
        .eq("organization_id", org)
        .maybeSingle();
      if (!analysis) {
        return { ok: false, error: "Analiza ACP nu există în agenția ta.", code: "not_found" };
      }
      const { data, error } = await admin
        .from("acp_reports")
        .select("id,version,analysis_version,status,generated_at,created_at,title,file_size_bytes")
        .eq("analysis_id", analysisId)
        .eq("organization_id", org)
        .order("created_at", { ascending: false })
        .limit(limitOf(args, 5));
      if (error) {
        console.error("[ai] get_acp_report failed", error.message);
        return { ok: false, error: "Rapoartele ACP nu au putut fi citite.", code: "failed" };
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      if (rows.length === 0) {
        return {
          ok: false,
          error: "Nu există rapoarte generate pentru această analiză.",
          code: "not_found",
        };
      }
      return {
        ok: true,
        capability,
        data: rows.map((row) => ({
          id: row["id"],
          reportVersion: row["version"],
          analysisVersion: row["analysis_version"],
          status: row["status"],
          title: row["title"],
          generatedAt: row["generated_at"] ?? row["created_at"],
          fileSizeBytes: row["file_size_bytes"],
        })),
        summary: `${rows.length} rapoarte ACP`,
        sources: [{ type: "acp", id: analysisId, label: `ACP v${analysis.version}` }],
      };
    }
    case "get_comparables": {
      const analysisId = String(args["analysisId"]);
      const { data: analysis } = await admin
        .from("acp_analyses")
        .select("id,version")
        .eq("id", analysisId)
        .eq("organization_id", org)
        .maybeSingle();
      if (!analysis) {
        return { ok: false, error: "Analiza ACP nu există în agenția ta.", code: "not_found" };
      }
      const { data, error } = await admin
        .from("acp_comparables")
        .select(
          "id,source_type,source_name,similarity_score,adjusted_price,adjusted_price_per_sqm,adjustment_percent,is_selected,is_outlier,tier",
        )
        .eq("analysis_id", analysisId)
        .eq("is_selected", true)
        .order("similarity_score", { ascending: false })
        .limit(limitOf(args, 10));
      if (error) {
        console.error("[ai] get_comparables failed", error.message);
        return { ok: false, error: "Comparabilele nu au putut fi citite.", code: "failed" };
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      if (rows.length === 0) {
        return {
          ok: false,
          error: "Analiza nu are comparabile selectate.",
          code: "not_found",
        };
      }
      return {
        ok: true,
        capability,
        data: rows.map((row) => ({
          id: row["id"],
          sourceType: row["source_type"],
          sourceName: row["source_name"],
          similarityScore: row["similarity_score"],
          adjustedPrice: row["adjusted_price"],
          adjustedPricePerSqm: row["adjusted_price_per_sqm"],
          adjustmentPercent: row["adjustment_percent"],
          outlier: row["is_outlier"],
          tier: row["tier"],
        })),
        summary: `${rows.length} comparabile`,
        sources: [{ type: "acp", id: analysisId, label: `ACP v${analysis.version}` }],
      };
    }
    default:
      return { ok: false, error: "Instrumentul cerut nu există.", code: "denied" };
  }
}

/**
 * Punctul unic de execuție a unui tool cerut de model.
 * Autorizarea și validarea se fac aici, înainte de orice interogare.
 */
export async function executeAiTool(
  actor: AiActor,
  name: string,
  rawArgs: unknown,
  options: AiToolExecutionOptions = {},
): Promise<AiToolExecution> {
  const authorization = authorizeAiTool(actor, name, aiToolCapability);
  if (!authorization.allowed) {
    return { ok: false, error: authorization.message, code: "denied" };
  }
  const tool = findAiTool(name);
  if (!tool) return { ok: false, error: "Instrumentul cerut nu există.", code: "denied" };

  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { ok: false, error: "Parametrii instrumentului sunt invalizi.", code: "invalid_input" };
  }

  try {
    const result = await runTool(tool, actor, parsed.data as Record<string, unknown>, options);
    if (!result.ok) return result;
    return { ...result, data: sanitizeCrmValue(result.data) };
  } catch (error) {
    console.error(`[ai] tool ${name} threw`, error);
    return { ok: false, error: "Instrumentul nu a putut fi executat.", code: "failed" };
  }
}
