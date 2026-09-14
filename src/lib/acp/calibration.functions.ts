/**
 * Stage 7 — server functions pentru calibrarea ACP.
 *
 * `getAcpCalibration`      – starea calibrării agenției (citire, fără calcul).
 * `runAcpCalibration`      – recalibrează pe datele reale ale agenției (admin).
 * `updateAcpCalibrationSettings` – activează/dezactivează calibrarea (admin).
 *
 * Reguli: izolare pe organizație, validare Zod, rate limiting, audit, scriere
 * exclusiv server-side. Fără date reale suficiente, rezultatul este
 * `insufficient_data` și calibrarea NU se aplică.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import {
  ACP_CALIBRATION_CONFIG,
  calculateCalibration,
  type AcpCalibrationModel,
  type AcpCalibrationResult,
} from "./calibration";

export const ACP_CALIBRATION_RATE_LIMITS = {
  perUser: { limit: 6, windowSeconds: 3600 },
  perOrganization: { limit: 12, windowSeconds: 3600 },
} as const;

export const ACP_CALIBRATION_AUDIT_ACTIONS = {
  run: "acp.calibration.run",
  settings: "acp.calibration.settings",
} as const;

type AuthContext = {
  userId: string;
  supabase: { rpc: (name: string) => Promise<{ data: unknown; error: unknown }> };
};
type Actor = { userId: string; organizationId: string; isAdmin: boolean };

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
    throw new Error("Calibrarea ACP este disponibilă doar utilizatorilor unei agenții.");
  }
  // Drepturile de administrare vin din RPC-ul existent, nu din profil.
  const { data: isAdmin } = await context.supabase.rpc("is_org_admin");
  return { userId: context.userId, organizationId, isAdmin: isAdmin === true };
}

async function writeAudit(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  params: {
    organizationId: string;
    actorId: string;
    action: string;
    entityId: string;
    newValues: Record<string, unknown>;
  },
) {
  try {
    await admin.from("audit_logs").insert({
      organization_id: params.organizationId,
      actor_id: params.actorId,
      action: params.action,
      entity: "acp_calibration",
      entity_id: params.entityId,
      old_values: null as never,
      new_values: params.newValues as never,
    } as never);
  } catch {
    /* audit best-effort */
  }
}

export type AcpCalibrationView = {
  settings: { enabled: boolean; minSampleSize: number };
  canManage: boolean;
  /** Calibrarea aplicată efectiv în analize (null când nu se aplică nimic). */
  active: AcpCalibrationModel | null;
  /** Ultima calibrare calculată, chiar dacă nu se aplică. */
  latest: AcpCalibrationModel | null;
  /** Câte observații reale sunt disponibile acum. */
  observationsAvailable: number;
  defaults: {
    minSampleSize: number;
    minSegmentSampleSize: number;
    maxFactorDeviationPercent: number;
    maxMedianAbsoluteDeviation: number;
    algorithmVersion: string;
  };
};

/** Starea calibrării agenției. Nu recalculează nimic. */
export const getAcpCalibration = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<AcpCalibrationView> => {
    const actor = await loadActor(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { loadCalibrationSettings, loadActiveCalibrationModel, loadLatestCalibrationModel, buildCalibrationObservations } =
      await import("./calibration.server");

    const [settings, active, latest, observations] = await Promise.all([
      loadCalibrationSettings(admin as never, actor.organizationId),
      loadActiveCalibrationModel(admin as never, actor.organizationId),
      loadLatestCalibrationModel(admin as never, actor.organizationId),
      buildCalibrationObservations(admin as never, actor.organizationId),
    ]);

    return {
      settings,
      canManage: actor.isAdmin,
      active,
      latest,
      observationsAvailable: observations.length,
      defaults: {
        minSampleSize: ACP_CALIBRATION_CONFIG.minSampleSize,
        minSegmentSampleSize: ACP_CALIBRATION_CONFIG.minSegmentSampleSize,
        maxFactorDeviationPercent: ACP_CALIBRATION_CONFIG.maxFactorDeviationPercent,
        maxMedianAbsoluteDeviation: ACP_CALIBRATION_CONFIG.maxMedianAbsoluteDeviation,
        algorithmVersion: ACP_CALIBRATION_CONFIG.algorithmVersion,
      },
    };
  });

