/**
 * Lucrător Instagram: termină Reel-urile rămase în procesare și șterge fișierele
 * temporare din `social-temp` mai vechi de 24 h. Iese imediat când nu are nimic de făcut.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/social-temp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const [{ data: old }, { data: pending }] = await Promise.all([
          db.from("social_temp_files").select("path").lt("created_at", cutoff).limit(500),
          db.from("meta_posts").select("id, organization_id, property_id, posted_by, page_name, page_id, kind, container_id, processing_until").eq("status", "processing").limit(20),
        ]);
        let deleted = 0;
        let finished = 0;
        const paths = ((old ?? []) as { path: string }[]).map((r) => r.path);
        if (paths.length) {
          const { error } = await supabaseAdmin.storage.from("social-temp").remove(paths);
          if (!error) {
            await db.from("social_temp_files").delete().in("path", paths);
            deleted = paths.length;
          }
        }
        if (pending?.length) {
          const { containerStatus, publishContainer } = await import("@/lib/meta/instagram.server");
          const { IgPostError } = await import("@/lib/meta/instagram-core");
          const fin = await import("@/lib/meta/instagram-finalize.server");
          const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
          for (const row of pending) {
            const { data: acc } = await db.from("meta_instagram_accounts").select("meta_pages(page_token_enc)").eq("organization_id", row.organization_id).eq("ig_user_id", row.page_id).maybeSingle();
            const { data: conn } = await db.from("meta_connections").select("id").eq("organization_id", row.organization_id).maybeSingle();
            const token = acc?.meta_pages?.page_token_enc ? decryptPortalCredential(acc.meta_pages.page_token_enc) : null;
            try {
              if (!token) throw new IgPostError("expired", "Conexiunea Instagram a expirat. Reconectează pagina din Setări → Promovare.");
              const s = await containerStatus(token, row.container_id);
              if (s === "FINISHED") {
                await fin.markInstagramPublished(db, row, await publishContainer(row.page_id, token, row.container_id), true);
                finished++;
              } else if (s === "ERROR" || s === "EXPIRED" || (row.processing_until && row.processing_until < new Date().toISOString())) {
                throw new IgPostError("video", "Instagram nu a putut procesa video-ul.");
              }
            } catch (e) {
              const err = e instanceof IgPostError ? e : new IgPostError("rejected", "Postarea nu a reușit.");
              await fin.markInstagramFailed(db, row, { message: err.message, code: err.code, raw: err.raw, kind: err.kind }, conn?.id ?? null, true);
            }
          }
        }
        return Response.json({ ok: true, deleted, finished });
      },
    },
  },
});
