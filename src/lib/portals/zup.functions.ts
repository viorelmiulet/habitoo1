import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { zupConfigured, ZUP_MISSING_MESSAGE } from "./zup/config";
const schema = (input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input);
type Context = { userId: string; supabase: { rpc(name: "is_superadmin" | "is_org_admin"): PromiseLike<{ data: boolean | null }>; from(name: "profiles"): { select(columns: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: { organization_id: string | null } | null }> } } } } };
async function authorize(context: Context, org: string) {
  const { data: superadmin } = await context.supabase.rpc("is_superadmin");
  if (superadmin === true) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("organizations").select("id").eq("id", org).maybeSingle();
    if (!data) throw new Error("Agenția nu a fost găsită.");
    return;
  }
  const { data: admin } = await context.supabase.rpc("is_org_admin");
  const { data: profile } = await context.supabase.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
  if (admin !== true || profile?.organization_id !== org) throw new Error("Acces refuzat: poți gestiona contul ZUP doar pentru agenția ta.");
}
export const startZupAuthorization = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth]).inputValidator(schema).handler(async ({ data, context }) => {
  await authorize(context as unknown as Context, data.organizationId);
  if (!zupConfigured(process.env)) throw new Error(ZUP_MISSING_MESSAGE);
  const { zupDependencies } = await import("./zup/store.server");
  const { createZupState, zupAuthorizationUrl } = await import("./zup/oauth.server");
  const d = await zupDependencies();
  return { url: zupAuthorizationUrl(await createZupState(data.organizationId, context.userId, d), d.env) };
});
export const revokeZupAuthorization = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth]).inputValidator(schema).handler(async ({ data, context }) => {
  await authorize(context as unknown as Context, data.organizationId);
  const { zupDependencies } = await import("./zup/store.server");
  const { clearZupTokens } = await import("./zup/oauth.server");
  await clearZupTokens(data.organizationId, context.userId, await zupDependencies());
  return { ok: true as const };
});
export const testZupAuthorization = createServerFn({ method: "POST" }).middleware([requireActiveOrgAuth]).inputValidator(schema).handler(async ({ data, context }) => {
  await authorize(context as unknown as Context, data.organizationId);
  const { zupDependencies } = await import("./zup/store.server");
  const { testZupConnection } = await import("./zup/oauth.server");
  const { PortalError } = await import("./errors");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const started = Date.now();
  try {
    const result = await testZupConnection(data.organizationId, await zupDependencies());
    await supabaseAdmin.from("portal_connections").update({ last_sync_status: "ok", last_sync_error: null, last_sync_at: new Date().toISOString(), status: "connected" }).eq("organization_id", data.organizationId).eq("portal", "zup");
    await supabaseAdmin.from("portal_operation_logs").insert({ organization_id: data.organizationId, portal: "zup", operation: "test_connection", success: true, actor_id: context.userId, duration_ms: Date.now() - started });
    return { ok: true as const, ...result };
  } catch (e) {
    const message = e instanceof PortalError ? e.message : "Conexiunea ZUP nu a putut fi verificată.";
    await supabaseAdmin.from("portal_operation_logs").insert({ organization_id: data.organizationId, portal: "zup", operation: "test_connection", success: false, error_message: message, actor_id: context.userId, duration_ms: Date.now() - started });
    return { ok: false as const, message };
  }
});