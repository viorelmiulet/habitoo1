/**
 * Server functions pentru Prospecting (Stage 13).
 *
 * Interfața nu vorbește niciodată cu sursele, cu providerul AI sau cu baza de
 * date: trimite doar intenția aici. Actorul (utilizator, agenție, rol) este
 * reconstruit server-side, deci un ID din altă agenție nu deschide nimic.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import type { AiActor, AiRole } from "@/lib/ai/gateway/types";
import { PROSPECTING_AUDIT_ACTIONS, logProspectingAudit } from "./audit";
import { listProspectingProviders, resolveProspectingProvider } from "./providers/registry.server";
import type { ProspectSellerType, ProspectStatus } from "./types";

type AuthContext = { userId: string };

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function resolveActor(userId: string): Promise<AiActor | null> {
  const admin = await loadAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.organization_id) return null;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const list = (roles ?? []).map((row) => String(row.role));
  const role: AiRole = list.includes("superadmin")
    ? "superadmin"
    : list.includes("admin")
      ? "admin"
      : "agent";
  return { userId, organizationId: profile.organization_id, role };
}

export type ProspectingSourceView = {
  id: string;
  name: string;
  sourceType: string;
  providerKey: string;
  enabled: boolean;
  global: boolean;
  implemented: boolean;
  live: boolean;
  availability: ProspectingProviderAvailability;
  capabilities: string[];
  fixture: boolean;
  lastRunAt: string | null;
  lastItemsFound: number | null;
};

/** Sursele agenției plus sursele globale, cu starea reală a integrării. */
export const listProspectingSources = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<ProspectingSourceView[]> => {
    const actor = await resolveActor((context as AuthContext).userId);
    if (!actor) return [];
    const admin = await loadAdmin();
    const { data } = await admin
      .from("prospecting_sources")
      .select("id,name,source_type,provider_key,enabled,organization_id,configuration")
      .or(`organization_id.eq.${actor.organizationId},organization_id.is.null`)
      .order("name");
    const providers = new Map(listProspectingProviders().map((item) => [item.key, item]));
    const { data: lastRun } = await admin
      .from("prospecting_runs")
      .select("created_at,items_found")
      .eq("organization_id", actor.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      sourceType: row.source_type,
      providerKey: row.provider_key,
      enabled: row.enabled,
      global: row.organization_id === null,
      implemented: resolveProspectingProvider(row.provider_key) !== null,
      live: providers.get(row.provider_key)?.live ?? false,
      availability: providers.get(row.provider_key)?.availability ?? "unavailable",
      capabilities: [...(providers.get(row.provider_key)?.capabilities ?? [])],
      lastRunAt: lastRun?.created_at ?? null,
      lastItemsFound: lastRun?.items_found ?? null,
      fixture:
        typeof row.configuration === "object" &&
        row.configuration !== null &&
        (row.configuration as Record<string, unknown>)["fixture"] === true,
    }));
  });

export type ProspectingSearchView = {
  id: string;
  name: string;
  status: string;
  city: string | null;
  county: string | null;
  transactionType: string | null;
  propertyType: string | null;
  createdAt: string;
};

const createSearchSchema = z.object({
  name: z.string().min(3).max(120),
  transactionType: z.enum(["sale", "rent"]).nullable().optional(),
  propertyType: z.string().max(60).nullable().optional(),
  county: z.string().max(80).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  zone: z.string().max(80).nullable().optional(),
  priceMin: z.number().nonnegative().nullable().optional(),
  priceMax: z.number().nonnegative().nullable().optional(),
  roomsMin: z.number().int().min(1).max(30).nullable().optional(),
  roomsMax: z.number().int().min(1).max(30).nullable().optional(),
  surfaceMin: z.number().positive().nullable().optional(),
  surfaceMax: z.number().positive().nullable().optional(),
  keywords: z.array(z.string().max(60)).max(10).optional(),
  sourceIds: z.array(z.string().uuid()).max(20).optional(),
});

/** Creează o căutare de prospectare. Nu pornește nicio colectare. */
export const createProspectingSearch = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => createSearchSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; id?: string; message?: string }> => {
    const actor = await resolveActor((context as AuthContext).userId);
    if (!actor) {
      return { ok: false, message: "Prospectarea este disponibilă doar utilizatorilor unei agenții." };
    }
    const admin = await loadAdmin();
    const { data: created, error } = await admin
      .from("prospecting_searches")
      .insert({
        organization_id: actor.organizationId,
        created_by: actor.userId,
        name: data.name,
        transaction_type: data.transactionType ?? null,
        property_type: data.propertyType ?? null,
        county: data.county ?? null,
        city: data.city ?? null,
        zone: data.zone ?? null,
        price_min: data.priceMin ?? null,
        price_max: data.priceMax ?? null,
        rooms_min: data.roomsMin ?? null,
        rooms_max: data.roomsMax ?? null,
        surface_min: data.surfaceMin ?? null,
        surface_max: data.surfaceMax ?? null,
        keywords: data.keywords ?? [],
        source_ids: data.sourceIds ?? [],
        status: "draft",
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("[prospecting] search insert failed", error?.message);
      return { ok: false, message: "Căutarea nu a putut fi salvată." };
    }
    await logProspectingAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: PROSPECTING_AUDIT_ACTIONS.searchCreated,
      entityId: created.id,
      details: { name: data.name },
    });
    return { ok: true, id: created.id };
  });

