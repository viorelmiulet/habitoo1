/**
 * Server functions Habitoo AI (Stage 11A).
 *
 * Interfața nu vorbește niciodată direct cu providerul: trimite un mesaj aici,
 * iar AI Gateway rulează pe server. Actorul (utilizator, agenție, rol) este
 * reconstruit server-side din baza de date — clientul nu îl poate influența.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { AI_MAX_MESSAGE_CHARS, AI_RATE_LIMITS } from "./usage/limits";
import { AI_TOOLS } from "./tools/registry";
import {
  AI_NOT_CONFIGURED,
  AI_NOT_CONFIGURED_MESSAGE,
  emptyAiResponse,
  type AIResponse,
  type AiActor,
  type AiRole,
} from "./gateway/types";

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
    : list.includes("admin")
      ? "admin"
      : "agent";

  return { userId, organizationId: profile.organization_id, role };
}

export type AiStatus = {
  configured: boolean;
  provider: string;
  providerLabel: string;
  model: string | null;
  runtime: string;
  plannedProviders: string[];
  message: string;
  tools: { name: string; description: string }[];
  limits: {
    perUserMinute: number;
    perUserHour: number;
    perOrganizationHour: number;
    maxMessageChars: number;
  };
  usage: {
    requestsLast24h: number;
    requestsLast30d: number;
    inputTokens30d: number | null;
    outputTokens30d: number | null;
    failures30d: number;
  } | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

/** Starea AI pentru pagina de setări. Nu returnează niciodată chei sau erori brute. */
export const getAiStatus = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<AiStatus> => {
    const { userId } = context as AuthContext;
    const { aiProviderStatus } = await import("./providers/registry.server");
    const status = aiProviderStatus();
    const actor = await resolveActor(userId);

    const base: AiStatus = {
      configured: status.configured,
      provider: status.provider,
      providerLabel: PROVIDER_LABELS[status.provider] ?? status.provider,
      model: status.configured ? status.model : null,
      runtime: "mastra",
      plannedProviders: status.plannedProviders.map((id) => PROVIDER_LABELS[id] ?? id),
      message: status.configured
        ? "Habitoo AI este configurat."
        : AI_NOT_CONFIGURED_MESSAGE,
      tools: AI_TOOLS.map((tool) => ({ name: tool.name, description: tool.description })),
      limits: {
        perUserMinute: AI_RATE_LIMITS.perUserMinute.limit,
        perUserHour: AI_RATE_LIMITS.perUserHour.limit,
        perOrganizationHour: AI_RATE_LIMITS.perOrganizationHour.limit,
        maxMessageChars: AI_MAX_MESSAGE_CHARS,
      },
      usage: null,
    };

    if (!actor) return base;

    const admin = await loadAdmin();
    const since30d = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data } = await admin
      .from("ai_usage_events")
      .select("input_tokens,output_tokens,success,created_at")
      .eq("organization_id", actor.organizationId)
      .gte("created_at", since30d)
      .limit(2000);

    const rows = data ?? [];
    return {
      ...base,
      usage: {
        requestsLast24h: rows.filter((row) => row.created_at >= since24h).length,
        requestsLast30d: rows.length,
        inputTokens30d: rows.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0),
        outputTokens30d: rows.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0),
        failures30d: rows.filter((row) => row.success === false).length,
      },
    };
  });

const sendSchema = z.object({
  message: z.string().min(1).max(AI_MAX_MESSAGE_CHARS + 1),
  conversationId: z.string().uuid().nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
});

/** Trimite un mesaj către Habitoo AI prin gateway. */
export const sendAiMessage = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => sendSchema.parse(data))
  .handler(async ({ data, context }): Promise<AIResponse> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) {
      return emptyAiResponse(
        "failed",
        "Habitoo AI este disponibil doar utilizatorilor unei agenții.",
      );
    }

    const { isAiConfigured } = await import("./providers/registry.server");
    if (!isAiConfigured()) {
      return {
        ...emptyAiResponse("not_configured", AI_NOT_CONFIGURED_MESSAGE),
        warnings: [AI_NOT_CONFIGURED],
      };
    }

    const { runAiChat } = await import("./gateway/gateway.server");
    return runAiChat(actor, {
      message: data.message,
      conversationId: data.conversationId ?? null,
      propertyId: data.propertyId ?? null,
    });
  });

