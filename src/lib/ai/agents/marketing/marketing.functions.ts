/**
 * Server functions ale Marketing Agent (Stage 16).
 *
 * Interfața trimite doar ID-uri de proprietăți și opțiuni de conținut; actorul
 * (utilizator, agenție, rol) este reconstruit server-side, deci clientul nu
 * poate pretinde altă agenție. Generarea este preview; salvarea ciornei și
 * aplicarea textului trec prin aprobare umană.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { AI_MAX_MESSAGE_CHARS } from "../../usage/limits";
import type { AiActor, AiRole } from "../../gateway/types";
import { aiFeatureDisabledMessage, type AiFeatureKey } from "@/lib/ai/features/keys";
import {
  MARKETING_CHANNELS,
  MARKETING_CONTENT_TYPES,
  MARKETING_LENGTHS,
  MARKETING_TONES,
} from "./channels";

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

export type MarketingTurn = import("./runtime.server").MarketingTurnResult;
export type MarketingRun = import("./runtime.server").MarketingRunView;
export type MarketingDecisionResult = import("./runtime.server").MarketingDecision;
export type MarketingDraft = import("./runtime.server").MarketingDraftView;
const AI_FEATURE: AiFeatureKey = "ai_marketing";

/** Mesajul de indisponibilitate când agenția nu are funcția activată. */
async function aiFeatureBlocked(organizationId: string): Promise<string | null> {
  const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
  return (await isAiFeatureEnabled(organizationId, AI_FEATURE))
    ? null
    : aiFeatureDisabledMessage(AI_FEATURE);
}


const generateSchema = z.object({
  propertyIds: z.array(z.string().uuid()).min(1).max(5),
  channel: z.enum(MARKETING_CHANNELS),
  contentType: z.enum(MARKETING_CONTENT_TYPES),
  tone: z.enum(MARKETING_TONES),
  length: z.enum(MARKETING_LENGTHS),
  notes: z.string().max(AI_MAX_MESSAGE_CHARS).nullable().optional(),
});

/** Generează conținut de marketing. Preview: nicio dată nu se modifică. */
export const generateMarketing = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => generateSchema.parse(data))
  .handler(async ({ data, context }): Promise<MarketingTurn> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) {
      return {
        status: "failed",
        run: null,
        message: "Marketing Agent este disponibil doar utilizatorilor unei agenții.",
      };
    }
    const blocked = await aiFeatureBlocked(actor.organizationId);
    if (blocked) return { status: "failed", run: null, message: blocked };
    const { runMarketingTurn } = await import("./runtime.server");
    return runMarketingTurn(actor, {
      propertyIds: data.propertyIds,
      channel: data.channel,
      contentType: data.contentType,
      tone: data.tone,
      length: data.length,
      notes: data.notes ?? null,
    });
  });

/** Propune o scriere (ciornă sau aplicare) și suspendă fluxul pentru aprobare. */
export const proposeMarketingAction = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        runId: z.string().uuid(),
        resultIndex: z.number().int().min(0).max(20),
        mode: z.enum(["save_draft", "apply_to_property"]),
        draftId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<MarketingDecisionResult> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) {
      return { ok: false, message: "Marketing Agent este disponibil doar unei agenții." };
    }
    const blocked = await aiFeatureBlocked(actor.organizationId);
    if (blocked) return { ok: false, message: blocked };
    const { proposeMarketingWrite } = await import("./runtime.server");
    return proposeMarketingWrite(actor, data.runId, {
      resultIndex: data.resultIndex,
      mode: data.mode,
      draftId: data.draftId ?? null,
    });
  });

/** Aprobă sau respinge propunerea. Execuția are loc doar la aprobare. */
export const decideMarketingAction = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z.object({ runId: z.string().uuid(), approved: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<MarketingDecisionResult> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) {
      return { ok: false, message: "Marketing Agent este disponibil doar unei agenții." };
    }
    const blocked = await aiFeatureBlocked(actor.organizationId);
    if (blocked) return { ok: false, message: blocked };
    const { decideMarketingWrite } = await import("./runtime.server");
    return decideMarketingWrite(actor, data.runId, data.approved);
  });

/** Rulările proprii, cu starea persistată (supraviețuiesc reîncărcării). */
export const listMarketingAgentRuns = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<MarketingRun[]> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) return [];
    if (await aiFeatureBlocked(actor.organizationId)) return [];
    const { listMarketingRuns } = await import("./runtime.server");
    return listMarketingRuns(actor);
  });

/** Istoricul versionat al ciornelor unei proprietăți. */
export const listPropertyMarketingDrafts = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z.object({ propertyId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<MarketingDraft[]> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) return [];
    if (await aiFeatureBlocked(actor.organizationId)) return [];
    const { listMarketingDrafts } = await import("./runtime.server");
    return listMarketingDrafts(actor, data.propertyId);
  });

export type MarketingPropertyOption = {
  id: string;
  label: string;
  city: string | null;
};

/** Proprietățile active ale agenției, pentru selecția din pagina Marketing. */
export const listMarketingProperties = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<MarketingPropertyOption[]> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) return [];
    if (await aiFeatureBlocked(actor.organizationId)) return [];
    const admin = await loadAdmin();
    const { data } = await admin
      .from("properties")
      .select("id,reference,title,city,archived_at,deleted_at")
      .eq("organization_id", actor.organizationId)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((row) => ({
      id: row.id,
      label: row.title ?? row.reference ?? "Proprietate",
      city: row.city ?? null,
    }));
  });
