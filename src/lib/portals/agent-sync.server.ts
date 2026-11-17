/** Dependențele reale pentru RP2 (agent_sync la republicare). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AgentSyncDeps, AgentSyncResult } from "./agent-sync";
import type { PublishJobRow } from "./publish-jobs.server";

type Admin = SupabaseClient<Database>;

async function syncImobiliare(admin: Admin, job: PublishJobRow, agentId: string): Promise<AgentSyncResult> {
  const { getPortalDefinition } = await import("./registry");
  const definition = getPortalDefinition("imobiliare_ro");
  if (!definition) return { ok: false, message: "portal necunoscut" };
  const { buildContext } = await import("@/lib/portals.functions");
  const { ctx } = await buildContext(job.organization_id, definition);
  const { getImobiliareSession } = await import("./imobiliare/auth.server");
  const session = await getImobiliareSession({
    admin, organizationId: job.organization_id,
    username: ctx.externalAccountId, credential: ctx.portalCredential,
  });
  if (!session.ok) return { ok: false, message: session.message };
  const { data: profile } = await admin
    .from("profiles").select("id, full_name, email, phone").eq("id", agentId).maybeSingle();
  if (!profile) return { ok: false, message: "agentul nu a fost găsit" };
  const { ensureImobiliareAgent, updateImobiliareAgent } = await import("./imobiliare/agents.server");
  const ensured = await ensureImobiliareAgent({ admin, session: session.session, organizationId: job.organization_id, profile });
  if (!ensured.ok) return { ok: false, message: ensured.message };
  if (ensured.created) return { ok: true };
  const updated = await updateImobiliareAgent({ session: session.session, organizationId: job.organization_id, agentId: ensured.agentId, profile });
  return updated.ok ? { ok: true } : { ok: false, message: updated.message };
}

export function realAgentSyncDeps(admin: Admin): AgentSyncDeps {
  return {
    syncers: { imobiliare_ro: (job, agentId) => syncImobiliare(admin, job, agentId) },
    loadAgentIds: async (job) => {
      const { data } = await admin.from("properties").select("assigned_to").eq("id", job.property_id).maybeSingle();
      return data?.assigned_to ? [data.assigned_to] : [];
    },
    log: async (job, agentId, result) => {
      await admin.from("portal_operation_logs").insert({
        organization_id: job.organization_id, portal: job.portal_key, property_id: job.property_id,
        operation: "agent_sync", success: result.ok,
        error_message: result.ok ? `agent ${agentId}: actualizat` : `agent ${agentId}: ${result.message}`.slice(0, 500),
      } as never);
    },
  };
}
