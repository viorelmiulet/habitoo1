/**
 * Execuția tool-urilor de prospecting (Stage 13).
 *
 * Lanțul este identic cu restul tool-urilor Habitoo:
 *   autentificare → apartenență la agenție → permisiune de rol → autorizare
 *   tool → validare schemă → (pentru acțiuni) aprobare umană → interogare
 *   filtrată pe agenție.
 *
 * Fiecare interogare filtrează explicit `organization_id`: un ID cunoscut din
 * altă agenție nu poate returna și nu poate modifica date.
 */
import type { AiActor, AiSource } from "@/lib/ai/gateway/types";
import type { AiToolExecution } from "@/lib/ai/tools/executors.server";
import { PROSPECTING_AUDIT_ACTIONS, logProspectingAudit } from "./audit";
import { importProspectToCrm } from "./import.server";
import { normalizePhone, normalizeProspect } from "./normalize";
import { providerAvailability, resolveProspectingProvider } from "./providers/registry.server";
import { scoreProspect } from "./scoring";
import { emptyCriteria } from "./types";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const PROSPECT_FIELDS =
  "id,title,city,county,zone,price,currency,rooms,surface_useful,seller_type,seller_confidence,seller_phone,status,opportunity_score,relevance_score,score_breakdown,source_url,canonical_url,duplicate_group_id,source_id,published_at,created_at,extraction_confidence,raw_metadata";

function prospectView(row: Record<string, unknown>, includePhone: boolean) {
  return {
    id: row["id"],
    title: row["title"],
    city: row["city"],
    county: row["county"],
    zone: row["zone"],
    price: row["price"],
    currency: row["currency"],
    rooms: row["rooms"],
    surfaceUseful: row["surface_useful"],
    sellerType: row["seller_type"],
    sellerConfidence: row["seller_confidence"],
    // Telefonul este PII: apare doar în tool-ul de detaliu, nu în liste.
    sellerPhone: includePhone ? row["seller_phone"] : undefined,
    status: row["status"],
    opportunityScore: row["opportunity_score"],
    relevanceScore: row["relevance_score"],
    sourceUrl: row["source_url"],
    duplicateGroupId: row["duplicate_group_id"],
    publishedAt: row["published_at"],
    extractionConfidence: row["extraction_confidence"],
  };
}

function sourceOf(row: Record<string, unknown>): AiSource {
  return {
    type: "prospect",
    id: String(row["id"]),
    label: String(row["title"] ?? "Oportunitate"),
  };
}

function limitOf(args: Record<string, unknown>, fallback = 8): number {
  const raw = args["limit"];
  return typeof raw === "number" && Number.isFinite(raw) ? Math.min(Math.max(1, raw), 20) : fallback;
}

/**
 * Execută un tool de prospecting. `approvalGranted` este `true` numai când
 * utilizatorul a aprobat explicit acțiunea în interfață sau în flux.
 */
