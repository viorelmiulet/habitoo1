import { createFileRoute } from "@tanstack/react-router";
import { getCrmUrl } from "@/lib/host";
export const Route = createFileRoute("/api/public/portal/v1/zup/oauth/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const back = (code: string, org?: string, superadmin = false) => {
      const target = new URL(getCrmUrl(superadmin ? "/superadmin/portals" : "/app/settings?tab=portals"));
      target.searchParams.set("zup", code); if (org && superadmin) target.searchParams.set("org", org);
      return new Response(null, { status: 302, headers: { location: target.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    };
    const { zupDependencies } = await import("@/lib/portals/zup/store.server");
    const { consumeZupState, exchangeZupCode, saveZupTokens } = await import("@/lib/portals/zup/oauth.server");
    const d = await zupDependencies();
    const state = await consumeZupState(url.searchParams.get("state"), d);
    if (!state) return back("invalid_state");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await db.from("user_roles").select("role, organization_id").eq("user_id", state.createdBy ?? "00000000-0000-0000-0000-000000000000");
    const isSuper = roles?.some(r => r.role === "superadmin") === true;
    if (!isSuper && !roles?.some(r => r.role === "agency_admin" && r.organization_id === state.organizationId)) return back("access_denied");
    const code = url.searchParams.get("code");
    const log = async (success: boolean) => { await db.from("portal_operation_logs").insert({ organization_id: state.organizationId, portal: "zup", operation: "oauth_callback", success, error_message: success ? null : "Autorizarea ZUP nu s-a finalizat.", actor_id: state.createdBy }); };
    if (url.searchParams.has("error") || !code || code.length > 4096) { await log(false); return back("authorization_failed", state.organizationId, isSuper); }
    try {
      await saveZupTokens(state.organizationId, await exchangeZupCode(code, d), state.createdBy, d);
      await log(true); return back("connected", state.organizationId, isSuper);
    } catch { await log(false); return back("exchange_failed", state.organizationId, isSuper); }
  } } },
});