/**
 * Faza 3, Etapa 3 ACP: raportul profesional PDF.
 *
 * Raportul se leagă de o versiune ACP concretă (`acp_reports.analysis_id` =
 * rândul acelei versiuni) și este construit exclusiv din snapshot-ul versiunii:
 * `acp_analyses` + `acp_comparables` + `acp_analysis_sources`. Modelul complet
 * este salvat în `acp_reports.report_data`, deci raportul rămâne reproductibil
 * chiar dacă `market_listings` se schimbă ulterior.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { ACP_AUDIT_ACTIONS, logAcpAudit } from "./audit";
import { acpDbError, acpError, acpSafeMessage } from "./safe-error";
import { readStoredAcpAiInsight } from "./ai/schema";
import {
  assertReportOrganization,
  buildAcpReportModel,
  type AcpReportMarketInput,
  type AcpReportPrecisionInput,
  reportEligibility,
  type AcpReportAdjustment,
  type AcpReportModel,
  type AcpReportVersionInput,
  type AcpReportComparableInput,

} from "./report/model";

import type { AcpReportExtras } from "./engine";
import { marketListingPhotoUrls, reportDescriptionExcerpt } from "./report/photos";

export const ACP_REPORTS_BUCKET = "acp-reports";

export const ACP_REPORT_RATE_LIMITS = {
  perUser: { limit: 20, windowSeconds: 3600 },
  perOrganization: { limit: 60, windowSeconds: 3600 },
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
    throw acpError("Rapoartele ACP sunt disponibile doar utilizatorilor unei agenții.");
  }
  return { userId: context.userId, organizationId };
}

async function enforceReportRateLimit(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
) {
  for (const [bucket, config] of [
    [`acp_report:user:${actor.userId}`, ACP_REPORT_RATE_LIMITS.perUser],
    [`acp_report:org:${actor.organizationId}`, ACP_REPORT_RATE_LIMITS.perOrganization],
  ] as const) {
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      _bucket: bucket,
      _limit: config.limit,
      _window_seconds: config.windowSeconds,
    });
    if (allowed === false) {
      throw acpError("Prea multe rapoarte generate în ultima oră. Încearcă din nou mai târziu.");
    }
  }
}

/**
 * Calitatea datelor și calibrarea salvate în snapshot-ul versiunii (Stage 7).
 * Versiunile mai vechi nu le au: raportul lor rămâne exact cum era.
 */
function precisionFrom(data: {
  quality?: {
    score?: number;
    level?: string;
    factors?: { label?: string; score?: number; note?: string }[];
    reasons?: string[];
  } | null;
  advanced?: Record<string, unknown> | null;
}): AcpReportPrecisionInput | null {
  const q = data.quality ?? null;
  const a = data.advanced ?? null;
  if (!q && !a) return null;
  const numberOr = (value: unknown, fallback: number | null): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return {
    quality: q
      ? {
          score: numberOr(q.score, 0) ?? 0,
          level: typeof q.level === "string" ? q.level : "medium",
          factors: (q.factors ?? []).map((f) => ({
            label: typeof f.label === "string" ? f.label : "—",
            score: numberOr(f.score, 0) ?? 0,
            note: typeof f.note === "string" ? f.note : "",
          })),
          reasons: (q.reasons ?? []).filter((r): r is string => typeof r === "string"),
        }
      : null,
    calibration: a
      ? {
          applied: a["applied"] === true,
          status: typeof a["calibrationStatus"] === "string" ? a["calibrationStatus"] : "not_configured",
          factor: numberOr(a["factor"], 1) ?? 1,
          source: typeof a["source"] === "string" ? a["source"] : "none",
          segmentKey: typeof a["segmentKey"] === "string" ? a["segmentKey"] : null,
          sampleSize: numberOr(a["sampleSize"], 0) ?? 0,
          version: numberOr(a["calibrationVersion"], null),
          calibratedAt: typeof a["calibratedAt"] === "string" ? a["calibratedAt"] : null,
          baselineValue: numberOr(a["baselineValue"], null),
          calibratedValue: numberOr(a["calibratedValue"], null),
          deltaPercent: numberOr(a["deltaPercent"], null),
          reason: typeof a["reason"] === "string" ? a["reason"] : "",
        }
      : null,
  };
}

