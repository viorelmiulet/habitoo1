/**
 * Etapa 6 ACP: integrarea ACP în fluxul de lucru al proprietății.
 *
 * `getPropertyAcpWorkflow` citește starea ACP a unei proprietăți fără să
 * recalculeze nimic (folosește ultima versiune și snapshot-ul ei).
 * `applyAcpRecommendedPrice` aplică manual prețul recomandat, doar la cererea
 * explicită a utilizatorului, cu audit.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { acpPriceComparison, acpWorkflowStatus, type AcpWorkflowStatus } from "./workflow";
import type { AcpPriceComparison } from "./workflow";

export const ACP_PRICE_APPLY_RATE_LIMITS = {
  perUser: { limit: 20, windowSeconds: 3600 },
  perOrganization: { limit: 60, windowSeconds: 3600 },
} as const;

export const ACP_WORKFLOW_AUDIT_ACTIONS = {
  priceApplied: "acp.price.applied",
} as const;

type AuthContext = { userId: string };
type Actor = { userId: string; organizationId: string };

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadActor(context: AuthContext): Promise<Actor> {
  const admin = await loadAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  const organizationId = profile?.organization_id ?? null;
  if (!organizationId) {
    throw new Error("Analizele ACP sunt disponibile doar utilizatorilor unei agenții.");
  }
  return { userId: context.userId, organizationId };
}

async function writeAudit(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  params: {
    organizationId: string;
    actorId: string;
    action: string;
    entity: string;
    entityId: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
  },
) {
  try {
    await admin.from("audit_logs").insert({
      organization_id: params.organizationId,
      actor_id: params.actorId,
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId,
      old_values: (params.oldValues ?? null) as never,
      new_values: (params.newValues ?? null) as never,
    } as never);
  } catch {
    /* audit best-effort */
  }
}

type AnalysisRow = {
  id: string;
  organization_id: string;
  property_id: string | null;
  title: string;
  status: string | null;
  error_message: string | null;
  version: number | null;
  root_analysis_id: string | null;
  snapshot_at: string | null;
  last_run_at: string | null;
  created_at: string;
  sources: unknown;
  comparables_count: number | null;
  comparables_used: number | null;
  confidence_score: number | null;
  estimated_min: number | null;
  estimated_value: number | null;
  estimated_max: number | null;
  recommended_listing_price: number | null;
  median_price_per_sqm: number | null;
  average_price_per_sqm: number | null;
  ai_summary: string | null;
  ai_model: string | null;
  ai_generated_at: string | null;
};

export type PropertyAcpWorkflow = {
  property: {
    id: string;
    title: string;
    reference: string | null;
    price: number | null;
    currency: string;
    transactionKind: string | null;
  };
  status: AcpWorkflowStatus;
  analysis: {
    id: string;
    rootAnalysisId: string;
    title: string;
    version: number;
    versionsCount: number;
    lastRunAt: string | null;
    snapshotAt: string | null;
    createdAt: string;
    errorMessage: string | null;
    comparablesCount: number;
    comparablesUsed: number;
    confidenceScore: number | null;
    estimatedMin: number | null;
    estimatedValue: number | null;
    estimatedMax: number | null;
    recommendedListingPrice: number | null;
    medianPricePerSqm: number | null;
    averagePricePerSqm: number | null;
    sources: string[];
    ai: { model: string | null; generatedAt: string | null; summary: string | null } | null;
  } | null;
  price: AcpPriceComparison;
  report: {
    id: string;
    analysisId: string;
    analysisVersion: number;
    status: string;
    generatedAt: string | null;
    hasFile: boolean;
  } | null;
};

