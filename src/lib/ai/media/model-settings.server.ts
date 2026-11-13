import { AI_MEDIA_MODEL_DEFAULTS, normalizeAiMediaModelSettings, type AiMediaModelSettings, type AiMediaModelSlot } from "./models";

type Loader = () => Promise<Partial<Record<AiMediaModelSlot, string | null>> | null>;
const TTL_MS = 60_000;

async function defaultLoader() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("ai_model_settings").select("image_model,video_model,voice_model").eq("id", true).maybeSingle();
  if (error) throw error;
  return data ? { image: data.image_model, video: data.video_model, voice: data.voice_model } : null;
}
let loader: Loader = defaultLoader;
let cache: { at: number; value: AiMediaModelSettings } | null = null;

/** Doar pentru teste. */
export function setAiMediaModelSettingsLoader(next: Loader | null) { loader = next ?? defaultLoader; cache = null; }
export function invalidateAiMediaModelSettingsCache() { cache = null; }

/** Modelele salvate în SuperAdmin sau implicite (cache 60 s). */
export async function loadAiMediaModelSettings(): Promise<AiMediaModelSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: AiMediaModelSettings;
  try { value = normalizeAiMediaModelSettings(await loader()); }
  catch (error) {
    console.error("[ai-media] model settings unavailable, using defaults", (error as Error)?.message ?? "");
    value = { ...AI_MEDIA_MODEL_DEFAULTS };
  }
  cache = { at: Date.now(), value };
  return value;
}