function adjustmentsFrom(value: unknown): AcpReportAdjustment[] {
  if (!Array.isArray(value)) return [];
  const out: AcpReportAdjustment[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const amount = typeof row["amount"] === "number" ? row["amount"] : null;
    if (amount === null || !Number.isFinite(amount)) continue;
    out.push({
      label: typeof row["label"] === "string" ? row["label"] : String(row["factor"] ?? "Ajustare"),
      basis: typeof row["basis"] === "string" ? row["basis"] : "",
      amount,
      factor: typeof row["factor"] === "string" ? row["factor"] : null,
    });
  }
  return out;
}

const MEDIA_BUCKET = "property-media";

async function signPaths(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  paths: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data } = await admin.storage.from(MEDIA_BUCKET).createSignedUrls(unique, 60 * 30);
  for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}

/**
 * Pozele comparabilelor pentru raport: întâi cele salvate în snapshot; pentru
 * versiunile vechi, poza proprietății (`image_path`) sau pozele anunțului din
 * piață, dacă mai există. Doar pozele se completează — cifrele nu.
 */
async function comparablePhotos(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  rows: { id: string; image_path?: string | null; market_listing_id?: string | null; snapshot?: unknown }[],
): Promise<Map<string, string[]>> {
  const plan = new Map<string, { urls: string[]; paths: string[]; listingId: string | null }>();
  const listingIds: string[] = [];
  for (const r of rows) {
    const extras = ((r.snapshot ?? {}) as { report?: AcpReportExtras | null }).report ?? null;
    const urls = (extras?.photos ?? []).slice(0, 3);
    const paths = (extras?.photoPaths ?? (r.image_path ? [r.image_path] : [])).slice(0, 3);
    const legacyListing = !extras && r.market_listing_id ? r.market_listing_id : null;
    if (legacyListing) listingIds.push(legacyListing);
    plan.set(r.id, { urls, paths, listingId: legacyListing });
  }
  const legacy = new Map<string, string[]>();
  for (let i = 0; i < listingIds.length; i += 200) {
    const { data } = await admin
      .from("market_listings")
      .select("id,images,image_url")
      .in("id", listingIds.slice(i, i + 200));
    for (const l of data ?? []) legacy.set(l.id, marketListingPhotoUrls(l as never));
  }
  const signed = await signPaths(admin, [...plan.values()].flatMap((p) => p.paths));
  const out = new Map<string, string[]>();
  for (const [id, p] of plan) {
    const list = [
      ...p.urls,
      ...p.paths.map((path) => signed.get(path)).filter((u): u is string => Boolean(u)),
      ...(p.listingId ? (legacy.get(p.listingId) ?? []) : []),
    ];
    out.set(id, list.slice(0, 3));
  }
  return out;
}

/** Pozele publicabile ale proprietății analizate (max 3) și un fragment din descriere. */
async function targetPhotos(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  propertyId: string | null,
): Promise<{ photos: string[]; description: string | null }> {
  if (!propertyId) return { photos: [], description: null };
  const [{ data: imgs }, { data: prop }] = await Promise.all([
    admin
      .from("property_images")
      .select("storage_path,position,is_primary")
      .eq("property_id", propertyId)
      .eq("is_confidential", false)
      .order("is_primary", { ascending: false })
      .order("position", { ascending: true })
      .limit(3),
    admin.from("properties").select("description").eq("id", propertyId).maybeSingle(),
  ]);
  const paths = (imgs ?? []).map((i) => i.storage_path).filter((p): p is string => Boolean(p));
  const signed = await signPaths(admin, paths);
  return {
    photos: paths.map((p) => signed.get(p)).filter((u): u is string => Boolean(u)),
    description: reportDescriptionExcerpt((prop as { description?: string | null } | null)?.description ?? null),
  };
}