export const listProspectingSearches = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<ProspectingSearchView[]> => {
    const actor = await resolveActor((context as AuthContext).userId);
    if (!actor) return [];
    const admin = await loadAdmin();
    const { data } = await admin
      .from("prospecting_searches")
      .select("id,name,status,city,county,transaction_type,property_type,created_at")
      .eq("organization_id", actor.organizationId)
      .order("created_at", { ascending: false })
      .limit(30);
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      city: row.city,
      county: row.county,
      transactionType: row.transaction_type,
      propertyType: row.property_type,
      createdAt: row.created_at,
    }));
  });

export type ProspectView = {
  id: string;
  title: string;
  city: string | null;
  zone: string | null;
  price: number | null;
  currency: string | null;
  rooms: number | null;
  surfaceUseful: number | null;
  sellerType: ProspectSellerType;
  sellerConfidence: number | null;
  sellerPhone: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  status: ProspectStatus;
  opportunityScore: number;
  relevanceScore: number;
  reasons: string[];
  duplicateGroupId: string | null;
  duplicateCount: number;
  publishedAt: string | null;
  createdAt: string;
  fixture: boolean;
};

const listProspectsSchema = z.object({
  status: z
    .enum(["new", "reviewed", "approved", "imported", "rejected", "duplicate", "expired", "error"])
    .nullable()
    .optional(),
  sellerType: z.enum(["unknown", "private", "agency", "developer"]).nullable().optional(),
  minScore: z.number().min(0).max(100).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  runId: z.string().uuid().nullable().optional(),
});

/** Oportunitățile agenției, cu explicația scorului. Telefonul rămâne PII intern. */
export const listProspects = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => listProspectsSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<ProspectView[]> => {
    const actor = await resolveActor((context as AuthContext).userId);
    if (!actor) return [];
    const admin = await loadAdmin();
    let query = admin
      .from("prospects")
      .select(
        "id,title,city,zone,price,currency,rooms,surface_useful,seller_type,seller_confidence,seller_phone,source_url,status,opportunity_score,relevance_score,score_breakdown,duplicate_group_id,published_at,created_at,raw_metadata,source_id",
      )
      .eq("organization_id", actor.organizationId)
      .order("opportunity_score", { ascending: false })
      .limit(100);
    if (data.status) query = query.eq("status", data.status);
    if (data.sellerType) query = query.eq("seller_type", data.sellerType);
    if (typeof data.minScore === "number") query = query.gte("opportunity_score", data.minScore);
    if (data.city) query = query.ilike("city", `%${data.city}%`);
    if (data.runId) query = query.eq("run_id", data.runId);

    const { data: rows } = await query;
    const list = rows ?? [];

    const sourceIds = [...new Set(list.map((row) => row.source_id).filter(Boolean))] as string[];
    const sourceNames = new Map<string, string>();
    if (sourceIds.length > 0) {
      const { data: sources } = await admin
        .from("prospecting_sources")
        .select("id,name")
        .in("id", sourceIds);
      for (const source of sources ?? []) sourceNames.set(source.id, source.name);
    }

    const groupIds = [...new Set(list.map((row) => row.duplicate_group_id).filter(Boolean))] as string[];
    const groupCounts = new Map<string, number>();
    if (groupIds.length > 0) {
      const { data: group } = await admin
        .from("prospects")
        .select("duplicate_group_id")
        .eq("organization_id", actor.organizationId)
        .in("duplicate_group_id", groupIds);
      for (const row of group ?? []) {
        const key = String(row.duplicate_group_id);
        groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
      }
    }

    return list.map((row) => {
      const breakdown = (row.score_breakdown ?? {}) as {
        breakdown?: { label: string; points: number; detail: string }[];
      };
      const reasons = (breakdown.breakdown ?? [])
        .filter((factor) => factor.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, 3)
        .map((factor) => `${factor.label}: ${factor.detail}`);
      const meta = (row.raw_metadata ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        title: row.title,
        city: row.city,
        zone: row.zone,
        price: row.price === null ? null : Number(row.price),
        currency: row.currency,
        rooms: row.rooms,
        surfaceUseful: row.surface_useful === null ? null : Number(row.surface_useful),
        sellerType: row.seller_type as ProspectSellerType,
        sellerConfidence: row.seller_confidence === null ? null : Number(row.seller_confidence),
        sellerPhone: row.seller_phone,
        sourceUrl: row.source_url,
        sourceName: row.source_id ? (sourceNames.get(row.source_id) ?? null) : null,
        status: row.status as ProspectStatus,
        opportunityScore: row.opportunity_score,
        relevanceScore: row.relevance_score,
        reasons,
        duplicateGroupId: row.duplicate_group_id,
        duplicateCount: row.duplicate_group_id
          ? (groupCounts.get(row.duplicate_group_id) ?? 1)
          : 0,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        fixture: meta["fixture"] === true,
      };
    });
  });

