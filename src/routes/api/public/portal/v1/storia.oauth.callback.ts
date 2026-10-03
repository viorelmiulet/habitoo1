/**
 * GET /api/public/portal/v1/storia/oauth/callback
 *
 * Ruta de retur a fluxului OAuth2 Storia (OLX Group). Este publică prin
 * necesitate — browserul agenției ajunge aici redirecționat de portal, fără
 * sesiune garantată — dar NU acordă nimic pe baza simplei accesări:
 *   - `state` trebuie să existe, să fie neconsumat, nevalidat expirat și legat
 *     de o agenție reală (protecție CSRF + identificarea agenției);
 *   - `code` este schimbat imediat pe token (codul expiră în 60 de secunde);
 *   - tokenurile se salvează criptat; nimic nu se întoarce în URL sau în pagină.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getCrmUrl } from "@/lib/host";

function back(params: Record<string, string>, path = "/superadmin/portals"): Response {
  const url = new URL(getCrmUrl(path));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

export const Route = createFileRoute("/api/public/portal/v1/storia/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const portalError = url.searchParams.get("error");

        const { consumeStoriaOAuthState, exchangeStoriaAuthorizationCode, saveStoriaTokens } =
          await import("@/lib/portals/storia/oauth.server");

        const validated = await consumeStoriaOAuthState(state);
        if (!validated) {
          // Fără agenție validată nu avem unde raporta: mesaj generic.
          return back({ storia_error: "invalid_state" });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Revenim unde a pornit fluxul: Superadmin → Portaluri sau Setări → Portaluri ale agenției.
        let returnPath = "/superadmin/portals";
        if (validated.createdBy) {
          const { data: superRole } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .eq("user_id", validated.createdBy)
            .eq("role", "superadmin")
            .maybeSingle();
          if (!superRole) returnPath = "/app/settings?tab=portals";
        }
        const done = (params: Record<string, string>) => {
          const target = new URL(getCrmUrl(returnPath));
          for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
          return new Response(null, { status: 302, headers: { location: target.toString() } });
        };
        const log = async (success: boolean, message: string | null) => {
          await supabaseAdmin.from("portal_operation_logs").insert({
            organization_id: validated.organizationId,
            portal: "storia",
            operation: "oauth_callback",
            success,
            error_code: success ? null : "AUTH_ERROR",
            error_message: message,
          });
        };

        if (portalError || !code) {
          await log(
            false,
            portalError ? `portal a refuzat autorizarea (${portalError})` : "cod lipsă",
          );
          return done({
            org: validated.organizationId,
            storia_error: portalError || "missing_code",
          });
        }

        try {
          const tokens = await exchangeStoriaAuthorizationCode(code);
          await saveStoriaTokens({
            organizationId: validated.organizationId,
            tokens,
            actorId: null,
            initial: true,
          });
          await log(true, null);
          return done({ org: validated.organizationId, storia: "connected" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Autorizarea Storia a eșuat.";
          await log(false, message.slice(0, 300));
          return done({ org: validated.organizationId, storia_error: "exchange_failed" });
        }
      },
    },
  },
});
