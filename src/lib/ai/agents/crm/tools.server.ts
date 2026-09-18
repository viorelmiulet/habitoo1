/**
 * Execuția tool-urilor CRM Agent (Stage 14) — server-side.
 *
 * Lanțul obligatoriu, identic cu restul tool-urilor Habitoo:
 *   autentificare → apartenență la agenție → permisiune de rol → autorizare
 *   tool → validare schemă → (pentru acțiuni) aprobare umană + ownership →
 *   interogare filtrată pe agenție.
 *
 * Fiecare interogare adaugă explicit `organization_id = actor.organizationId`:
 * un identificator cunoscut din altă agenție nu poate fi citit și nu poate fi
 * modificat. Agentul nu are acces direct la baza de date — trece pe aici.
 */
import type { AiActor, AiSource } from "@/lib/ai/gateway/types";
import type { AiToolExecution } from "@/lib/ai/tools/executors.server";
import { AI_AUDIT_ACTIONS, logAiAudit } from "@/lib/ai/security/audit";
import {
  crmActionIdempotencyKey,
  validateCrmAction,
  isAllowedLeadTransition,
  type CrmActionTool,
} from "./actions";
import {
  leadsWithoutFollowUp,
  priorityLeads,
  scoreLeadPriority,
  stagnantLeads,
  type LeadInsightInput,
} from "./insights";
import { matchRequestToProperties, requestForMatching } from "./matching";
import { CRM_DEFAULT_STALE_DAYS } from "./filters";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Admin = Awaited<ReturnType<typeof loadAdmin>>;

const PROPERTY_FIELDS =
  "id,reference,title,property_type,transaction_kind,status,city,county,district,rooms,usable_surface,surface,floor,build_year,price,currency,features,address,created_at,archived_at";
const CONTACT_FIELDS =
  "id,first_name,last_name,type,status,source,tags,assigned_to,created_at,notes";
const LEAD_FIELDS =
  "id,name,stage,score,source,value,property_id,request_id,contact_id,assigned_to,next_followup_at,last_interaction_at,created_at,stale";
const REQUEST_FIELDS =
  "id,title,kind,status,priority,contact_id,cities,areas,budget_min,budget_max,currency,rooms_min,rooms_max,surface_min,features,property_type,assigned_to,created_at";
const ACTIVITY_FIELDS =
  "id,kind,title,status,done,starts_at,ends_at,lead_id,contact_id,property_id,request_id,assigned_to,created_at";

const OPEN_STAGES = ["new", "contacted", "qualified", "viewing", "offer", "negotiation", "transaction"];

function limitOf(args: Record<string, unknown>, fallback = 8): number {
  const raw = args["limit"];
  return typeof raw === "number" && Number.isFinite(raw) ? Math.min(Math.max(1, raw), 20) : fallback;
}

