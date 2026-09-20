/**
 * Server functions ale CRM Agent (Stage 14).
 *
 * Interfața trimite doar textul utilizatorului; actorul (utilizator, agenție,
 * rol) este reconstruit server-side din baza de date, deci clientul nu poate
 * pretinde altă agenție sau alt rol.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { AI_MAX_MESSAGE_CHARS } from "../../usage/limits";
import type { AiActor, AiRole } from "../../gateway/types";
import { aiFeatureDisabledMessage, type AiFeatureKey } from "@/lib/ai/features/keys";

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

export type CrmAgentTurn = import("./runtime.server").CrmTurnResult;
export type CrmAgentRun = import("./runtime.server").CrmRunView;
const AI_FEATURE: AiFeatureKey = "ai_crm";

/** Mesajul de indisponibilitate când agenția nu are funcția activată. */
async function aiFeatureBlocked(organizationId: string): Promise<string | null> {
  const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
  return (await isAiFeatureEnabled(organizationId, AI_FEATURE))
    ? null
    : aiFeatureDisabledMessage(AI_FEATURE);
}


const askSchema = z.object({
  question: z.string().min(1).max(AI_MAX_MESSAGE_CHARS),
  leadId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
});

/** Întreabă CRM Agent. Nicio dată CRM nu se modifică în acest apel. */
export const askCrmAgent = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => askSchema.parse(data))
  .handler(async ({ data, context }): Promise<CrmAgentTurn> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) {
      return {
        status: "failed",
        answer: "",
        toolCalls: [],
        sources: [],
        warnings: [],
        contextUsed: [],
        intent: "search",
        run: null,
        message: "Habitoo AI este disponibil doar utilizatorilor unei agenții.",
      };
    }
    const blocked = await aiFeatureBlocked(actor.organizationId);
    if (blocked) {
      return {
        status: "failed",
        answer: "",
        toolCalls: [],
        sources: [],
        warnings: [],
        contextUsed: [],
        intent: "search",
        run: null,
        message: blocked,
      };
    }
    const { runCrmTurn } = await import("./runtime.server");
    return runCrmTurn(actor, {
      question: data.question,
      leadId: data.leadId ?? null,
      contactId: data.contactId ?? null,
    });
  });

export type CrmAgentDecision = { ok: true; run: CrmAgentRun } | { ok: false; message: string };

/** Aprobă sau respinge acțiunea propusă. Execuția are loc doar la aprobare. */
export const decideCrmAction = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z.object({ runId: z.string().uuid(), approved: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<CrmAgentDecision> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) {
      return { ok: false, message: "Habitoo AI este disponibil doar utilizatorilor unei agenții." };
    }
    const blocked = await aiFeatureBlocked(actor.organizationId);
    if (blocked) return { ok: false, message: blocked };
    const { resumeCrmWorkflow } = await import("./runtime.server");
    return resumeCrmWorkflow(actor, data.runId, data.approved);
  });

/** Rulările proprii ale CRM Agent, cu starea persistată. */
export const listCrmAgentRuns = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<CrmAgentRun[]> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) return [];
    if (await aiFeatureBlocked(actor.organizationId)) return [];
    const { listCrmRuns } = await import("./runtime.server");
    return listCrmRuns(actor);
  });
