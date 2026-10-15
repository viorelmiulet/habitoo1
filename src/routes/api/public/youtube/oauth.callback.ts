/**
 * GET /api/public/youtube/oauth/callback — retur OAuth Google pentru canalul YouTube al agenției.
 * Fără `state` semnat și neexpirat nu se schimbă nimic. Refresh tokenul se salvează criptat.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getCrmUrl } from "@/lib/host";

export const Route = createFileRoute("/api/public/youtube/oauth/callback")({
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
        const secret = process.env["GOOGLE_YT_CLIENT_SECRET"];
        if (!secret) return back({ yt_error: "config" });
        const core = await import("@/lib/youtube/core");
        const state = core.verifyYoutubeState(url.searchParams.get("state"), secret);
        if (!state) return back({ yt_error: "invalid_state" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [{ data: profile }, { data: roles }] = await Promise.all([
          supabaseAdmin.from("profiles").select("organization_id").eq("id", state.userId).maybeSingle(),
          supabaseAdmin.from("user_roles").select("role").eq("user_id", state.userId),
        ]);
        const r = (roles ?? []).map((x) => x.role as string);
        if (!r.includes("superadmin") && (!r.includes("agency_admin") || profile?.organization_id !== state.organizationId)) {
          return back({ yt_error: "invalid_state" });
        }

        const code = url.searchParams.get("code");
        if (url.searchParams.get("error") || !code) return back({ yt_error: "denied" });

        try {
          const tokens = await core.exchangeYoutubeCode(code, secret);
          const channel = await core.fetchYoutubeChannel(tokens.accessToken);
          const { encryptPortalCredential } = await import("@/lib/portals/crypto.server");
          const now = new Date().toISOString();
          const { error } = await supabaseAdmin.from("youtube_connections").upsert(
            {
              organization_id: state.organizationId,
              channel_id: channel.id,
              channel_title: channel.title,
              channel_thumbnail: channel.thumbnail,
              refresh_token_enc: encryptPortalCredential(tokens.refreshToken),
              status: "connected",
              connected_by: state.userId,
              connected_at: now,
              disconnected_at: null,
              updated_at: now,
            },
            { onConflict: "organization_id" },
          );
          if (error) throw new Error("exchange_failed");
          await supabaseAdmin.from("audit_logs").insert({
            organization_id: state.organizationId,
            actor_id: state.userId,
            action: "youtube.connected",
            entity: "youtube_connection",
            new_values: { channel: channel.title },
          });
          return back({ yt: "connected" });
        } catch (e) {
          return back({ yt_error: e instanceof Error && e.message === "no_channel" ? "no_channel" : "exchange_failed" });
        }
      },
    },
  },
});
