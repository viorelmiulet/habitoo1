/**
 * GET /api/public/portal/v1/olx/oauth/callback — retur OAuth OLX.ro (`olx_direct`).
 * Nu acordă nimic fără `state` valid, neconsumat și neexpirat; codul (10 min) se schimbă imediat.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getCrmUrl } from "@/lib/host";

export const Route = createFileRoute("/api/public/portal/v1/olx/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const portalError = url.searchParams.get("error");
        const oauth = await import("@/lib/portals/olx/oauth.server");
        const redirect = (path: string, params: Record<string, string>) => {
          const target = new URL(getCrmUrl(path));
          for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
          return new Response(null, { status: 302, headers: { location: target.toString() } });
        };
        const validated = await oauth.consumeOlxOAuthState(url.searchParams.get("state"));
        if (!validated) return redirect("/superadmin/portals", { olx_error: "invalid_state" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let path = "/superadmin/portals";
        if (validated.createdBy) {
          const { data: superRole } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .eq("user_id", validated.createdBy)
            .eq("role", "superadmin")
            .maybeSingle();
          if (!superRole) path = "/app/settings";
        }
        const base: Record<string, string> =
          path === "/app/settings" ? { tab: "portals" } : { org: validated.organizationId };
        const log = (success: boolean, message: string | null) =>
          supabaseAdmin.from("portal_operation_logs").insert({
            organization_id: validated.organizationId,
            portal: "olx_direct",
            operation: "oauth_callback",
            success,
            error_code: success ? null : "AUTH_ERROR",
            error_message: message,
          });

        if (portalError || !code) {
          await log(false, portalError ? `OLX a refuzat autorizarea (${portalError})` : "cod lipsă");
          return redirect(path, { ...base, olx_error: portalError ? "denied" : "missing_code" });
        }
        try {
          const { assertPortalExclusivity } = await import("@/lib/portals/olx/exclusivity");
          await assertPortalExclusivity(validated.organizationId, "olx_direct");
          const tokens = await oauth.exchangeOlxAuthorizationCode(code);
          await oauth.saveOlxTokens({
            organizationId: validated.organizationId,
            tokens,
            actorId: validated.createdBy,
            initial: true,
          });
          await supabaseAdmin
            .from("portal_connections")
            .update({ activated: true } as never)
            .eq("organization_id", validated.organizationId)
            .eq("portal", "olx_direct");
          await supabaseAdmin.rpc("olx_direct_refresh_arm" as never).then(() => undefined, () => undefined);
          await log(true, null);
          return redirect(path, { ...base, olx: "connected" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Autorizarea OLX a eșuat.";
          await log(false, message.slice(0, 300));
          return redirect(path, { ...base, olx_error: "exchange_failed" });
        }
      },
    },
  },
});
