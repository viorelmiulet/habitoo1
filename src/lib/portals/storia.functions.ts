/**
 * Server functions pentru conectarea contului Storia al unei agenții (OAuth2).
 *
 * Doar Superadminul poate porni sau desface autorizarea, la fel ca restul
 * integrărilor de portaluri. Tokenurile nu ajung niciodată în frontend: aici se
 * returnează exclusiv URL-ul de autorizare și metadate nesecrete de stare.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

type AuthContext = {
  supabase: {
    rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
  };
  userId: string;
};

async function requireSuperadminOrg(context: AuthContext, organizationId: string): Promise<string> {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    throw new Error("Acces refuzat: integrările de portaluri se gestionează doar de Superadmin.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) throw new Error("Agenția nu a fost găsită.");
  return org.id;
}

/**
 * Pornește autorizarea: generează `state`-ul CSRF legat de agenție și întoarce
 * URL-ul paginii de autorizare Storia, unde este trimis browserul.
 */
export const startStoriaAuthorization = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireSuperadminOrg(context as unknown as AuthContext, data.organizationId);
    const { createStoriaOAuthState, storiaAuthorizationUrl, storiaAppConfigured } = await import(
      "@/lib/portals/storia/oauth.server"
    );
    if (!storiaAppConfigured()) {
      throw new Error(
        "Integrarea Storia nu este configurată la nivel de platformă: lipsesc credențialele de aplicație OLX.",
      );
    }
    const state = await createStoriaOAuthState({ organizationId, createdBy: context.userId });
    return { url: storiaAuthorizationUrl(state) };
  });

/** Starea conexiunii OAuth, fără niciun secret. */
export const getStoriaAuthorizationStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireSuperadminOrg(context as unknown as AuthContext, data.organizationId);
    const { loadStoriaTokens, readStoriaOAuthMeta, storiaAppConfigured } = await import(
      "@/lib/portals/storia/oauth.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("portal_connections")
      .select("settings")
      .eq("organization_id", organizationId)
      .eq("portal", "storia")
      .maybeSingle();

    const meta = readStoriaOAuthMeta((row?.settings ?? {}) as Record<string, unknown>);
    const tokens = await loadStoriaTokens(organizationId);
    const expiresAt = meta?.expires_at ?? tokens?.expires_at ?? null;
    return {
      appConfigured: storiaAppConfigured(),
      connected: Boolean(tokens),
      expiresAt,
      expired: expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false,
      canRefresh: Boolean(tokens?.refresh_token),
      connectedAt: meta?.connected_at ?? null,
      refreshedAt: meta?.refreshed_at ?? null,
      scope: meta?.scope ?? null,
    };
  });

/** Desface autorizarea: șterge tokenurile agenției. */
export const revokeStoriaAuthorization = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireSuperadminOrg(context as unknown as AuthContext, data.organizationId);
    const { clearStoriaTokens } = await import("@/lib/portals/storia/oauth.server");
    await clearStoriaTokens(organizationId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("portal_operation_logs").insert({
      organization_id: organizationId,
      portal: "storia",
      operation: "oauth_revoke",
      success: true,
      actor_id: context.userId,
    });
    return { ok: true as const };
  });