export async function runProspectingTool(
  actor: AiActor,
  name: string,
  args: Record<string, unknown>,
  capability: string,
  options: { approvalGranted: boolean },
): Promise<AiToolExecution> {
  const admin = await loadAdmin();
  const org = actor.organizationId;

  switch (name) {
    case "search_prospects": {
      let query = admin
        .from("prospects")
        .select(PROSPECT_FIELDS)
        .eq("organization_id", org)
        .order("opportunity_score", { ascending: false })
        .limit(limitOf(args));
      const text = typeof args["query"] === "string" ? args["query"].replace(/[%_,()]/g, " ").trim() : "";
      if (text !== "") query = query.or(`title.ilike.%${text}%,city.ilike.%${text}%,zone.ilike.%${text}%`);
      if (typeof args["city"] === "string") query = query.ilike("city", `%${args["city"]}%`);
      if (typeof args["sellerType"] === "string") query = query.eq("seller_type", args["sellerType"]);
      if (typeof args["status"] === "string") query = query.eq("status", args["status"]);
      if (typeof args["minScore"] === "number") query = query.gte("opportunity_score", args["minScore"]);

      const { data, error } = await query;
      if (error) {
        console.error("[prospecting] search_prospects failed", error.message);
        return { ok: false, error: "Căutarea oportunităților nu a reușit.", code: "failed" };
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        ok: true,
        capability,
        data: rows.map((row) => prospectView(row, false)),
        summary: `${rows.length} oportunități`,
        sources: rows.map(sourceOf),
      };
    }
    case "get_prospect": {
      const { data, error } = await admin
        .from("prospects")
        .select(PROSPECT_FIELDS)
        .eq("id", String(args["prospectId"]))
        .eq("organization_id", org)
        .maybeSingle();
      if (error) {
        console.error("[prospecting] get_prospect failed", error.message);
        return { ok: false, error: "Oportunitatea nu a putut fi citită.", code: "failed" };
      }
      if (!data) return { ok: false, error: "Oportunitatea nu există în agenția ta.", code: "not_found" };
      const row = data as unknown as Record<string, unknown>;
      return {
        ok: true,
        capability,
        data: prospectView(row, true),
        summary: "1 oportunitate",
        sources: [sourceOf(row)],
      };
    }
    case "get_prospecting_run": {
      const { data } = await admin
        .from("prospecting_runs")
        .select(
          "id,search_id,status,started_at,completed_at,items_found,items_normalized,duplicates_found,candidates_found,errors_count,error_summary",
        )
        .eq("id", String(args["runId"]))
        .eq("organization_id", org)
        .maybeSingle();
      if (!data) return { ok: false, error: "Rularea nu există în agenția ta.", code: "not_found" };
      return {
        ok: true,
        capability,
        data,
        summary: `Rulare ${data.status}`,
        sources: [{ type: "prospect", id: data.id, label: "Rulare prospectare" }],
      };
    }
    case "list_prospecting_sources": {
      const { data } = await admin
        .from("prospecting_sources")
        .select("id,name,source_type,provider_key,enabled,organization_id")
        .or(`organization_id.eq.${org},organization_id.is.null`)
        .limit(limitOf(args, 20));
      const rows = data ?? [];
      return {
        ok: true,
        capability,
        data: rows.map((row) => ({
          id: row.id,
          name: row.name,
          sourceType: row.source_type,
          providerKey: row.provider_key,
          enabled: row.enabled,
          global: row.organization_id === null,
          implemented: resolveProspectingProvider(row.provider_key) !== null,
          availability: providerAvailability(row.provider_key),
        })),
        summary: `${rows.length} surse`,
        sources: [],
      };
    }
    case "preview_source": {
      const { data } = await admin
        .from("prospecting_sources")
        .select("*")
        .eq("id", String(args["sourceId"]))
        .or(`organization_id.eq.${org},organization_id.is.null`)
        .maybeSingle();
      if (!data) return { ok: false, error: "Sursa nu există pentru agenția ta.", code: "not_found" };
      const provider = resolveProspectingProvider(data.provider_key);
      if (!provider) {
        return {
          ok: true,
          capability,
          data: {
            ok: false,
            code: "not_configured",
            message: "Sursa nu are încă o integrare disponibilă.",
          },
          summary: "Sursă neconfigurată",
          sources: [],
        };
      }
      const health = await provider.healthCheck({
        id: data.id,
        organizationId: data.organization_id,
        name: data.name,
        sourceType: data.source_type as never,
        providerKey: data.provider_key,
        baseUrl: data.base_url,
        enabled: data.enabled,
        configuration: (data.configuration ?? {}) as Record<string, unknown>,
      });
      return { ok: true, capability, data: health, summary: health.message, sources: [] };
    }
    case "get_prospect_duplicates": {
      const { data: prospect } = await admin
        .from("prospects")
        .select("id,duplicate_group_id")
        .eq("id", String(args["prospectId"]))
        .eq("organization_id", org)
        .maybeSingle();
      if (!prospect) {
        return { ok: false, error: "Oportunitatea nu există în agenția ta.", code: "not_found" };
      }
      if (!prospect.duplicate_group_id) {
        return { ok: true, capability, data: [], summary: "Fără duplicate", sources: [] };
      }
      const { data } = await admin
        .from("prospects")
        .select(PROSPECT_FIELDS)
        .eq("organization_id", org)
        .eq("duplicate_group_id", prospect.duplicate_group_id)
        .limit(20);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        ok: true,
        capability,
        data: rows.map((row) => prospectView(row, false)),
        summary: `${rows.length} în grupul de duplicate`,
        sources: rows.map(sourceOf),
      };
    }
    case "score_prospect": {
      const { data } = await admin
        .from("prospects")
        .select("id,title,opportunity_score,relevance_score,score_breakdown")
        .eq("id", String(args["prospectId"]))
        .eq("organization_id", org)
        .maybeSingle();
      if (!data) {
        return { ok: false, error: "Oportunitatea nu există în agenția ta.", code: "not_found" };
      }
      return {
        ok: true,
        capability,
        data: {
          id: data.id,
          opportunityScore: data.opportunity_score,
          relevanceScore: data.relevance_score,
          breakdown: data.score_breakdown,
          note: "Scorul este determinist și nu este o evaluare de piață (ACP).",
        },
        summary: `Scor ${data.opportunity_score}/100`,
        sources: [{ type: "prospect", id: data.id, label: String(data.title) }],
      };
    }

    /* --------- Acțiuni: doar cu aprobare umană explicită, cu audit. --------- */
    case "create_prospect": {
      if (!options.approvalGranted) return denied(actor, name);
      const title = String(args["title"]);
      const normalized = normalizeProspect({
        sourceKey: "manual",
        externalId: null,
        url: typeof args["sourceUrl"] === "string" ? args["sourceUrl"] : null,
        title,
        description: typeof args["description"] === "string" ? args["description"] : null,
        fields: {
          city: args["city"],
          price: args["price"],
          rooms: args["rooms"],
          surfaceUseful: args["surfaceUseful"],
          sellerPhone: args["sellerPhone"],
        },
        fetchedAt: new Date().toISOString(),
      });
      const score = scoreProspect(normalized, emptyCriteria());
      const { data, error } = await admin
        .from("prospects")
        .insert({
          organization_id: org,
          title: normalized.title,
          description: normalized.description,
          source_url: normalized.sourceUrl,
          canonical_url: normalized.canonicalUrl,
          city: normalized.city,
          price: normalized.price,
          currency: normalized.currency,
          rooms: normalized.rooms,
          surface_useful: normalized.surfaceUseful,
          seller_phone: normalized.sellerPhone,
          seller_type: normalized.sellerType,
          seller_confidence: normalized.sellerConfidence,
          content_hash: normalized.contentHash,
          normalized_hash: normalized.normalizedHash,
          opportunity_score: score.score,
          relevance_score: score.relevance,
          score_breakdown: score as never,
          extraction_confidence: normalized.extractionConfidence,
          status: "new",
        })
        .select("id,title")
        .single();
      if (error || !data) {
        console.error("[prospecting] create_prospect failed", error?.message);
        return { ok: false, error: "Oportunitatea nu a putut fi creată.", code: "failed" };
      }
      return {
        ok: true,
        capability,
        data: { id: data.id, opportunityScore: score.score },
        summary: "Oportunitate creată",
        sources: [{ type: "prospect", id: data.id, label: String(data.title) }],
      };
    }
    case "approve_prospect":
    case "reject_prospect": {
      if (!options.approvalGranted) return denied(actor, name);
      const approved = name === "approve_prospect";
      const prospectId = String(args["prospectId"]);
      const { data, error } = await admin
        .from("prospects")
        .update({ status: approved ? "approved" : "rejected", updated_at: new Date().toISOString() })
        .eq("id", prospectId)
        .eq("organization_id", org)
        .select("id,title")
        .maybeSingle();
      if (error) {
        console.error("[prospecting] review failed", error.message);
        return { ok: false, error: "Decizia nu a putut fi salvată.", code: "failed" };
      }
      if (!data) {
        return { ok: false, error: "Oportunitatea nu există în agenția ta.", code: "not_found" };
      }
      await admin.from("prospect_reviews").insert({
        organization_id: org,
        prospect_id: prospectId,
        reviewer_id: actor.userId,
        decision: approved ? "approved" : "rejected",
        notes: typeof args["notes"] === "string" ? args["notes"] : null,
      });
      await logProspectingAudit({
        organizationId: org,
        actorId: actor.userId,
        action: approved
          ? PROSPECTING_AUDIT_ACTIONS.prospectApproved
          : PROSPECTING_AUDIT_ACTIONS.prospectRejected,
        entityId: prospectId,
      });
      return {
        ok: true,
        capability,
        data: { id: data.id, status: approved ? "approved" : "rejected" },
        summary: approved ? "Oportunitate aprobată" : "Oportunitate respinsă",
        sources: [{ type: "prospect", id: data.id, label: String(data.title) }],
      };
    }
    case "import_prospect_to_crm":
    case "link_prospect_to_existing_contact": {
      if (!options.approvalGranted) return denied(actor, name);
      const prospectId = String(args["prospectId"]);
      const result = await importProspectToCrm(actor, prospectId, {
        linkContactId:
          name === "link_prospect_to_existing_contact" ? String(args["contactId"]) : null,
      });
      if (!result.ok) {
        return {
          ok: false,
          error: result.message,
          code: result.code === "not_found" ? "not_found" : "failed",
          details: {
            reason: result.code,
            ...(result.existingContact ? { existingContact: result.existingContact } : {}),
          },
        };
      }
      await logProspectingAudit({
        organizationId: org,
        actorId: actor.userId,
        action:
          name === "link_prospect_to_existing_contact"
            ? PROSPECTING_AUDIT_ACTIONS.prospectLinked
            : PROSPECTING_AUDIT_ACTIONS.prospectImported,
        entityId: prospectId,
        details: { leadId: result.leadId, status: result.status },
      });
      return {
        ok: true,
        capability,
        data: { leadId: result.leadId, contactId: result.contactId, status: result.status },
        summary: result.message,
        sources: [{ type: "lead", id: result.leadId, label: "Lead nou din prospectare" }],
      };
    }
    default:
      return { ok: false, error: "Instrumentul cerut nu există.", code: "denied" };
  }
}

async function denied(actor: AiActor, name: string): Promise<AiToolExecution> {
  await logProspectingAudit({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: PROSPECTING_AUDIT_ACTIONS.actionDenied,
    details: { tool: name, reason: "approval_required" },
  });
  return {
    ok: false,
    error: "Această acțiune modifică datele CRM și necesită aprobarea ta explicită.",
    code: "denied",
  };
}

export { normalizePhone };
