import { createFileRoute } from "@tanstack/react-router";
import { getCrmUrl } from "@/lib/host";

export const Route = createFileRoute("/api/public/portal/v1/housera/oauth/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const back = (code: string, org?: string, superadmin = false) => {
      const target = new URL(getCrmUrl(superadmin ? "/superadmin/portals" : "/app/settings?tab=portals"));
      target.searchParams.set("housera", code);
      if (org && superadmin) target.searchParams.set("org", org);
      return new Response(null, { status: 302, headers: { location: target.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    };
    const { houseraOAuthDependencies } = await import("@/lib/portals/housera/store.server");
    const { consumeHouseraState, exchangeHouseraCode, houseraAuthorizeErrorMessage, HouseraOAuthError, HOUSERA_AUTHORIZE_ERRORS } = await import("@/lib/portals/housera/oauth.server");
    const { deps, saveTokens } = await houseraOAuthDependencies();
    const state = await consumeHouseraState(url.searchParams.get("state"), deps);
    if (!state) return back("invalid_state");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await db.from("user_roles").select("role, organization_id").eq("user_id", state.createdBy ?? "00000000-0000-0000-0000-000000000000");
    const isSuper = roles?.some((r) => r.role === "superadmin") === true;
    if (!isSuper && !roles?.some((r) => r.role === "agency_admin" && r.organization_id === state.organizationId)) return back("forbidden");
    const log = async (success: boolean, message: string | null) => {
      await db.from("portal_operation_logs").insert({ organization_id: state.organizationId, portal: "housera", operation: "oauth_callback", success, error_message: message, actor_id: state.createdBy });
    };
    const error = url.searchParams.get("error");
    if (error) {
      const known = error in HOUSERA_AUTHORIZE_ERRORS ? error : "authorization_failed";
      await log(false, houseraAuthorizeErrorMessage(error));
      return back(known, state.organizationId, isSuper);
    }
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096) { await log(false, "Housera nu a trimis codul de autorizare."); return back("authorization_failed", state.organizationId, isSuper); }
    try {
      await saveTokens(state.organizationId, await exchangeHouseraCode(code, state.verifier, deps), state.createdBy);
      await log(true, null);
      return back("connected", state.organizationId, isSuper);
    } catch (e) {
      const isOAuth = e instanceof HouseraOAuthError;
      await log(false, isOAuth ? e.message : "Conexiunea Housera nu a putut fi salvată.");
      return back(isOAuth && e.code === "invalid_grant" ? "invalid_grant" : "exchange_failed", state.organizationId, isSuper);
    }
  } } },
});
