/** Conectarea contului OLX.ro (cont propriu) al agenției. Fără tokenuri spre frontend. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

type Ctx = {
  supabase: { rpc: (fn: "is_superadmin" | "is_org_admin") => PromiseLike<{ data: boolean | null }> };
  userId: string;
};

async function requireConnector(context: Ctx, organizationId: string): Promise<string> {
  const { data: isSuper } = await context.supabase.rpc("is_superadmin");
  if (isSuper === true) return organizationId;
  const { data: isAdmin } = await context.supabase.rpc("is_org_admin");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (isAdmin !== true || profile?.organization_id !== organizationId) {
    throw new Error("Acces refuzat: poți conecta contul OLX doar pentru agenția ta.");
  }
  return organizationId;
}

const orgInput = (i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i);

export const startOlxAuthorization = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator(orgInput)
  .handler(async ({ data, context }) => {
    const organizationId = await requireConnector(context as unknown as Ctx, data.organizationId);
    const { createOlxOAuthState, olxAuthorizationUrl, olxAppConfigured } = await import(
      "@/lib/portals/olx/oauth.server"
    );
    if (!olxAppConfigured()) {
      throw new Error("Integrarea OLX.ro nu este configurată: lipsesc credențialele de aplicație.");
    }
    const state = await createOlxOAuthState({ organizationId, createdBy: context.userId });
    return { url: olxAuthorizationUrl(state) };
  });

export const revokeOlxAuthorization = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator(orgInput)
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await (context as unknown as Ctx).supabase.rpc("is_superadmin");
    if (isSuper !== true) throw new Error("Acces refuzat.");
    const { clearOlxTokens } = await import("@/lib/portals/olx/oauth.server");
    await clearOlxTokens(data.organizationId, context.userId);
    return { ok: true as const };
  });