/** Recalibrează pe datele reale ale agenției și salvează o versiune nouă. */
export const runAcpCalibration = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ confirm: z.literal(true) }).parse(data))
  .handler(
    async ({
      context,
    }): Promise<{ version: number; result: AcpCalibrationResult; applied: boolean }> => {
      const actor = await loadActor(context as unknown as AuthContext);
      if (!actor.isAdmin) {
        throw new Error("Doar administratorul agenției poate rula calibrarea ACP.");
      }
      const admin = await loadAdmin();

      for (const [bucket, config] of [
        [`acp_calibration:user:${actor.userId}`, ACP_CALIBRATION_RATE_LIMITS.perUser],
        [`acp_calibration:org:${actor.organizationId}`, ACP_CALIBRATION_RATE_LIMITS.perOrganization],
      ] as const) {
        const { data: allowed } = await admin.rpc("rate_limit_hit", {
          _bucket: bucket,
          _limit: config.limit,
          _window_seconds: config.windowSeconds,
        });
        if (allowed === false) {
          throw new Error("Prea multe calibrări în ultima oră. Încearcă mai târziu.");
        }
      }

      const { loadCalibrationSettings, buildCalibrationObservations } = await import(
        "./calibration.server"
      );
      const settings = await loadCalibrationSettings(admin as never, actor.organizationId);
      const observations = await buildCalibrationObservations(admin as never, actor.organizationId);
      const result = calculateCalibration(observations, { minSampleSize: settings.minSampleSize });

      const { data: last } = await admin
        .from("acp_calibrations")
        .select("version")
        .eq("organization_id", actor.organizationId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const version = Number((last as { version?: number } | null)?.version ?? 0) + 1;

      // O singură calibrare activă per agenție.
      await admin
        .from("acp_calibrations")
        .update({ is_active: false } as never)
        .eq("organization_id", actor.organizationId)
        .eq("is_active", true);

      const { error } = await admin.from("acp_calibrations").insert({
        organization_id: actor.organizationId,
        version,
        status: result.status,
        factor: result.factor,
        applied: result.applied,
        median_ratio: result.medianRatio,
        median_absolute_deviation: result.medianAbsoluteDeviation,
        bias_percent: result.biasPercent,
        sample_size: result.sampleSize,
        observations_received: result.observationsReceived,
        confidence: result.confidence,
        min_sample_size: result.minSampleSize,
        algorithm_version: result.algorithmVersion,
        segments: result.segments as never,
        metrics: {
          p25Ratio: result.p25Ratio,
          p75Ratio: result.p75Ratio,
        } as never,
        notes: result.notes as never,
        is_active: result.applied,
        created_by: actor.userId,
      } as never);
      if (error) throw error;

      await writeAudit(admin, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: ACP_CALIBRATION_AUDIT_ACTIONS.run,
        entityId: `${actor.organizationId}:v${version}`,
        newValues: {
          version,
          status: result.status,
          factor: result.factor,
          sampleSize: result.sampleSize,
          applied: result.applied,
          algorithmVersion: result.algorithmVersion,
        },
      });

      return { version, result, applied: result.applied };
    },
  );

/** Activează/dezactivează calibrarea și pragul minim de observații. */
export const updateAcpCalibrationSettings = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        minSampleSize: z.number().int().min(6).max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const actor = await loadActor(context as unknown as AuthContext);
    if (!actor.isAdmin) {
      throw new Error("Doar administratorul agenției poate modifica setările de calibrare.");
    }
    const admin = await loadAdmin();

    const update: Record<string, unknown> = { acp_calibration_enabled: data.enabled };
    if (data.minSampleSize !== undefined) {
      update["acp_calibration_min_sample_size"] = data.minSampleSize;
    }
    const { error } = await admin
      .from("organizations")
      .update(update as never)
      .eq("id", actor.organizationId);
    if (error) throw error;

    await writeAudit(admin, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: ACP_CALIBRATION_AUDIT_ACTIONS.settings,
      entityId: actor.organizationId,
      newValues: update,
    });

    return { ok: true };
  });