/** Reconstruiește datele versiunii din snapshot-ul salvat în baza de date. */
async function loadVersionInput(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
  analysisId: string,
): Promise<{ input: AcpReportVersionInput; rootId: string }> {
  const { data: row, error } = await admin
    .from("acp_analyses")
    .select("*")
    .eq("id", analysisId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Analiza nu a fost găsită în agenția ta.");
  assertReportOrganization(row.organization_id, actor.organizationId);

  const [{ data: comparables }, { data: sources }] = await Promise.all([
    admin
      .from("acp_comparables")
      .select("*")
      .eq("analysis_id", analysisId)
      .order("similarity_score", { ascending: false }),
    admin
      .from("acp_analysis_sources")
      .select("source_type,source_name,items_found,items_used,items_excluded,outcome,outcome_detail")
      .eq("analysis_id", analysisId),
  ]);

  let authorName: string | null = null;
  if (row.created_by) {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", row.created_by)
      .maybeSingle();
    authorName = profile?.full_name ?? null;
  }

  const photosByComparable = await comparablePhotos(admin, comparables ?? []);
  const targetMedia = await targetPhotos(admin, row.property_id ?? null);

  const target = (row.target_data ?? {}) as {
    title?: string;
    reference?: string | null;
    locationLabel?: string | null;
    capturedAt?: string | null;
    subject?: Record<string, unknown>;
  };
  const analysisData = (row.analysis_data ?? {}) as {
    statistics?: AcpReportVersionInput["statistics"];
    estimate?: AcpReportVersionInput["estimate"];
    confidence?: AcpReportVersionInput["confidence"];
    explanation?: unknown;
    targetPricePerSqm?: number | null;
    marketIntelligence?: AcpReportMarketInput | null;
    ai?: { insight?: unknown } | null;
    quality?: {
      score?: number;
      level?: string;
      factors?: { label?: string; score?: number; note?: string }[];
      reasons?: string[];
    } | null;
    advanced?: Record<string, unknown> | null;
    engineVersion?: number | null;
    timeAdjustment?: AcpReportVersionInput["timeAdjustment"];
  };
  const subject = (target.subject ?? {}) as AcpReportVersionInput["target"]["subject"];

  const input: AcpReportVersionInput = {
    analysisId: row.id,
    rootAnalysisId: row.root_analysis_id ?? row.id,
    title: row.title,
    status: row.status,
    errorMessage: row.error_message ?? null,
    version: row.version ?? 1,
    engineVersion: row.engine_version ?? analysisData.engineVersion ?? 1,
    // Motor v2: nota de ajustare în timp, din snapshot-ul versiunii.
    timeAdjustment: analysisData.timeAdjustment ?? null,
    createdAt: row.created_at,
    snapshotAt: row.snapshot_at ?? row.last_run_at ?? row.created_at,
    authorName,
    currency: subject.currency ?? null,
    target: {
      title: target.title ?? row.title,
      reference: target.reference ?? null,
      locationLabel: target.locationLabel ?? null,
      capturedAt: target.capturedAt ?? null,
      pricePerSqm: analysisData.targetPricePerSqm ?? null,
      subject,
      photos: targetMedia.photos,
      description: targetMedia.description,
    },
    estimate: analysisData.estimate ?? {
      estimatedMin: row.estimated_min,
      estimatedValue: row.estimated_value,
      estimatedMax: row.estimated_max,
      recommendedListingPrice: row.recommended_listing_price,
    },
    statistics: analysisData.statistics ?? {
      medianPricePerSqm: row.median_price_per_sqm,
      averagePricePerSqm: row.average_price_per_sqm,
      median: row.price_median,
      average: row.price_average,
      minimum: row.price_min,
      maximum: row.price_max,
      p25: row.price_p25,
      p75: row.price_p75,
    },
    confidence: analysisData.confidence ?? { score: row.confidence_score },
    explanation: Array.isArray(analysisData.explanation)
      ? analysisData.explanation.filter((v): v is string => typeof v === "string")
      : [],
    comparables: (comparables ?? []).map((c) => {
      const snapshot = (c.snapshot ?? {}) as {
        key?: string;
        title?: string;
        locationLabel?: string | null;
        subject?: Record<string, unknown>;
        timeAdjustment?: unknown;
        report?: AcpReportExtras | null;
        priceHistory?: { listedForDays?: number | null } | null;
      };
      const extras = snapshot.report ?? null;
      const media = photosByComparable.get(c.id) ?? [];
      const compSubject = (snapshot.subject ?? {}) as AcpReportVersionInput["target"]["subject"];
      return {
        key: snapshot.key ?? c.id,
        title: snapshot.title ?? "Comparabil",
        sourceType: c.source_type,
        sourceName: c.source_name ?? "",
        locationLabel: snapshot.locationLabel ?? null,
        price: (compSubject.price as number | null | undefined) ?? null,
        adjustedPrice: c.adjusted_price,
        adjustedPricePerSqm: c.adjusted_price_per_sqm,
        similarityScore: c.similarity_score,
        tier: c.tier,
        adjustmentAmount: c.adjustment_amount,
        adjustmentPercent: c.adjustment_percent,
        adjustments: adjustmentsFrom(c.adjustments),
        isOutlier: Boolean(c.is_outlier),
        outlierReason: c.outlier_reason,
        isSelected: Boolean(c.is_selected),
        manualOverride: c.manual_override,
        subject: compSubject,
        timeAdjustment:
          (snapshot.timeAdjustment as AcpReportComparableInput["timeAdjustment"]) ?? null,
        reference: extras?.reference ?? null,
        status:
          extras?.status ??
          (/nu mai e activ/i.test(c.source_name ?? "") ? "inactive" : "active"),
        firstSeenAt: extras?.firstSeenAt ?? null,
        disappearedAt: extras?.disappearedAt ?? null,
        daysOnMarket: extras?.firstSeenAt ? null : (snapshot.priceHistory?.listedForDays ?? null),
        photos: media,
        description: extras?.description ?? null,
      };
    }),
    sources: (sources ?? []).map((s) => ({
      sourceType: s.source_type,
      sourceName: s.source_name ?? "",
      itemsFound: s.items_found ?? 0,
      itemsUsed: s.items_used ?? 0,
      itemsExcluded: s.items_excluded ?? 0,
      outcome: s.outcome ?? null,
      outcomeDetail: s.outcome_detail ?? null,
    })),
    // Interpretarea AI a versiunii, dacă există. Nicio cifră nu depinde de ea.
    ai:
      row.ai_summary || row.ai_model || row.ai_generated_at
        ? {
            summary: row.ai_summary,
            model: row.ai_model,
            generatedAt: row.ai_generated_at,
            sections: readStoredAcpAiInsight(analysisData.ai?.insight ?? null)?.insight ?? null,
          }
        : null,
    // Snapshot-ul de piață al versiunii (Stage 4), dacă a fost salvat la rulare.
    market: analysisData.marketIntelligence ?? null,
    // Calitatea datelor și calibrarea versiunii (Stage 7), dacă au fost salvate.
    precision: precisionFrom(analysisData),
  };

  return { input, rootId: input.rootAnalysisId };
}

export type AcpReportListItem = {
  id: string;
  analysisId: string;
  analysisVersion: number;
  reportNumber: number;
  status: string;
  errorMessage: string | null;
  generatedAt: string | null;
  createdAt: string;
  snapshotAt: string | null;
  fileSizeBytes: number | null;
  hasFile: boolean;
  title: string | null;
};

function toListItem(row: Record<string, unknown>): AcpReportListItem {
  return {
    id: String(row["id"]),
    analysisId: String(row["analysis_id"]),
    analysisVersion: Number(row["analysis_version"] ?? 1),
    reportNumber: Number(row["version"] ?? 1),
    status: String(row["status"] ?? "ready"),
    errorMessage: (row["error_message"] as string | null) ?? null,
    generatedAt: (row["generated_at"] as string | null) ?? null,
    createdAt: String(row["created_at"]),
    snapshotAt: (row["snapshot_at"] as string | null) ?? null,
    fileSizeBytes: (row["file_size_bytes"] as number | null) ?? null,
    hasFile: Boolean(row["pdf_path"]),
    title: (row["title"] as string | null) ?? null,
  };
}

/** Rapoartele generate pentru toată descendența unei analize (root + versiuni). */
export const listAcpReports = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ analysisId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ reports: AcpReportListItem[] }> => {
    const actor = await loadActor(context as AuthContext);
    const admin = await loadAdmin();
    const { data: current, error } = await admin
      .from("acp_analyses")
      .select("id,organization_id,root_analysis_id")
      .eq("id", data.analysisId)
      .maybeSingle();
    if (error) throw error;
    if (!current) throw new Error("Analiza nu a fost găsită în agenția ta.");
    assertReportOrganization(current.organization_id, actor.organizationId);
    const rootId = current.root_analysis_id ?? current.id;

    const { data: rows, error: listError } = await admin
      .from("acp_reports")
      .select("*")
      .eq("organization_id", actor.organizationId)
      .or(`root_analysis_id.eq.${rootId},analysis_id.eq.${data.analysisId}`)
      .order("created_at", { ascending: false });
    if (listError) throw listError;
    return { reports: (rows ?? []).map((r) => toListItem(r as Record<string, unknown>)) };
  });

