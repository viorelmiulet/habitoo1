/** Studio AI: authenticated agency rows, private output storage, MiniMax and fal. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiFeatureDisabledMessage, type AiFeatureKey } from "@/lib/ai/features/keys";

export const AI_MEDIA_BUCKET = "ai-media";
const SIGNED_URL_TTL_SECONDS = 60 * 60;


const AI_FEATURE: AiFeatureKey = "ai_media";

/** Agenția utilizatorului, doar dacă Studio AI este activat pentru ea. */
async function resolveMediaOrganization(
  context: { supabase: { from: (t: string) => any }; userId: string },
): Promise<{ organizationId: string } | { message: string }> {
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  const organizationId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!organizationId) return { message: "Contul tău nu este legat de o agenție." };
  const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
  if (!(await isAiFeatureEnabled(organizationId, AI_FEATURE))) {
    return { message: aiFeatureDisabledMessage(AI_FEATURE) };
  }
  return { organizationId };
}

const kindSchema = z.enum(["photo_enhance", "photo_video", "marketing_image"]);

export type AiMediaItem = {
  id: string;
  kind: "photo_enhance" | "photo_video" | "marketing_image";
  prompt: string;
  status: "running" | "succeeded" | "failed";
  model: string;
  error: string | null;
  createdAt: string;
  /** Link semnat, valabil o oră; `null` cât timp generarea rulează. */
  outputUrl: string | null;
  sourceUrl: string | null;
};

type Row = {
  id: string;
  kind: string;
  prompt: string;
  status: string;
  model: string;
  error: string | null;
  created_at: string;
  output_url: string | null;
  source_url: string | null;
};

async function signPath(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage
    .from(AI_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

async function toItem(row: Row): Promise<AiMediaItem> {
  return {
    id: row.id,
    kind: row.kind as AiMediaItem["kind"],
    prompt: row.prompt,
    status: row.status as AiMediaItem["status"],
    model: row.model,
    error: row.error,
    createdAt: row.created_at,
    outputUrl: await signPath(row.output_url),
    sourceUrl: await signPath(row.source_url),
  };
}

const ROW_COLUMNS =
  "id, kind, prompt, status, model, error, created_at, output_url, source_url" as const;

/** Starea configurării furnizorilor, fără să expună cheile. */
export const getAiMediaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const resolved = await resolveMediaOrganization(context);
    if ("message" in resolved) return { configured: false, featureEnabled: false };
    const { mediaConfigured } = await import("@/lib/ai/media/providers.server");
    return { configured: mediaConfigured(), featureEnabled: true };
  });

/** Istoricul generărilor agenției (cele mai recente primele). */
export const listAiMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const resolved = await resolveMediaOrganization(context);
    if ("message" in resolved) return { items: [] as AiMediaItem[] };
    const { data, error } = await context.supabase
      .from("ai_media_generations")
      .select(ROW_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const items = await Promise.all(((data ?? []) as Row[]).map(toItem));
    return { items };
  });

/** Pornește o generare și salvează rândul „în lucru”. */
export const startAiMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: kindSchema,
        prompt: z.string().max(2000).default(""),
        /** Calea fișierului sursă încărcat în stocarea agenției. */
        sourcePath: z.string().max(500).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.kind === "marketing_image" && data.prompt.trim() === "") {
      return { ok: false as const, message: "Scrie ce imagine vrei să genereze." };
    }
    if (data.kind !== "marketing_image" && !data.sourcePath) {
      return { ok: false as const, message: "Încarcă o fotografie înainte de a genera." };
    }

    const resolved = await resolveMediaOrganization(context);
    if ("message" in resolved) return { ok: false as const, message: resolved.message };
    const organizationId = resolved.organizationId;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startMediaGeneration } = await import("@/lib/ai/media/generation.server");
    const result = await startMediaGeneration(context, supabaseAdmin, organizationId, data);
    if (!result.ok) return result;
    const { data: inserted, error } = await context.supabase
      .from("ai_media_generations").select(ROW_COLUMNS).eq("id", result.id).single();
    if (error || !inserted) return { ok: false as const, message: "Rezultatul generării nu a putut fi citit." };
    return { ok: true as const, item: await toItem(inserted as Row) };
  });

/** Verifică o generare în lucru și, la succes, copiază fișierul în stocare. */
export const refreshAiMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const resolved = await resolveMediaOrganization(context);
    if ("message" in resolved) return { ok: false as const, message: resolved.message };
    const { data: row, error: readError } = await context.supabase
      .from("ai_media_generations")
      .select("id, organization_id, created_by, kind, model, created_at, prediction_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) return { ok: false as const, message: "Generarea nu a fost găsită." };
    if (row.status !== "running") {
      const { data: done } = await context.supabase
        .from("ai_media_generations")
        .select(ROW_COLUMNS)
        .eq("id", data.id)
        .single();
      return { ok: true as const, item: await toItem(done as Row) };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshMediaGeneration } = await import("@/lib/ai/media/generation.server");
    const result = await refreshMediaGeneration(context, supabaseAdmin, row);
    if (!result.ok) return result;

    const { data: fresh } = await context.supabase
      .from("ai_media_generations")
      .select(ROW_COLUMNS)
      .eq("id", row.id)
      .single();
    return { ok: true as const, item: await toItem(fresh as Row) };
  });

/** Șterge o generare proprie, împreună cu fișierele ei. */
export const deleteAiMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const resolved = await resolveMediaOrganization(context);
    if ("message" in resolved) return { ok: true as const };
    const { data: row } = await context.supabase
      .from("ai_media_generations")
      .select("id, output_url, source_url")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: true as const };
    const paths = [row.output_url, row.source_url].filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(AI_MEDIA_BUCKET).remove(paths);
    }
    const { error } = await context.supabase
      .from("ai_media_generations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