function escapeLike(value: string): string {
  return value.replace(/[%_,()]/g, " ").trim();
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function contactLabel(row: Record<string, unknown>): string {
  return `${row["first_name"] ?? ""} ${row["last_name"] ?? ""}`.trim() || "Contact";
}

function propertyView(row: Record<string, unknown>) {
  return {
    id: row["id"],
    reference: row["reference"],
    title: row["title"],
    propertyType: row["property_type"],
    transaction: row["transaction_kind"],
    status: row["status"],
    city: row["city"],
    district: row["district"],
    rooms: row["rooms"],
    usableSurface: row["usable_surface"] ?? row["surface"],
    floor: row["floor"],
    buildYear: row["build_year"],
    price: row["price"],
    currency: row["currency"],
    createdAt: row["created_at"],
  };
}

function leadInsightInput(row: Record<string, unknown>): LeadInsightInput {
  return {
    id: String(row["id"]),
    name: String(row["name"] ?? "Lead"),
    stage: String(row["stage"] ?? "new"),
    score: typeof row["score"] === "number" ? row["score"] : null,
    value: row["value"] === null || row["value"] === undefined ? null : Number(row["value"]),
    source: (row["source"] as string | null) ?? null,
    createdAt: String(row["created_at"] ?? new Date().toISOString()),
    lastInteractionAt: (row["last_interaction_at"] as string | null) ?? null,
    nextFollowupAt: (row["next_followup_at"] as string | null) ?? null,
    assignedTo: (row["assigned_to"] as string | null) ?? null,
  };
}

function leadView(row: Record<string, unknown>) {
  const insight = scoreLeadPriority(leadInsightInput(row));
  return {
    id: row["id"],
    name: row["name"],
    stage: row["stage"],
    source: row["source"],
    value: row["value"],
    score: row["score"],
    contactId: row["contact_id"],
    propertyId: row["property_id"],
    requestId: row["request_id"],
    assignedTo: row["assigned_to"],
    nextFollowupAt: row["next_followup_at"],
    lastInteractionAt: row["last_interaction_at"],
    createdAt: row["created_at"],
    priority: insight.priority,
    daysSinceContact: insight.daysSinceContact,
    needsFollowUp: insight.needsFollowUp,
  };
}

function requestView(row: Record<string, unknown>) {
  return {
    id: row["id"],
    title: row["title"],
    kind: row["kind"],
    status: row["status"],
    priority: row["priority"],
    contactId: row["contact_id"],
    cities: row["cities"],
    areas: row["areas"],
    budgetMin: row["budget_min"],
    budgetMax: row["budget_max"],
    currency: row["currency"],
    roomsMin: row["rooms_min"],
    roomsMax: row["rooms_max"],
    surfaceMin: row["surface_min"],
    propertyType: row["property_type"],
    createdAt: row["created_at"],
  };
}

function denied(actor: AiActor, name: string, message: string): AiToolExecution {
  void logAiAudit({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: AI_AUDIT_ACTIONS.crmActionDenied,
    details: { tool: name, role: actor.role },
  });
  return { ok: false, error: message, code: "denied" };
}

/** Leadul cerut, verificat pe agenție și pe drepturile rolului. */
async function loadOwnedLead(
  admin: Admin,
  actor: AiActor,
  leadId: string,
): Promise<{ ok: true; lead: Record<string, unknown> } | { ok: false; execution: AiToolExecution }> {
  const { data } = await admin
    .from("leads")
    .select(LEAD_FIELDS)
    .eq("id", leadId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (!data) {
    return {
      ok: false,
      execution: { ok: false, error: "Leadul nu există în agenția ta.", code: "not_found" },
    };
  }
  const row = data as unknown as Record<string, unknown>;
  const assigned = (row["assigned_to"] as string | null) ?? null;
  if (actor.role === "agent" && assigned !== null && assigned !== actor.userId) {
    return {
      ok: false,
      execution: {
        ok: false,
        error: "Nu ai permisiunea de a modifica acest lead.",
        code: "denied",
      },
    };
  }
  return { ok: true, lead: row };
}

/**
 * Creează o activitate idempotent: dacă există deja una identică (aceeași
 * agenție, același tip, același titlu, aceeași entitate, aceeași zi), o
 * returnează în loc să creeze un duplicat. Astfel două aprobări succesive nu
 * produc două taskuri.
 */
async function insertActivityIdempotent(
  admin: Admin,
  actor: AiActor,
  row: {
    kind: string;
    title: string;
    description: string | null;
    starts_at: string;
    status: "planned" | "done";
    done: boolean;
    lead_id: string | null;
    contact_id: string | null;
    property_id: string | null;
    request_id: string | null;
  },
): Promise<{ ok: true; id: string; duplicate: boolean } | { ok: false; message: string }> {
  const dayStart = `${row.starts_at.slice(0, 10)}T00:00:00.000Z`;
  const dayEnd = `${row.starts_at.slice(0, 10)}T23:59:59.999Z`;
  let existingQuery = admin
    .from("activities")
    .select("id")
    .eq("organization_id", actor.organizationId)
    .eq("kind", row.kind as never)
    .eq("title", row.title)
    .gte("starts_at", dayStart)
    .lte("starts_at", dayEnd)
    .limit(1);
  existingQuery = row.lead_id
    ? existingQuery.eq("lead_id", row.lead_id)
    : existingQuery.is("lead_id", null);
  existingQuery = row.property_id
    ? existingQuery.eq("property_id", row.property_id)
    : existingQuery.is("property_id", null);
  const { data: existing } = await existingQuery;
  const found = (existing ?? [])[0];
  if (found?.id) return { ok: true, id: found.id, duplicate: true };

  const { data, error } = await admin
    .from("activities")
    .insert({
      organization_id: actor.organizationId,
      created_by: actor.userId,
      assigned_to: actor.userId,
      kind: row.kind,
      title: row.title,
      description: row.description,
      starts_at: row.starts_at,
      status: row.status,
      done: row.done,
      lead_id: row.lead_id,
      contact_id: row.contact_id,
      property_id: row.property_id,
      request_id: row.request_id,
    } as never)
    .select("id")
    .single();
  if (error || !data) {
    console.error("[ai-crm] activity insert failed", error?.message);
    return { ok: false, message: "Activitatea nu a putut fi creată." };
  }
  return { ok: true, id: data.id, duplicate: false };
}

/**
 * Execută un tool CRM. `approvalGranted` este `true` numai când utilizatorul a
 * aprobat explicit acțiunea în interfață sau în pasul de aprobare al fluxului;
 * modelul nu poate seta acest indicator.
 */
export async function runCrmTool(
  actor: AiActor,
  name: string,
  args: Record<string, unknown>,
  capability: string,
  options: { approvalGranted: boolean },
): Promise<AiToolExecution> {
  const admin = await loadAdmin();
  const org = actor.organizationId;

  switch (name) {
    /* ------------------------------- CITIRE ------------------------------- */
    case "search_crm_properties": {
      let query = admin
        .from("properties")
        .select(PROPERTY_FIELDS)
        .eq("organization_id", org)
        .is("deleted_at", null)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
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
        query = query.eq("property_type", args["propertyType"] as never);
      }
      if (args["transaction"] === "sale" || args["transaction"] === "rent") {
        query = query.eq("transaction_kind", args["transaction"] as never);
      }
      if (typeof args["status"] === "string" && args["status"] !== "") {
        query = query.eq("status", args["status"] as never);
      }
      if (typeof args["roomsMin"] === "number") query = query.gte("rooms", args["roomsMin"]);
      if (typeof args["roomsMax"] === "number") query = query.lte("rooms", args["roomsMax"]);
      if (typeof args["minPrice"] === "number") query = query.gte("price", args["minPrice"]);
      if (typeof args["maxPrice"] === "number") query = query.lte("price", args["maxPrice"]);
      if (typeof args["createdWithinDays"] === "number") {
        query = query.gte("created_at", isoDaysAgo(args["createdWithinDays"]));
      }

      const { data, error } = await query;
      if (error) {
        console.error("[ai-crm] search_crm_properties failed", error.message);
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
    case "search_crm_contacts": {
      let query = admin
        .from("contacts")
        .select(CONTACT_FIELDS)
        .eq("organization_id", org)
        .order("created_at", { ascending: false })
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
      if (typeof args["status"] === "string" && args["status"] !== "") {
        query = query.eq("status", args["status"]);
      }
      if (args["assignedToMe"] === true) query = query.eq("assigned_to", actor.userId);

      const { data, error } = await query;
      if (error) {
        console.error("[ai-crm] search_crm_contacts failed", error.message);
        return { ok: false, error: "Căutarea clienților nu a reușit.", code: "failed" };
      }
      let rows = (data ?? []) as unknown as Record<string, unknown>[];

      // „Clienți activi” = clienți cu cel puțin o cerere deschisă.
      if (args["withActiveRequests"] === true && rows.length > 0) {
        const { data: requests } = await admin
          .from("requests")
          .select("contact_id,status")
          .eq("organization_id", org)
          .in(
            "contact_id",
            rows.map((row) => String(row["id"])),
          )
          .in("status", ["new", "active", "working"]);
        const active = new Set((requests ?? []).map((row) => String(row.contact_id)));
        rows = rows.filter((row) => active.has(String(row["id"])));
      }

      return {
        ok: true,
        capability,
        data: rows.map((row) => ({
          id: row["id"],
          name: contactLabel(row),
          type: row["type"],
          status: row["status"],
          source: row["source"],
          tags: row["tags"],
          assignedTo: row["assigned_to"],
          createdAt: row["created_at"],
        })),
        summary: `${rows.length} clienți`,
        sources: rows.map((row) => ({
          type: "contact" as const,
          id: String(row["id"]),
          label: contactLabel(row),
        })),
      };
    }
    case "search_crm_leads": {
      let query = admin
        .from("leads")
        .select(LEAD_FIELDS)
        .eq("organization_id", org)
        .order("created_at", { ascending: false })
        .limit(limitOf(args, 12));
      const text = typeof args["query"] === "string" ? escapeLike(args["query"]) : "";
      if (text !== "") {
        query = query.or(`name.ilike.%${text}%,email.ilike.%${text}%,phone.ilike.%${text}%`);
      }
      if (typeof args["stage"] === "string" && args["stage"] !== "") {
        query = query.eq("stage", args["stage"] as never);
      }
      if (typeof args["source"] === "string" && args["source"] !== "") {
        query = query.eq("source", args["source"]);
      }
      if (args["assignedToMe"] === true) query = query.eq("assigned_to", actor.userId);
      if (args["openOnly"] === true) query = query.in("stage", OPEN_STAGES as never);
      if (typeof args["createdWithinDays"] === "number") {
        query = query.gte("created_at", isoDaysAgo(args["createdWithinDays"]));
      }
      if (args["withoutFollowup"] === true) query = query.is("next_followup_at", null);
      if (typeof args["noActivityDays"] === "number") {
        const cutoff = isoDaysAgo(args["noActivityDays"]);
        query = query.or(`last_interaction_at.is.null,last_interaction_at.lte.${cutoff}`);
      }

      const { data, error } = await query;
      if (error) {
        console.error("[ai-crm] search_crm_leads failed", error.message);
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
    case "search_crm_requests": {
      let query = admin
        .from("requests")
        .select(REQUEST_FIELDS)
        .eq("organization_id", org)
        .order("created_at", { ascending: false })
        .limit(limitOf(args));
      const text = typeof args["query"] === "string" ? escapeLike(args["query"]) : "";
      if (text !== "") query = query.ilike("title", `%${text}%`);
      if (typeof args["kind"] === "string") query = query.eq("kind", args["kind"] as never);
      if (typeof args["contactId"] === "string") query = query.eq("contact_id", args["contactId"]);
      if (typeof args["status"] === "string" && args["status"] !== "") {
        query = query.eq("status", args["status"]);
      }
      if (typeof args["roomsMin"] === "number") query = query.gte("rooms_min", args["roomsMin"]);
      if (typeof args["maxBudget"] === "number") query = query.lte("budget_max", args["maxBudget"]);
      if (typeof args["city"] === "string" && args["city"] !== "") {
        query = query.contains("cities", [String(args["city"])]);
      }

      const { data, error } = await query;
      if (error) {
        console.error("[ai-crm] search_crm_requests failed", error.message);
        return { ok: false, error: "Căutarea cererilor nu a reușit.", code: "failed" };
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        ok: true,
        capability,
        data: rows.map(requestView),
        summary: `${rows.length} cereri`,
        sources: rows.map((row) => ({
          type: "contact" as const,
          id: String(row["contact_id"] ?? row["id"]),
          label: String(row["title"] ?? "Cerere"),
        })),
      };
    }
    case "get_crm_contact": {
      const contactId = String(args["contactId"]);
      const { data } = await admin
        .from("contacts")
        .select(CONTACT_FIELDS)
        .eq("id", contactId)
        .eq("organization_id", org)
        .maybeSingle();
      if (!data) return { ok: false, error: "Clientul nu există în agenția ta.", code: "not_found" };
      const row = data as unknown as Record<string, unknown>;
      const [{ data: requests }, { data: leads }] = await Promise.all([
        admin
          .from("requests")
          .select(REQUEST_FIELDS)
          .eq("organization_id", org)
          .eq("contact_id", contactId)
          .limit(5),
        admin
          .from("leads")
          .select(LEAD_FIELDS)
          .eq("organization_id", org)
          .eq("contact_id", contactId)
          .limit(5),
      ]);
      return {
        ok: true,
        capability,
        data: {
          id: row["id"],
          name: contactLabel(row),
          type: row["type"],
          status: row["status"],
          source: row["source"],
          tags: row["tags"],
          assignedTo: row["assigned_to"],
          requests: ((requests ?? []) as unknown as Record<string, unknown>[]).map(requestView),
          leads: ((leads ?? []) as unknown as Record<string, unknown>[]).map(leadView),
        },
        summary: "1 client",
        sources: [{ type: "contact", id: contactId, label: contactLabel(row) }],
      };
    }
    case "get_crm_lead": {
      const leadId = String(args["leadId"]);
      const { data } = await admin
        .from("leads")
        .select(LEAD_FIELDS)
        .eq("id", leadId)
        .eq("organization_id", org)
        .maybeSingle();
      if (!data) return { ok: false, error: "Leadul nu există în agenția ta.", code: "not_found" };
      const row = data as unknown as Record<string, unknown>;
      const insight = scoreLeadPriority(leadInsightInput(row));
      return {
        ok: true,
        capability,
        data: { ...leadView(row), factors: insight.factors },
        summary: `Lead ${String(row["name"] ?? "")} · prioritate ${insight.priority}`,
        sources: [{ type: "lead", id: leadId, label: String(row["name"] ?? "Lead") }],
      };
    }
    case "get_crm_property": {
      const { data } = await admin
        .from("properties")
        .select(PROPERTY_FIELDS)
        .eq("id", String(args["propertyId"]))
        .eq("organization_id", org)
        .is("deleted_at", null)
        .maybeSingle();
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
    case "get_crm_activity_history": {
      if (!args["leadId"] && !args["contactId"] && !args["propertyId"]) {
        return {
          ok: false,
          error: "Precizează leadul, clientul sau proprietatea.",
          code: "invalid_input",
        };
      }
      let query = admin
        .from("activities")
        .select(ACTIVITY_FIELDS)
        .eq("organization_id", org)
        .order("starts_at", { ascending: false })
        .limit(limitOf(args, 10));
      if (typeof args["leadId"] === "string") query = query.eq("lead_id", args["leadId"]);
      if (typeof args["contactId"] === "string") query = query.eq("contact_id", args["contactId"]);
      if (typeof args["propertyId"] === "string") query = query.eq("property_id", args["propertyId"]);

      const { data, error } = await query;
      if (error) {
        console.error("[ai-crm] get_crm_activity_history failed", error.message);
        return { ok: false, error: "Istoricul de activități nu a putut fi citit.", code: "failed" };
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        ok: true,
        capability,
        data: rows.map((row) => ({
          id: row["id"],
          kind: row["kind"],
          title: row["title"],
          status: row["status"],
          done: row["done"],
          startsAt: row["starts_at"],
          leadId: row["lead_id"],
          contactId: row["contact_id"],
          propertyId: row["property_id"],
        })),
        summary: `${rows.length} activități`,
        sources: [],
      };
    }
    case "match_client_to_properties": {
      const requestId = typeof args["requestId"] === "string" ? args["requestId"] : null;
      const contactId = typeof args["contactId"] === "string" ? args["contactId"] : null;
      if (!requestId && !contactId) {
        return { ok: false, error: "Precizează cererea sau clientul.", code: "invalid_input" };
      }
      let requestQuery = admin
        .from("requests")
        .select("*")
        .eq("organization_id", org)
        .order("created_at", { ascending: false })
        .limit(1);
      requestQuery = requestId
        ? requestQuery.eq("id", requestId)
        : requestQuery.eq("contact_id", contactId as string).in("status", ["new", "active", "working"]);
      const { data: requestRows } = await requestQuery;
      const request = (requestRows ?? [])[0];
      if (!request) {
        return {
          ok: false,
          error: "Nu am găsit o cerere activă pentru acest client în agenția ta.",
          code: "not_found",
        };
      }

      const { data: properties, error } = await admin
        .from("properties")
        .select(PROPERTY_FIELDS)
        .eq("organization_id", org)
        .is("deleted_at", null)
        .is("archived_at", null)
        .in("status", ["active", "reserved", "negotiation", "draft"])
        .limit(200);
      if (error) {
        console.error("[ai-crm] match_client_to_properties failed", error.message);
        return { ok: false, error: "Potrivirile nu au putut fi calculate.", code: "failed" };
      }

      const matches = matchRequestToProperties(
        requestForMatching(request as never),
        ((properties ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
          id: String(row["id"]),
          reference: (row["reference"] as string | null) ?? null,
          title: (row["title"] as string | null) ?? null,
          transaction_kind: row["transaction_kind"] as never,
          price: row["price"] as never,
          city: (row["city"] as string | null) ?? null,
          district: (row["district"] as string | null) ?? null,
          address: (row["address"] as string | null) ?? null,
          rooms: (row["rooms"] as number | null) ?? null,
          surface: (row["usable_surface"] ?? row["surface"]) as never,
          features: (row["features"] as string[] | null) ?? [],
          property_type: row["property_type"] as never,
          status: row["status"] as never,
        })),
        {
          minScore: typeof args["minScore"] === "number" ? args["minScore"] : 55,
          limit: limitOf(args, 6),
        },
      );

      return {
        ok: true,
        capability,
        data: {
          requestId: request.id,
          requestTitle: request.title,
          contactId: request.contact_id,
          matches,
        },
        summary: `${matches.length} potriviri pentru „${request.title}”`,
        sources: matches.map((match) => ({
          type: "property" as const,
          id: match.propertyId,
          label: match.reference ?? match.title ?? "Proprietate",
        })),
      };
    }
    case "get_crm_priorities": {
      let query = admin
        .from("leads")
        .select(LEAD_FIELDS)
        .eq("organization_id", org)
        .in("stage", OPEN_STAGES as never)
        .limit(200);
      if (args["assignedToMe"] === true) query = query.eq("assigned_to", actor.userId);
      const { data, error } = await query;
      if (error) {
        console.error("[ai-crm] get_crm_priorities failed", error.message);
        return { ok: false, error: "Prioritățile nu au putut fi calculate.", code: "failed" };
      }
      const leads = ((data ?? []) as unknown as Record<string, unknown>[]).map(leadInsightInput);
      const focus = typeof args["focus"] === "string" ? args["focus"] : "priority";
      const days = typeof args["days"] === "number" ? args["days"] : CRM_DEFAULT_STALE_DAYS;
      const limit = limitOf(args, 10);

      const insights =
        focus === "without_followup"
          ? leadsWithoutFollowUp(leads).slice(0, limit)
          : focus === "stagnant"
            ? stagnantLeads(leads, days).slice(0, limit)
            : priorityLeads(leads, limit);

      return {
        ok: true,
        capability,
        data: { focus, days, leads: insights },
        summary: `${insights.length} leaduri (${focus})`,
        sources: insights.map((insight) => ({
          type: "lead" as const,
          id: insight.id,
          label: insight.name,
        })),
      };
    }

    /* ------------- ACȚIUNI: numai cu aprobare umană explicită ------------- */
    case "create_task":
    case "create_note":
    case "update_lead_status":
    case "assign_lead":
    case "create_property_match":
    case "create_client_property_match":
    case "generate_property_description":
    case "generate_offer_draft": {
      if (!options.approvalGranted) {
        return denied(
          actor,
          name,
          "Această acțiune are nevoie de aprobarea ta explicită înainte de execuție.",
        );
      }
      const validation = validateCrmAction(name, args);
      if (!validation.ok) {
        return { ok: false, error: validation.message, code: "invalid_input" };
      }
      return executeCrmAction(admin, actor, validation.tool, validation.data, capability);
    }
    default:
      return { ok: false, error: "Instrumentul cerut nu există.", code: "denied" };
  }
}

/** Execuția efectivă a unei acțiuni aprobate. Idempotentă prin construcție. */
async function executeCrmAction(
  admin: Admin,
  actor: AiActor,
  tool: CrmActionTool,
  data: Record<string, unknown>,
  capability: string,
): Promise<AiToolExecution> {
  const org = actor.organizationId;
  const idempotencyKey = crmActionIdempotencyKey(org, {
    tool,
    argumentsJson: JSON.stringify(data),
  });

  async function finish(
    ok: boolean,
    summary: string,
    sources: AiSource[],
    extra: { entityId?: string | null; duplicate?: boolean } = {},
  ): Promise<AiToolExecution> {
    await logAiAudit({
      organizationId: org,
      actorId: actor.userId,
      action: ok ? AI_AUDIT_ACTIONS.crmActionExecuted : AI_AUDIT_ACTIONS.crmActionFailed,
      details: {
        tool,
        entityId: extra.entityId ?? null,
        duplicate: extra.duplicate === true,
        idempotency: idempotencyKey,
      },
    });
    if (!ok) return { ok: false, error: summary, code: "failed" };
    return {
      ok: true,
      capability,
      data: { executed: true, duplicate: extra.duplicate === true, id: extra.entityId ?? null },
      summary,
      sources,
    };
  }

  switch (tool) {
    case "create_task":
    case "create_note": {
      const leadId = (data["leadId"] as string | null) ?? null;
      const contactId = (data["contactId"] as string | null) ?? null;
      const propertyId = (data["propertyId"] as string | null) ?? null;

      // Entitățile trebuie să existe în agenția actorului.
      if (leadId) {
        const owned = await loadOwnedLead(admin, actor, leadId);
        if (!owned.ok) return owned.execution;
      }
      if (contactId) {
        const { data: contact } = await admin
          .from("contacts")
          .select("id")
          .eq("id", contactId)
          .eq("organization_id", org)
          .maybeSingle();
        if (!contact) {
          return { ok: false, error: "Clientul nu există în agenția ta.", code: "not_found" };
        }
      }
      if (propertyId) {
        const { data: property } = await admin
          .from("properties")
          .select("id")
          .eq("id", propertyId)
          .eq("organization_id", org)
          .maybeSingle();
        if (!property) {
          return { ok: false, error: "Proprietatea nu există în agenția ta.", code: "not_found" };
        }
      }

      const isTask = tool === "create_task";
      const startsAt = isTask
        ? new Date(String(data["dueAt"])).toISOString()
        : new Date().toISOString();
      const result = await insertActivityIdempotent(admin, actor, {
        kind: isTask ? "task" : "note",
        title: String(data["title"]),
        description: isTask
          ? ((data["description"] as string | undefined) ?? null)
          : String(data["body"]),
        starts_at: startsAt,
        status: isTask ? "planned" : "done",
        done: !isTask,
        lead_id: leadId,
        contact_id: contactId,
        property_id: propertyId,
        request_id: null,
      });
      if (!result.ok) return finish(false, result.message, []);

      // Un follow-up planificat se reflectă și în lead, ca CRM-ul să rămână
      // coerent. Dacă această a doua scriere eșuează, NU raportăm succes:
      // utilizatorul trebuie să știe că leadul nu are data de follow-up.
      if (isTask && leadId) {
        const { error: followupError } = await admin
          .from("leads")
          .update({ next_followup_at: startsAt, updated_by: actor.userId } as never)
          .eq("id", leadId)
          .eq("organization_id", org);
        if (followupError) {
          console.error("[ai-crm] lead followup update failed", followupError.message);
          return finish(
            false,
            "Activitatea a fost creată, dar data de follow-up a leadului nu a putut fi salvată. Setează-o manual pe lead.",
            [],
          );
        }
      }

      return finish(
        true,
        result.duplicate
          ? "Activitatea exista deja: nu am creat un duplicat."
          : isTask
            ? "Activitate creată."
            : "Notă adăugată.",
        leadId ? [{ type: "lead", id: leadId, label: String(data["title"]) }] : [],
        { entityId: result.id, duplicate: result.duplicate },
      );
    }

    case "update_lead_status": {
      const leadId = String(data["leadId"]);
      const owned = await loadOwnedLead(admin, actor, leadId);
      if (!owned.ok) return owned.execution;
      const current = String(owned.lead["stage"]);
      const stage = String(data["stage"]);
      const expected = data["expectedStage"] as string | null | undefined;
      // Starea a fost recitită acum: dacă altcineva a schimbat etapa între
      // propunere și aprobare, blocăm în loc să suprascriem.
      if (typeof expected === "string" && expected !== "" && expected !== current) {
        return {
          ok: false,
          error:
            "Etapa leadului s-a schimbat între propunere și aprobare. Cere o propunere nouă, cu starea actuală.",
          code: "invalid_input",
        };
      }
      if (!isAllowedLeadTransition(current, stage)) {
        if (current === stage) {
          return finish(true, `Leadul este deja în etapa ${stage}.`, [], {
            entityId: leadId,
            duplicate: true,
          });
        }
        return { ok: false, error: "Tranziția de etapă cerută nu este permisă.", code: "invalid_input" };
      }
      const { error } = await admin
        .from("leads")
        .update({ stage, updated_by: actor.userId } as never)
        .eq("id", leadId)
        .eq("organization_id", org);
      if (error) {
        console.error("[ai-crm] update_lead_status failed", error.message);
        return finish(false, "Etapa leadului nu a putut fi modificată.", []);
      }
      // Istoricul etapelor este parte din rezultat: fără el nu raportăm succes.
      const { error: eventError } = await admin.from("lead_events").insert({
        organization_id: org,
        lead_id: leadId,
        from_stage: current,
        to_stage: stage,
        actor_id: actor.userId,
        note: (data["reason"] as string | undefined) ?? "Modificat prin Habitoo CRM Agent (aprobat)",
      } as never);
      if (eventError) {
        console.error("[ai-crm] lead_events insert failed", eventError.message);
        return finish(
          false,
          `Etapa leadului a trecut din ${current} în ${stage}, dar înregistrarea în istoricul leadului nu a reușit.`,
          [],
        );
      }

      return finish(
        true,
        `Etapa leadului a trecut din ${current} în ${stage}.`,
        [{ type: "lead", id: leadId, label: String(owned.lead["name"] ?? "Lead") }],
        { entityId: leadId },
      );
    }
    case "assign_lead": {
      if (actor.role === "agent") {
        return denied(actor, tool, "Doar un administrator al agenției poate realoca leaduri.");
      }
      const leadId = String(data["leadId"]);
      const assigneeId = String(data["assigneeId"]);
      const owned = await loadOwnedLead(admin, actor, leadId);
      if (!owned.ok) return owned.execution;
      const { data: assignee } = await admin
        .from("profiles")
        .select("id,full_name")
        .eq("id", assigneeId)
        .eq("organization_id", org)
        .maybeSingle();
      if (!assignee) {
        return {
          ok: false,
          error: "Persoana aleasă nu face parte din agenția ta.",
          code: "not_found",
        };
      }
      if (String(owned.lead["assigned_to"] ?? "") === assigneeId) {
        return finish(true, "Leadul este deja alocat acestei persoane.", [], {
          entityId: leadId,
          duplicate: true,
        });
      }
      const { error } = await admin
        .from("leads")
        .update({ assigned_to: assigneeId, updated_by: actor.userId } as never)
        .eq("id", leadId)
        .eq("organization_id", org);
      if (error) {
        console.error("[ai-crm] assign_lead failed", error.message);
        return finish(false, "Leadul nu a putut fi alocat.", []);
      }
      return finish(
        true,
        `Leadul a fost alocat lui ${assignee.full_name ?? "membrul agenției"}.`,
        [{ type: "lead", id: leadId, label: String(owned.lead["name"] ?? "Lead") }],
        { entityId: leadId },
      );
    }
    case "create_property_match": {
      const requestId = String(data["requestId"]);
      const propertyId = String(data["propertyId"]);
      const [{ data: request }, { data: property }] = await Promise.all([
        admin
          .from("requests")
          .select("id,title,contact_id")
          .eq("id", requestId)
          .eq("organization_id", org)
          .maybeSingle(),
        admin
          .from("properties")
          .select("id,reference,title")
          .eq("id", propertyId)
          .eq("organization_id", org)
          .is("deleted_at", null)
          .maybeSingle(),
      ]);
      if (!request) {
        return { ok: false, error: "Cererea nu există în agenția ta.", code: "not_found" };
      }
      if (!property) {
        return { ok: false, error: "Proprietatea nu există în agenția ta.", code: "not_found" };
      }
      const title = `Potrivire propusă: ${property.reference ?? property.title ?? "proprietate"} → ${request.title}`;
      const result = await insertActivityIdempotent(admin, actor, {
        kind: "task",
        title,
        description:
          (data["note"] as string | undefined) ??
          "Potrivire înregistrată de Habitoo CRM Agent, aprobată de utilizator.",
        starts_at: new Date().toISOString(),
        status: "planned",
        done: false,
        lead_id: null,
        contact_id: request.contact_id ?? null,
        property_id: propertyId,
        request_id: requestId,
      });
      if (!result.ok) return finish(false, result.message, []);
      return finish(
        true,
        result.duplicate ? "Potrivirea era deja înregistrată." : "Potrivirea a fost înregistrată.",
        [
          {
            type: "property",
            id: propertyId,
            label: property.reference ?? property.title ?? "Proprietate",
          },
        ],
        { entityId: result.id, duplicate: result.duplicate },
      );
    }
    case "create_client_property_match": {
      const contactId = String(data["contactId"]);
      const propertyId = String(data["propertyId"]);
      const [{ data: contact }, { data: property }] = await Promise.all([
        admin
          .from("contacts")
          .select("id,first_name,last_name")
          .eq("id", contactId)
          .eq("organization_id", org)
          .maybeSingle(),
        admin
          .from("properties")
          .select("id,reference,title")
          .eq("id", propertyId)
          .eq("organization_id", org)
          .is("deleted_at", null)
          .maybeSingle(),
      ]);
      if (!contact) {
        return { ok: false, error: "Clientul nu există în agenția ta.", code: "not_found" };
      }
      if (!property) {
        return { ok: false, error: "Proprietatea nu există în agenția ta.", code: "not_found" };
      }
      const propertyLabel = property.reference ?? property.title ?? "proprietate";
      const clientLabel = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "client";

      // O potrivire activă între același client și aceeași proprietate nu se
      // dublează, indiferent de titlu sau de ziua în care a fost propusă.
      const { data: existingMatch } = await admin
        .from("activities")
        .select("id")
        .eq("organization_id", org)
        .eq("contact_id", contactId)
        .eq("property_id", propertyId)
        .eq("kind", "task" as never)
        .eq("done", false)
        .limit(1);
      const already = (existingMatch ?? [])[0];
      if (already?.id) {
        return finish(true, "Potrivirea activă exista deja: nu am creat un duplicat.", [], {
          entityId: already.id,
          duplicate: true,
        });
      }

      const result = await insertActivityIdempotent(admin, actor, {
        kind: "task",
        title: `Potrivire propusă: ${propertyLabel} → ${clientLabel}`,
        description:
          (data["reason"] as string | undefined) ??
          "Potrivire client ↔ proprietate înregistrată de Habitoo CRM Agent, aprobată de utilizator.",
        starts_at: new Date().toISOString(),
        status: "planned",
        done: false,
        lead_id: null,
        contact_id: contactId,
        property_id: propertyId,
        request_id: null,
      });
      if (!result.ok) return finish(false, result.message, []);
      return finish(
        true,
        result.duplicate ? "Potrivirea era deja înregistrată." : "Potrivirea a fost înregistrată.",
        [{ type: "property", id: propertyId, label: propertyLabel }],
        { entityId: result.id, duplicate: result.duplicate },
      );
    }
    /**
     * CIORNE: textul se salvează ca notă atașată proprietății. Descrierea
     * publicată a proprietății NU este atinsă și nimic nu se publică.
     */
    case "generate_property_description":
    case "generate_offer_draft": {
      const propertyId = String(data["propertyId"]);
      const contactId = (data["contactId"] as string | null) ?? null;
      const { data: property } = await admin
        .from("properties")
        .select("id,reference,title")
        .eq("id", propertyId)
        .eq("organization_id", org)
        .is("deleted_at", null)
        .maybeSingle();
      if (!property) {
        return { ok: false, error: "Proprietatea nu există în agenția ta.", code: "not_found" };
      }
      if (contactId) {
        const { data: contact } = await admin
          .from("contacts")
          .select("id")
          .eq("id", contactId)
          .eq("organization_id", org)
          .maybeSingle();
        if (!contact) {
          return { ok: false, error: "Clientul nu există în agenția ta.", code: "not_found" };
        }
      }
      const propertyLabel = property.reference ?? property.title ?? "proprietate";
      const isDescription = tool === "generate_property_description";
      const title =
        (data["title"] as string | null) ??
        (isDescription
          ? `Ciornă descriere: ${propertyLabel}`
          : `Ciornă ofertă: ${propertyLabel}`);
      const result = await insertActivityIdempotent(admin, actor, {
        kind: "note",
        title,
        description: String(data["draft"]),
        starts_at: new Date().toISOString(),
        status: "done",
        done: true,
        lead_id: null,
        contact_id: contactId,
        property_id: propertyId,
        request_id: null,
      });
      if (!result.ok) return finish(false, result.message, []);
      return finish(
        true,
        result.duplicate
          ? "Ciorna exista deja: nu am creat un duplicat."
          : isDescription
            ? "Ciorna de descriere a fost salvată. Descrierea publicată a proprietății a rămas neschimbată."
            : "Ciorna de ofertă a fost salvată. Nu a fost publicată nicăieri.",
        [{ type: "property", id: propertyId, label: propertyLabel }],
        { entityId: result.id, duplicate: result.duplicate },
      );
    }
    default:
      return { ok: false, error: "Acțiunea cerută nu există.", code: "denied" };
  }
}
