import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { NARRATION_BUCKET, NARRATION_FEATURE, NARRATION_MODEL, validateNarration, type NarrationItem, type NarrationVoice } from "./video-narration";
import { isAiFeatureEnabled } from "./ai/features/features.server";
import { generateMiniMaxNarration, narrationConfigured } from "./video-narration-minimax.server";

type Client = SupabaseClient<Database>;
export async function narrationAccess(client: Client, userId: string, propertyId: string) {
  const { data: profile } = await client.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
  if (!profile?.organization_id) throw new Error("Contul tău nu este legat de o agenție.");
  const org = profile.organization_id;
  if (!(await isAiFeatureEnabled(org, NARRATION_FEATURE))) throw new Error("Voce AI în video nu este activată pentru agenția ta.");
  // Read as caller: preserves property permissions and soft deletion rules.
  const { data: property } = await client.from("properties").select("id").eq("id", propertyId).eq("organization_id", org).is("deleted_at", null).maybeSingle();
  if (!property) throw new Error("Proprietatea nu este disponibilă.");
  return org;
}
export async function narrationItem(client: Client, id: string, propertyId: string): Promise<NarrationItem> {
  const { data: row, error } = await client.from("video_narrations").select("*").eq("id", id).eq("property_id", propertyId).single();
  if (error || !row) throw new Error("Narațiunea nu este disponibilă.");
  let outputUrl: string | null = null;
  if (row.storage_path && row.status === "succeeded") {
    const { data, error: signError } = await client.storage.from(NARRATION_BUCKET).createSignedUrl(row.storage_path, 600);
    if (signError || !data?.signedUrl) throw new Error("Vocea nu a putut fi încărcată.");
    outputUrl = data.signedUrl;
  }
  return { id: row.id, text: row.text, voice: row.voice as NarrationVoice, duration_sec: row.duration_sec, status: row.status as NarrationItem["status"], error: row.error, outputUrl };
}
export async function startNarrationCore(client: Client, userId: string, input: { propertyId: string; requestKey: string; text: string; voice: NarrationVoice; seconds: number }) {
  const org = await narrationAccess(client, userId, input.propertyId);
  const invalid = validateNarration(input.text, input.seconds); if (invalid) throw new Error(invalid);
  if (!narrationConfigured()) throw new Error("AI nu este configurat.");
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const { data: id, error } = await admin.rpc("reserve_video_narration", { p_org: org, p_property: input.propertyId, p_user: userId, p_key: input.requestKey, p_text: input.text.trim(), p_voice: input.voice, p_duration: input.seconds, p_model: NARRATION_MODEL });
  if (error || !id) throw new Error(error?.message ?? "Generarea nu a putut fi pornită.");
  const { data: claimed } = await admin.from("video_narrations").update({ prediction_id: "starting" }).eq("id", id).is("prediction_id", null).select("id,usage_event_id").maybeSingle();
  if (claimed) {
    const startedAt = Date.now();
    const path = `${org}/${input.propertyId}/${id}.mp3`;
    let uploaded = false;
    try {
      const audio = await generateMiniMaxNarration(input.text, input.voice);
      const { error: upload } = await admin.storage.from(NARRATION_BUCKET).upload(path, audio.bytes, { contentType: "audio/mpeg", upsert: true });
      if (upload) throw new Error("Vocea nu a putut fi salvată.");
      uploaded = true;
      const { error: saved } = await admin.from("video_narrations").update({ status: "succeeded", storage_path: path, error: null }).eq("id", id);
      if (saved) throw new Error("Vocea nu a putut fi salvată.");
      if (claimed.usage_event_id) await admin.from("ai_usage_events").update({ provider: "minimax", model: NARRATION_MODEL, success: true, latency_ms: Date.now() - startedAt, extra_info: { usage_characters: audio.usageCharacters } }).eq("id", claimed.usage_event_id);
    } catch (e) {
      if (uploaded) await admin.storage.from(NARRATION_BUCKET).remove([path]);
      const message = e instanceof Error ? e.message : "Generarea a eșuat.";
      await admin.from("video_narrations").update({ status: "failed", error: message }).eq("id", id);
      if (claimed.usage_event_id) await admin.from("ai_usage_events").update({ provider: "minimax", model: NARRATION_MODEL, success: false, latency_ms: Date.now() - startedAt }).eq("id", claimed.usage_event_id);
      throw new Error(message);
    }
  }
  return narrationItem(client, id, input.propertyId);
}
export async function refreshNarrationCore(client: Client, userId: string, propertyId: string, id: string) {
  const org = await narrationAccess(client, userId, propertyId);
  const { data: row } = await client.from("video_narrations").select("*").eq("id", id).eq("property_id", propertyId).eq("organization_id", org).maybeSingle();
  if (!row) throw new Error("Narațiunea nu este disponibilă.");
  if (row.status !== "running") return narrationItem(client, id, propertyId);
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const elapsed = Date.now() - Date.parse(row.created_at);
  if (elapsed > 10 * 60_000) {
    const message = "Generarea a depășit timpul de așteptare. Încearcă din nou.";
    await admin.from("video_narrations").update({ status: "failed", error: message }).eq("id", id);
    if (row.usage_event_id) await admin.from("ai_usage_events").update({ success: false, latency_ms: Math.round(elapsed) }).eq("id", row.usage_event_id);
  }
  return narrationItem(client, id, propertyId);
}