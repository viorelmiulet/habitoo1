/**
 * GET /api/public/meta/oauth/callback — retur Facebook Login for Business.
 * Fără `state` semnat și neexpirat nu se schimbă nimic. Tokenurile se salvează criptat.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getCrmUrl } from "@/lib/host";

export const Route = createFileRoute("/api/public/meta/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (params: Record<string, string>) => {
          const t = new URL(getCrmUrl("/app/settings"));
          t.searchParams.set("tab", "promotion");
          for (const [k, v] of Object.entries(params)) t.searchParams.set(k, v);
          return new Response(null, { status: 302, headers: { location: t.toString(), "cache-control": "no-store" } });
        };
        const secret = process.env["META_APP_SECRET"];
        if (!secret) return back({ meta_error: "config" });
        const { verifyMetaState, MetaConnectError } = await import("@/lib/meta/core");
        const state = verifyMetaState(url.searchParams.get("state"), secret);
        if (!state) return back({ meta_error: "invalid_state" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Utilizatorul trebuie să fie încă admin în aceeași agenție.
        const [{ data: profile }, { data: roles }] = await Promise.all([
          supabaseAdmin.from("profiles").select("organization_id").eq("id", state.userId).maybeSingle(),
          supabaseAdmin.from("user_roles").select("role").eq("user_id", state.userId),
        ]);
        const r = (roles ?? []).map((x) => x.role as string);
        const isSuper = r.includes("superadmin");
        if (!isSuper && (!r.includes("agency_admin") || profile?.organization_id !== state.organizationId)) {
          return back({ meta_error: "invalid_state" });
        }

        const code = url.searchParams.get("code");
        if (url.searchParams.get("error") || !code) return back({ meta_error: "denied" });

        const m = await import("@/lib/meta/meta.server");
        try {
          const ex = await m.exchangeMetaCode(code);
          const pages = await m.loadMetaPages(ex.userToken);
          const saved = await m.saveMetaConnection(supabaseAdmin, {
            organizationId: state.organizationId,
            userId: state.userId,
            metaUserId: ex.metaUserId,
            userToken: ex.userToken,
            expiresIn: ex.expiresIn,
            pages,
          });
          await m.metaAudit(supabaseAdmin, state.organizationId, state.userId, "meta.connected", saved);
          return back({ meta: "connected", ig: String(saved.instagram) });
        } catch (e) {
          const c = e instanceof MetaConnectError ? e.code : "exchange_failed";
          return back({ meta_error: c });
        }
      },
    },
  },
});