/** Starea ACP a unei proprietăți, fără recalculare. */
export const getPropertyAcpWorkflow = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ propertyId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<PropertyAcpWorkflow> => {
    const actor = await loadActor(context as AuthContext);
    const admin = await loadAdmin();

    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("id,title,reference,price,currency,transaction_kind,organization_id")
      .eq("id", data.propertyId)
      .eq("organization_id", actor.organizationId)
      .maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) throw new Error("Proprietatea nu a fost găsită în agenția ta.");

    const propertyView = {
      id: property.id,
      title: property.title,
      reference: property.reference ?? null,
      price: property.price ?? null,
      currency: property.currency ?? "EUR",
      transactionKind: property.transaction_kind ?? null,
    };

    const { data: rows, error: analysisError } = await admin
      .from("acp_analyses")
      .select("*")
      .eq("organization_id", actor.organizationId)
      .eq("property_id", data.propertyId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (analysisError) throw analysisError;
    const latest = ((rows ?? [])[0] ?? null) as AnalysisRow | null;

    if (!latest) {
      return {
        property: propertyView,
        status: "none",
        analysis: null,
        price: acpPriceComparison({
          currentPrice: propertyView.price,
          recommendedPrice: null,
          currency: propertyView.currency,
        }),
        report: null,
      };
    }

    const rootId = latest.root_analysis_id ?? latest.id;
    const { count: versionsCount } = await admin
      .from("acp_analyses")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", actor.organizationId)
      .or(`root_analysis_id.eq.${rootId},id.eq.${rootId}`);

    const { data: reportRows } = await admin
      .from("acp_reports")
      .select("id,analysis_id,analysis_version,status,generated_at,pdf_path")
      .eq("organization_id", actor.organizationId)
      .eq("analysis_id", latest.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const report = (reportRows ?? [])[0] ?? null;

    const sources = Object.entries((latest.sources as Record<string, boolean> | null) ?? {})
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    const status = acpWorkflowStatus({
      status: latest.status,
      errorMessage: latest.error_message,
      comparablesUsed: latest.comparables_used,
      estimatedValue: latest.estimated_value,
    });

    return {
      property: propertyView,
      status,
      analysis: {
        id: latest.id,
        rootAnalysisId: rootId,
        title: latest.title,
        version: latest.version ?? 1,
        versionsCount: versionsCount ?? 1,
        lastRunAt: latest.last_run_at ?? null,
        snapshotAt: latest.snapshot_at ?? null,
        createdAt: latest.created_at,
        errorMessage: latest.error_message ?? null,
        comparablesCount: latest.comparables_count ?? 0,
        comparablesUsed: latest.comparables_used ?? 0,
        confidenceScore: latest.confidence_score ?? null,
        estimatedMin: latest.estimated_min ?? null,
        estimatedValue: latest.estimated_value ?? null,
        estimatedMax: latest.estimated_max ?? null,
        recommendedListingPrice: latest.recommended_listing_price ?? null,
        medianPricePerSqm: latest.median_price_per_sqm ?? null,
        averagePricePerSqm: latest.average_price_per_sqm ?? null,
        sources,
        ai: latest.ai_generated_at
          ? {
              model: latest.ai_model ?? null,
              generatedAt: latest.ai_generated_at ?? null,
              summary: latest.ai_summary ?? null,
            }
          : null,
      },
      price: acpPriceComparison({
        currentPrice: propertyView.price,
        // Prețul recomandat rămâne cel determinist al versiunii; AI-ul nu îl atinge.
        recommendedPrice: status === "completed" ? latest.recommended_listing_price : null,
        currency: propertyView.currency,
      }),
      report: report
        ? {
            id: report.id,
            analysisId: report.analysis_id,
            analysisVersion: Number(report.analysis_version ?? 1),
            status: String(report.status ?? "ready"),
            generatedAt: report.generated_at ?? null,
            hasFile: Boolean(report.pdf_path),
          }
        : null,
    };
  });

/**
 * Aplică manual prețul recomandat ACP pe proprietate. `confirm` trebuie să fie
 * exact `true`: fără confirmarea explicită a utilizatorului nu se schimbă nimic.
 */
export const applyAcpRecommendedPrice = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ analysisId: z.string().uuid(), confirm: z.literal(true) })
      .parse(data),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      ok: true;
      propertyId: string;
      previousPrice: number | null;
      newPrice: number;
      currency: string;
    }> => {
      const actor = await loadActor(context as AuthContext);
      const admin = await loadAdmin();

      for (const [bucket, config] of [
        [`acp_price:user:${actor.userId}`, ACP_PRICE_APPLY_RATE_LIMITS.perUser],
        [`acp_price:org:${actor.organizationId}`, ACP_PRICE_APPLY_RATE_LIMITS.perOrganization],
      ] as const) {
        const { data: allowed } = await admin.rpc("rate_limit_hit", {
          _bucket: bucket,
          _limit: config.limit,
          _window_seconds: config.windowSeconds,
        });
        if (allowed === false) {
          throw new Error("Prea multe actualizări de preț în ultima oră. Încearcă mai târziu.");
        }
      }

      const { data: analysis, error } = await admin
        .from("acp_analyses")
        .select("*")
        .eq("id", data.analysisId)
        .eq("organization_id", actor.organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!analysis) throw new Error("Analiza nu a fost găsită în agenția ta.");
      const row = analysis as unknown as AnalysisRow;

      const status = acpWorkflowStatus({
        status: row.status,
        errorMessage: row.error_message,
        comparablesUsed: row.comparables_used,
        estimatedValue: row.estimated_value,
      });
      const recommended = row.recommended_listing_price;
      if (status !== "completed" || !recommended || !Number.isFinite(Number(recommended))) {
        throw new Error("Analiza nu are un preț recomandat care poate fi aplicat.");
      }
      if (!row.property_id) {
        throw new Error("Analiza nu este legată de o proprietate.");
      }

      const { data: property, error: propertyError } = await admin
        .from("properties")
        .select("id,price,currency,transaction_kind,for_sale,for_rent")
        .eq("id", row.property_id)
        .eq("organization_id", actor.organizationId)
        .maybeSingle();
      if (propertyError) throw propertyError;
      if (!property) throw new Error("Proprietatea nu a fost găsită în agenția ta.");

      const newPrice = Math.round(Number(recommended));
      const currency = property.currency ?? "EUR";
      const isRent = property.transaction_kind === "rent";
      const update: Record<string, unknown> = { price: newPrice };
      if (isRent) update["rent_price"] = newPrice;
      else update["sale_price"] = newPrice;

      const { error: updateError } = await admin
        .from("properties")
        .update(update as never)
        .eq("id", property.id)
        .eq("organization_id", actor.organizationId);
      if (updateError) throw updateError;

      await writeAudit(admin, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: ACP_WORKFLOW_AUDIT_ACTIONS.priceApplied,
        entity: "property",
        entityId: property.id,
        oldValues: { price: property.price ?? null },
        newValues: {
          price: newPrice,
          currency,
          analysisId: row.id,
          analysisVersion: row.version ?? 1,
          snapshotAt: row.snapshot_at ?? null,
        },
      });

      return {
        ok: true,
        propertyId: property.id,
        previousPrice: property.price ?? null,
        newPrice,
        currency,
      };
    },
  );
