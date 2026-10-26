import { AI_MEDIA_MODELS, MediaProviderError, downloadAiMedia, mediaError, readAiMediaPrediction, startAiMediaPrediction, type AiMediaKind } from "./providers.server";

// Caller client handles rows (RLS); privileged client only writes usage and media.
type MediaContext = { supabase: any; userId: string };
async function usage(admin: any, row: any, userId: string, result: { success: boolean; status: string; errorCode?: string }, insert: boolean) {
  const event = {
    organization_id: row.organization_id, user_id: userId,
    provider: AI_MEDIA_MODELS[row.kind as AiMediaKind].provider, model: row.model,
    capability: "ai_media", success: result.success,
    latency_ms: Math.max(0, Date.now() - Date.parse(row.created_at)),
    input_tokens: null, output_tokens: null, tokens_unknown: true, tool_calls: 0,
    extra_info: { generation_id: row.id, status: result.status, ...(result.errorCode ? { error_code: result.errorCode } : {}) },
  };
  const query = admin.from("ai_usage_events");
  const { error } = insert ? await query.insert(event) : await query.update(event).eq("capability", "ai_media").eq("extra_info->>generation_id", row.id);
  if (error) throw new MediaProviderError("usage_failed", "Înregistrarea consumului nu a putut fi salvată. Încearcă din nou.");
}
async function saveOutput(admin: any, row: any, url: string): Promise<string> {
  const file = await downloadAiMedia(url, row.kind);
  const path = `${row.organization_id}/${row.created_by}/${row.id}.${file.extension}`;
  const { error } = await admin.storage.from("ai-media").upload(path, file.bytes, { contentType: file.contentType, upsert: true });
  if (error) throw new MediaProviderError("upload_failed", "Rezultatul nu a putut fi salvat. Încearcă din nou.");
  return path;
}
async function settle(context: MediaContext, admin: any, row: any, output: string | null, error?: MediaProviderError) {
  const { data, error: updateError } = await context.supabase.from("ai_media_generations")
    .update({ status: error ? "failed" : "succeeded", output_url: output, error: error?.message ?? null })
    .eq("id", row.id).eq("status", "running").select("id");
  if (updateError) {
    if (output) await admin.storage.from("ai-media").remove([output]);
    throw new MediaProviderError("row_update_failed", "Starea generării nu a putut fi salvată.");
  }
  if (data?.length) await usage(admin, row, row.created_by, { success: !error, status: error ? "failed" : "succeeded", errorCode: error?.code }, false);
}
export async function startMediaGeneration(context: MediaContext, admin: any, organizationId: string, input: { kind: AiMediaKind; prompt: string; sourcePath: string | null }) {
  const model = AI_MEDIA_MODELS[input.kind];
  const { data: row, error: insertError } = await context.supabase.from("ai_media_generations").insert({ organization_id: organizationId, created_by: context.userId, kind: input.kind, prompt: input.prompt, source_url: input.sourcePath, model: model.id, status: "running" }).select("*").single();
  if (insertError || !row) return { ok: false as const, message: "Generarea nu a putut fi înregistrată." };
  try {
    await usage(admin, row, context.userId, { success: false, status: "running" }, true);
    let sourceUrl: string | null = null;
    if (input.sourcePath) {
      if (!input.sourcePath.startsWith(`${organizationId}/`)) throw new MediaProviderError("source_invalid", "Fotografia nu aparține agenției tale.");
      const { data, error } = await context.supabase.storage.from("ai-media").createSignedUrl(input.sourcePath, 3600);
      if (error || !data?.signedUrl) throw new MediaProviderError("source_unreadable", "Fotografia încărcată nu a putut fi citită.");
      sourceUrl = data.signedUrl;
    }
    const prediction = await startAiMediaPrediction({ kind: input.kind, prompt: input.prompt, sourceUrl });
    if (prediction.status === "running") {
      const { error } = await context.supabase.from("ai_media_generations").update({ prediction_id: prediction.id }).eq("id", row.id);
      if (error) throw new MediaProviderError("row_update_failed", "Referința generării video nu a putut fi salvată.");
    } else if (prediction.outputUrl) {
      const output = await saveOutput(admin, row, prediction.outputUrl);
      await settle(context, admin, row, output);
    }
    return { ok: true as const, id: row.id as string };
  } catch (error) {
    const safe = mediaError(error);
    await settle(context, admin, row, null, safe);
    return { ok: false as const, message: safe.message };
  }
}
export async function refreshMediaGeneration(context: MediaContext, admin: any, row: any) {
  // The unchanged UI may refresh an image row while its synchronous call is
  // still downloading. Likewise video submission has not yet saved task_id.
  if (row.model === AI_MEDIA_MODELS[row.kind as AiMediaKind]?.id && (row.kind !== "photo_video" || !row.prediction_id)) return { ok: true as const };
  try {
    // Historical tasks cannot be queried on another provider. No outbound legacy calls.
    if (row.kind !== "photo_video" || row.model !== AI_MEDIA_MODELS.photo_video.id) throw new MediaProviderError("legacy_task", "Această generare veche nu mai poate fi urmărită. Pornește o generare nouă.");
    if (!row.prediction_id) throw new MediaProviderError("task_missing", "Generarea nu are o referință video.");
    const prediction = await readAiMediaPrediction(row.prediction_id);
    if (prediction.status === "failed") throw new MediaProviderError(prediction.errorCode ?? "minimax_status_failed", "MiniMax nu a putut finaliza videoclipul. Încearcă din nou.");
    if (prediction.status === "succeeded" && prediction.outputUrl) await settle(context, admin, row, await saveOutput(admin, row, prediction.outputUrl));
    return { ok: true as const };
  } catch (error) {
    const safe = mediaError(error);
    if (safe.retryable) {
      await usage(admin, row, row.created_by, { success: false, status: "running", errorCode: safe.code }, false);
    } else {
      await settle(context, admin, row, null, safe);
    }
    return { ok: false as const, message: safe.message };
  }
}