/**
 * Stage 7 — accesul la date pentru calibrarea ACP (server-only).
 *
 * Observațiile de calibrare provin EXCLUSIV din date reale existente în cont:
 * analizele ACP finalizate ale agenției, comparate cu prețul real publicat al
 * proprietății analizate. Nu se generează, nu se estimează și nu se simulează
 * nicio observație.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACP_CALIBRATION_CONFIG,
  type AcpCalibrationModel,
  type AcpCalibrationObservation,
  type AcpCalibrationSegment,
  type AcpCalibrationStatus,
} from "./calibration";
import type { AcpSubject } from "./scoring";

// Clientul admin este generat: tipurile stricte nu adaugă valoare aici.
type Admin = SupabaseClient<never, never, never>;

export type AcpCalibrationSettings = {
  enabled: boolean;
  minSampleSize: number;
};

/** Setările de calibrare ale agenției (dezactivat implicit). */
export async function loadCalibrationSettings(
  admin: Admin,
  organizationId: string,
): Promise<AcpCalibrationSettings> {
  const { data } = await (admin as never as SupabaseClient)
    .from("organizations")
    .select("acp_calibration_enabled,acp_calibration_min_sample_size")
    .eq("id", organizationId)
    .maybeSingle();
  const row = (data ?? {}) as {
    acp_calibration_enabled?: boolean | null;
    acp_calibration_min_sample_size?: number | null;
  };
  return {
    enabled: row.acp_calibration_enabled === true,
    minSampleSize: Math.max(
      1,
      Number(row.acp_calibration_min_sample_size ?? ACP_CALIBRATION_CONFIG.minSampleSize),
    ),
  };
}

type CalibrationRow = {
  version: number;
  status: string;
  factor: number | string | null;
  applied: boolean | null;
  median_ratio: number | string | null;
  median_absolute_deviation: number | string | null;
  sample_size: number | null;
  confidence: number | string | null;
  segments: unknown;
  algorithm_version: string | null;
  created_at: string;
};

function toNumber(value: number | string | null | undefined, fallback: number | null = null) {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calibrationRowToModel(row: CalibrationRow): AcpCalibrationModel {
  return {
    version: row.version,
    status: row.status as AcpCalibrationStatus,
    factor: toNumber(row.factor, 1) ?? 1,
    applied: row.applied === true,
    medianRatio: toNumber(row.median_ratio),
    medianAbsoluteDeviation: toNumber(row.median_absolute_deviation),
    sampleSize: row.sample_size ?? 0,
    confidence: toNumber(row.confidence, 0) ?? 0,
    segments: Array.isArray(row.segments) ? (row.segments as AcpCalibrationSegment[]) : [],
    algorithmVersion: row.algorithm_version ?? ACP_CALIBRATION_CONFIG.algorithmVersion,
    createdAt: row.created_at,
  };
}

const CALIBRATION_COLUMNS =
  "version,status,factor,applied,median_ratio,median_absolute_deviation,sample_size,confidence,segments,algorithm_version,created_at";

/**
 * Modelul de calibrare activ al agenției, dar numai dacă agenția a activat
 * explicit calibrarea. Fără activare, motorul rulează exact ca în Stage 6.
 */
export async function loadActiveCalibrationModel(
  admin: Admin,
  organizationId: string,
): Promise<AcpCalibrationModel | null> {
  const settings = await loadCalibrationSettings(admin, organizationId);
  if (!settings.enabled) return null;
  const { data } = await (admin as never as SupabaseClient)
    .from("acp_calibrations")
    .select(CALIBRATION_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  return calibrationRowToModel(data as unknown as CalibrationRow);
}

/** Ultima calibrare a agenției, activă sau nu (pentru afișare în interfață). */
export async function loadLatestCalibrationModel(
  admin: Admin,
  organizationId: string,
): Promise<AcpCalibrationModel | null> {
  const { data } = await (admin as never as SupabaseClient)
    .from("acp_calibrations")
    .select(CALIBRATION_COLUMNS)
    .eq("organization_id", organizationId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return calibrationRowToModel(data as unknown as CalibrationRow);
}

/**
 * Construiește observațiile din analizele ACP finalizate: raportul dintre
 * prețul real publicat al proprietății și estimarea ACP, ambele pe metru pătrat.
 */
export async function buildCalibrationObservations(
  admin: Admin,
  organizationId: string,
): Promise<AcpCalibrationObservation[]> {
  const { data, error } = await (admin as never as SupabaseClient)
    .from("acp_analyses")
    .select("id,status,estimated_value,target_data,snapshot_at")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .not("estimated_value", "is", null)
    .order("snapshot_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const observations: AcpCalibrationObservation[] = [];
  for (const row of (data ?? []) as {
    estimated_value: number | string | null;
    target_data: unknown;
  }[]) {
    const subject = ((row.target_data ?? {}) as { subject?: AcpSubject }).subject;
    if (!subject) continue;
    const area = typeof subject.usableArea === "number" ? subject.usableArea : null;
    const observedPrice = typeof subject.price === "number" ? subject.price : null;
    const estimated = toNumber(row.estimated_value);
    if (!area || area <= 0 || !observedPrice || observedPrice <= 0 || !estimated) continue;
    observations.push({
      estimatedPricePerSqm: estimated / area,
      observedPricePerSqm: observedPrice / area,
      city: subject.city ?? null,
      propertyType: subject.propertyType ?? null,
      rooms: typeof subject.rooms === "number" ? subject.rooms : null,
    });
  }
  return observations;
}
