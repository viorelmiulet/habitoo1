/**
 * Server functions ale Habitoo Manager Agent (Stage 17).
 *
 * Clientul trimite doar cererea în limbaj natural și opțiunile de conținut;
 * actorul (utilizator, agenție, rol) este reconstruit server-side, deci
 * interfața nu poate pretinde altă agenție și nu poate ocoli aprobările.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { AI_MAX_MESSAGE_CHARS } from "../../usage/limits";
import type { AiActor, AiRole } from "../../gateway/types";
import {
  MARKETING_CHANNELS,
  MARKETING_CONTENT_TYPES,
  MARKETING_LENGTHS,
  MARKETING_TONES,
} from "../marketing/channels";

type AuthContext = { userId: string };

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Actorul verificat: agenția și rolul vin din baza de date, nu din request. */
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
    : list.includes("agency_admin") || list.includes("admin")
      ? "admin"
      : "agent";
  return { userId, organizationId: profile.organization_id, role };
}

export type ManagerTurn = import("./runtime.server").ManagerTurnResult;
export type ManagerRun = import("./runtime.server").ManagerRunView;
export type ManagerDecisionResult = import("./runtime.server").ManagerDecision;

const runSchema = z.object({
  request: z.string().min(1).max(AI_MAX_MESSAGE_CHARS),
  propertyIds: z.array(z.string().uuid()).max(5).optional(),
  channel: z.enum(MARKETING_CHANNELS).optional(),
  contentType: z.enum(MARKETING_CONTENT_TYPES).optional(),
  tone: z.enum(MARKETING_TONES).optional(),
  length: z.enum(MARKETING_LENGTHS).optional(),
});

/** Rutează cererea, construiește planul și îl rulează până la aprobare/final. */
export const runManagerPlan = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => runSchema.parse(data))
  .handler(async ({ data, context }): Promise<ManagerTurn> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) {
      return {
        status: "failed",
        run: null,
        message: "Habitoo Manager este disponibil doar utilizatorilor unei agenții.",
      };
    }
    const { runManagerTurn } = await import("./runtime.server");
    return runManagerTurn(actor, {
      request: data.request,
      propertyIds: data.propertyIds ?? [],
      channel: data.channel,
      contentType: data.contentType,
      tone: data.tone,
      length: data.length,
    });
  });

/** Aprobă sau respinge acțiunea propusă. Execuția are loc doar la aprobare. */
export const decideManagerPlan = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z.object({ runId: z.string().uuid(), approved: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<ManagerDecisionResult> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) return { ok: false, message: "Habitoo Manager este disponibil doar unei agenții." };
    const { decideManagerAction } = await import("./runtime.server");
    return decideManagerAction(actor, data.runId, data.approved);
  });

/** Planurile proprii, cu starea persistată (supraviețuiesc reîncărcării). */
export const listManagerPlans = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<ManagerRun[]> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) return [];
    const { listManagerRuns } = await import("./runtime.server");
    return listManagerRuns(actor);
  });

/** Un plan anume, pentru reluare după reîncărcarea paginii. */
export const getManagerPlan = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ runId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ManagerRun | null> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) return null;
    const { getManagerRun } = await import("./runtime.server");
    return getManagerRun(actor, data.runId);
  });