export type ProspectingRun = import("./runtime.server").ProspectingRunView;

export type ProspectingRunResult =
  | { ok: true; run: ProspectingRun }
  | { ok: false; message: string };

/** Pornește fluxul de prospectare; se oprește la aprobarea umană. */
export const startProspecting = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ searchId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ProspectingRunResult> => {
    const actor = await resolveActor((context as AuthContext).userId);
    if (!actor) {
      return { ok: false, message: "Prospectarea este disponibilă doar utilizatorilor unei agenții." };
    }
    const { startProspectingWorkflow } = await import("./runtime.server");
    return startProspectingWorkflow(actor, data.searchId);
  });

/** Reia fluxul suspendat cu deciziile umane și importă doar ce a fost aprobat. */
export const resumeProspecting = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        runId: z.string().uuid(),
        approvedIds: z.array(z.string().uuid()).max(100),
        rejectedIds: z.array(z.string().uuid()).max(100),
        importApproved: z.boolean(),
      })
      .parse(data),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<ProspectingRunResult & { imported?: number }> => {
      const actor = await resolveActor((context as AuthContext).userId);
      if (!actor) {
        return {
          ok: false,
          message: "Prospectarea este disponibilă doar utilizatorilor unei agenții.",
        };
      }
      const { resumeProspectingWorkflow } = await import("./runtime.server");
      return resumeProspectingWorkflow(actor, data.runId, {
        approvedIds: data.approvedIds,
        rejectedIds: data.rejectedIds,
        importApproved: data.importApproved,
      });
    },
  );

export const listProspectingRuns = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<ProspectingRun[]> => {
    const actor = await resolveActor((context as AuthContext).userId);
    if (!actor) return [];
    const { listProspectingWorkflowRuns } = await import("./runtime.server");
    return listProspectingWorkflowRuns(actor);
  });

export type ProspectImportOutcome = {
  ok: boolean;
  message: string;
  leadId?: string | null;
  needsLink?: { id: string; name: string } | null;
};

/**
 * Import individual în CRM. Rulează prin tool-ul de acțiune, cu aprobarea
 * explicită a utilizatorului (apăsarea butonului de import este aprobarea).
 */
export const importProspect = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        prospectId: z.string().uuid(),
        linkContactId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<ProspectImportOutcome> => {
    const actor = await resolveActor((context as AuthContext).userId);
    if (!actor) {
      return { ok: false, message: "Prospectarea este disponibilă doar utilizatorilor unei agenții." };
    }
    const { importProspectToCrm } = await import("./import.server");
    const result = await importProspectToCrm(actor, data.prospectId, {
      linkContactId: data.linkContactId ?? null,
    });
    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        needsLink: result.existingContact
          ? { id: result.existingContact.id, name: result.existingContact.name }
          : null,
      };
    }
    await logProspectingAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: data.linkContactId
        ? PROSPECTING_AUDIT_ACTIONS.prospectLinked
        : PROSPECTING_AUDIT_ACTIONS.prospectImported,
      entityId: data.prospectId,
      details: { leadId: result.leadId, status: result.status },
    });
    return { ok: true, message: result.message, leadId: result.leadId };
  });

/** Decizie individuală de aprobare/respingere, direct din listă. */
export const reviewProspect = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        prospectId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().max(500).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const actor = await resolveActor((context as AuthContext).userId);
    if (!actor) {
      return { ok: false, message: "Prospectarea este disponibilă doar utilizatorilor unei agenții." };
    }
    const { executeAiTool } = await import("@/lib/ai/tools/executors.server");
    const result = await executeAiTool(
      actor,
      data.decision === "approved" ? "approve_prospect" : "reject_prospect",
      { prospectId: data.prospectId, notes: data.notes ?? undefined },
      // Apăsarea butonului în interfață ESTE aprobarea umană explicită.
      { approvalGranted: true },
    );
    return result.ok
      ? { ok: true, message: result.summary }
      : { ok: false, message: result.error };
  });