/** Numărul următor de raport pentru versiunea dată (constrângere unică pe analysis_id+version). */
async function insertReportRow(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
  params: {
    analysisId: string;
    rootId: string;
    analysisVersion: number;
    snapshotAt: string | null;
    title: string;
  },
): Promise<{ id: string; reportNumber: number }> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data: existing, error: existingError } = await admin
      .from("acp_reports")
      .select("version")
      .eq("analysis_id", params.analysisId);
    if (existingError) throw existingError;
    let max = 0;
    for (const row of existing ?? []) {
      const value = Number(row.version ?? 0);
      if (Number.isFinite(value) && value > max) max = Math.trunc(value);
    }
    const reportNumber = max + 1 + attempt;

    const { data: created, error } = await admin
      .from("acp_reports")
      .insert({
        analysis_id: params.analysisId,
        organization_id: actor.organizationId,
        root_analysis_id: params.rootId,
        analysis_version: params.analysisVersion,
        snapshot_at: params.snapshotAt,
        version: reportNumber,
        status: "generating",
        title: params.title,
        generated_by: actor.userId,
        report_data: {} as never,
      })
      .select("id")
      .single();
    if (!error && created) return { id: created.id, reportNumber };
    const code = (error as { code?: string } | null)?.code;
    if (code !== "23505") throw error;
  }
  throw new Error("Nu am putut înregistra raportul. Încearcă din nou.");
}