export type AiConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

/** Conversațiile utilizatorului curent, din agenția lui. */
export const listAiConversations = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<AiConversationSummary[]> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) return [];
    const admin = await loadAdmin();
    const { data } = await admin
      .from("ai_conversations")
      .select("id,title,updated_at")
      .eq("organization_id", actor.organizationId)
      .eq("user_id", actor.userId)
      .order("updated_at", { ascending: false })
      .limit(20);
    return (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
    }));
  });

export type AiConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sources: { type: string; id: string; label: string }[];
};

/** Mesajele unei conversații proprii. Un ID din altă agenție nu returnează nimic. */
export const getAiConversation = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ conversationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<AiConversationMessage[]> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) return [];
    const admin = await loadAdmin();
    const { data: conversation } = await admin
      .from("ai_conversations")
      .select("id")
      .eq("id", data.conversationId)
      .eq("organization_id", actor.organizationId)
      .eq("user_id", actor.userId)
      .maybeSingle();
    if (!conversation) return [];

    const { data: rows } = await admin
      .from("ai_messages")
      .select("id,role,content,created_at,sources")
      .eq("conversation_id", conversation.id)
      .eq("organization_id", actor.organizationId)
      .order("created_at", { ascending: true })
      .limit(100);

    return (rows ?? []).map((row) => ({
      id: row.id,
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
      createdAt: row.created_at,
      sources: Array.isArray(row.sources)
        ? (row.sources as { type: string; id: string; label: string }[])
        : [],
    }));
  });

/* ------------------------------------------------------------------ *
 * Workflow-uri (habitooDiagnosticWorkflow): start, suspend, resume.  *
 * ------------------------------------------------------------------ */

export type AiWorkflowRun = import("./workflows/runtime.server").WorkflowRunView;

export type AiWorkflowResult =
  | { ok: true; run: AiWorkflowRun }
  | { ok: false; message: string };

const startWorkflowSchema = z.object({
  question: z.string().min(1).max(AI_MAX_MESSAGE_CHARS),
  propertyId: z.string().uuid().nullable().optional(),
});

/** Pornește fluxul de diagnostic; se oprește la pasul de aprobare umană. */
export const startAiWorkflow = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => startWorkflowSchema.parse(data))
  .handler(async ({ data, context }): Promise<AiWorkflowResult> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) {
      return { ok: false, message: "Habitoo AI este disponibil doar utilizatorilor unei agenții." };
    }
    const { startDiagnosticWorkflow } = await import("./workflows/runtime.server");
    return startDiagnosticWorkflow(actor, {
      question: data.question,
      propertyId: data.propertyId ?? null,
    });
  });

/** Reia fluxul suspendat după decizia utilizatorului (aprobat/respins). */
export const resumeAiWorkflow = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z.object({ runId: z.string().uuid(), approved: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<AiWorkflowResult> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) {
      return { ok: false, message: "Habitoo AI este disponibil doar utilizatorilor unei agenții." };
    }
    const { resumeDiagnosticWorkflow } = await import("./workflows/runtime.server");
    return resumeDiagnosticWorkflow(actor, data.runId, data.approved);
  });

/** Rulările proprii, cu starea persistată (supraviețuiesc restartului). */
export const listAiWorkflows = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<AiWorkflowRun[]> => {
    const { userId } = context as AuthContext;
    const actor = await resolveActor(userId);
    if (!actor) return [];
    const { listDiagnosticWorkflows } = await import("./workflows/runtime.server");
    return listDiagnosticWorkflows(actor);
  });
