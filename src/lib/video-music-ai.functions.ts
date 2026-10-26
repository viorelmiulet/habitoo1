/**
 * Funcția server pentru „Generează cu AI” din SuperAdmin → Muzică video.
 * Doar SuperAdmin; cheia FAL_KEY se citește în handler și nu ajunge în browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MUSIC_AI_MAX_SECONDS, MUSIC_AI_MIN_SECONDS } from "@/lib/video-music-ai";

type AuthContext = {
  supabase: {
    rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
    from: (table: "profiles") => {
      select: (cols: string) => { eq: (col: string, value: string) => { maybeSingle: () => PromiseLike<{ data: { organization_id: string | null } | null }> } };
    };
  };
  userId: string;
};

async function assertSuperadmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) throw new Error("Acces refuzat.");
  return context.userId;
}

export const generateVideoMusicSchema = z.object({
  title: z.string().max(120),
  style: z.string().max(120),
  durationSec: z.number().int().min(MUSIC_AI_MIN_SECONDS).max(MUSIC_AI_MAX_SECONDS),
});

export const generateVideoMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => generateVideoMusicSchema.parse(data))
  .handler(async ({ data, context }) => {
    const userId = await assertSuperadmin(context as unknown as AuthContext);
    const apiKey = process.env["FAL_KEY"];
    if (!apiKey) throw new Error("Generarea de muzică cu AI nu este configurată.");
    const { data: profile } = await (context as unknown as AuthContext).supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateAiMusicTrack } = await import("@/lib/video-music-ai.server");
    return generateAiMusicTrack({
      apiKey,
      input: data,
      userId,
      organizationId: profile?.organization_id ?? null,
      db: supabaseAdmin as unknown as Parameters<typeof generateAiMusicTrack>[0]["db"],
    });
  });