/**
 * Nucleul generării: încarcă snapshot-ul versiunii, construiește modelul,
 * randează PDF-ul, îl urcă în bucket-ul privat și înregistrează raportul.
 * Exportat separat pentru a putea fi verificat end-to-end pe server.
 */
export async function generateAcpReportForVersion(
  actor: Actor,
  analysisId: string,
  options: { includeAppendix?: boolean } = {},
): Promise<{ report: AcpReportListItem | null; ok: boolean; errorMessage: string | null }> {
  {
    {
      const admin = await loadAdmin();
      const { input, rootId } = await loadVersionInput(admin, actor, analysisId);

      const eligibility = reportEligibility(input);
      if (!eligibility.ok) {
        return { report: null, ok: false, errorMessage: eligibility.reason };
      }
      await enforceReportRateLimit(admin, actor);

      const { data: org } = await admin
        .from("organizations")
        .select(
          "name,legal_name,cui,trade_registry_number,material_address,material_phone,material_email,material_website,phone,email,logo_path",
        )
        .eq("id", actor.organizationId)
        .maybeSingle();
      const generatedBy = await loadGenerator(admin, actor);

      const row = await insertReportRow(admin, actor, {
        analysisId: input.analysisId,
        rootId,
        analysisVersion: input.version,
        snapshotAt: input.snapshotAt,
        title: `Analiză Comparativă de Piață — ${input.target.title}`,
      });

      let model: AcpReportModel;
      try {
        model = buildAcpReportModel({
          version: input,
          reportNumber: row.reportNumber,
          generatedAt: new Date().toISOString(),
          agency: {
            name: org?.name ?? "Agenție imobiliară",
            legalName: org?.legal_name ?? null,
            cui: org?.cui ?? null,
            registry: org?.trade_registry_number ?? null,
            address: org?.material_address ?? null,
            phone: org?.material_phone ?? org?.phone ?? null,
            email: org?.material_email ?? org?.email ?? null,
            website: org?.material_website ?? null,
          },
          includeAppendix: options.includeAppendix === true,
          generatedBy,
        });

        let logo: Uint8Array | null = null;
        if (org?.logo_path && /\.(png|jpe?g)$/i.test(org.logo_path)) {
          try {
            const { data: file } = await admin.storage.from("agency-logos").download(org.logo_path);
            if (file) logo = new Uint8Array(await file.arrayBuffer());
          } catch {
            logo = null;
          }
        }
        const { buildAcpReportPdf } = await import("./report/pdf.server");
        const bytes = await buildAcpReportPdf(model, { logo });
        const path = `${actor.organizationId}/${input.analysisId}/raport-v${input.version}-${row.reportNumber}.pdf`;
        const { error: uploadError } = await admin.storage
          .from(ACP_REPORTS_BUCKET)
          .upload(path, new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), {
            contentType: "application/pdf",
            upsert: true,
          });
        if (uploadError) throw acpDbError("upload report pdf", uploadError, "Raportul nu a putut fi salvat. Încearcă din nou.");

        const { data: updated, error: updateError } = await admin
          .from("acp_reports")
          .update({
            status: "ready",
            pdf_path: path,
            report_data: model as never,
            file_size_bytes: bytes.byteLength,
            generated_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", row.id)
          .select("*")
          .single();
        if (updateError) throw acpDbError("finalize report", updateError, "Raportul nu a putut fi finalizat. Încearcă din nou.");

        await logAcpAudit({
          organizationId: actor.organizationId,
          actorId: actor.userId,
          action: ACP_AUDIT_ACTIONS.reportGenerated,
          analysisId: input.analysisId,
          details: {
            reportId: row.id,
            reportNumber: row.reportNumber,
            analysisVersion: input.version,
            snapshotAt: input.snapshotAt,
          },
        });

        return {
          report: toListItem(updated as unknown as Record<string, unknown>),
          ok: true,
          errorMessage: null,
        };
      } catch (error) {
        const errorMessage = acpSafeMessage(error, "Raportul nu a putut fi generat.");
        await admin
          .from("acp_reports")
          .update({ status: "failed", error_message: errorMessage })
          .eq("id", row.id);
        await logAcpAudit({
          organizationId: actor.organizationId,
          actorId: actor.userId,
          action: ACP_AUDIT_ACTIONS.reportFailed,
          analysisId: input.analysisId,
          details: { reportId: row.id, analysisVersion: input.version },
        });
        return { report: null, ok: false, errorMessage };
      }
    }
  }
}

const ROLE_LABELS: Record<string, string> = {
  agency_admin: "Administrator agenție",
  agent: "Agent imobiliar",
  superadmin: "Administrator",
};

/** Numele și rolul utilizatorului care generează raportul (pentru copertă). */
async function loadGenerator(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
): Promise<{ name: string | null; role: string | null }> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("full_name,job_title").eq("id", actor.userId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", actor.userId),
  ]);
  const roleKeys = (roles ?? []).map((r) => r.role as string);
  const roleKey = ["agency_admin", "agent", "superadmin"].find((r) => roleKeys.includes(r)) ?? null;
  return {
    name: profile?.full_name ?? null,
    role: profile?.job_title?.trim() || (roleKey ? ROLE_LABELS[roleKey]! : "Agent imobiliar"),
  };
}

/** Generează raportul PDF pentru o versiune ACP și îl salvează în storage privat. */
export const generateAcpReport = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z.object({ analysisId: z.string().uuid(), includeAppendix: z.boolean().optional() }).parse(data),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ report: AcpReportListItem | null; ok: boolean; errorMessage: string | null }> => {
      const actor = await loadActor(context as AuthContext);
      return await generateAcpReportForVersion(actor, data.analysisId, {
        includeAppendix: data.includeAppendix === true,
      });
    },
  );


/** Link temporar semnat către PDF-ul unui raport, cu audit la accesare. */
export const acpReportUrl = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ reportId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ url: string | null }> => {
    const actor = await loadActor(context as AuthContext);
    const admin = await loadAdmin();
    const { data: report, error } = await admin
      .from("acp_reports")
      .select("id,analysis_id,organization_id,pdf_path,status")
      .eq("id", data.reportId)
      .maybeSingle();
    if (error) throw acpDbError("load report", error);
    if (!report) throw acpError("Raportul nu a fost găsit.");
    assertReportOrganization(report.organization_id, actor.organizationId);
    if (!report.pdf_path || report.status !== "ready") {
      throw acpError("Raportul nu are un fișier disponibil.");
    }
    if (!report.pdf_path.startsWith(`${actor.organizationId}/`)) {
      throw acpError("Raport invalid.");
    }

    const { data: signed } = await admin.storage
      .from(ACP_REPORTS_BUCKET)
      .createSignedUrl(report.pdf_path, 600);

    await logAcpAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: ACP_AUDIT_ACTIONS.reportAccessed,
      analysisId: report.analysis_id,
      details: { reportId: report.id },
    });

    return { url: signed?.signedUrl ?? null };
  });
