/** Official MiniMax v1 and fal direct APIs. Secrets stay inside calls. */
export type AiMediaKind = "photo_enhance" | "photo_video" | "marketing_image";
export const DEFAULT_ENHANCE_PROMPT = "Improve this real estate photo: natural daylight, balanced exposure, clean colours, straight vertical lines. Keep the room exactly as it is; do not add or remove objects.";
export const AI_MEDIA_MODELS = {
  marketing_image: { id: "image-01", provider: "minimax" },
  photo_video: { id: "MiniMax-Hailuo-2.3-Fast", provider: "minimax" },
  photo_enhance: { id: "fal-ai/flux-pro/kontext", provider: "fal" },
} as const;

export class MediaProviderError extends Error {
  constructor(public code: string, message: string, public retryable = false) {
    super(message);
    this.name = "MediaProviderError";
  }
}
export function mediaError(error: unknown): MediaProviderError {
  return error instanceof MediaProviderError ? error : new MediaProviderError("internal", "Generarea nu a putut fi finalizată. Încearcă din nou.");
}
export function mediaConfigured(): boolean {
  return Boolean(process.env["MINIMAX_API_KEY"]?.trim() && process.env["FAL_KEY"]?.trim());
}
function keyFor(provider: "minimax" | "fal"): string {
  const key = process.env[provider === "minimax" ? "MINIMAX_API_KEY" : "FAL_KEY"]?.trim();
  if (!key) throw new MediaProviderError(`${provider}_not_configured`, `Conexiunea ${provider === "minimax" ? "MiniMax" : "fal"} nu este configurată. Contactează administratorul platformei.`);
  return key;
}
async function api(provider: "minimax" | "fal", path: string, body?: unknown): Promise<any> {
  const key = keyFor(provider);
  let response: Response;
  try {
    response = await fetch(`${provider === "minimax" ? "https://api.minimax.io" : "https://fal.run"}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `${provider === "minimax" ? "Bearer" : "Key"} ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(110_000),
    });
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new MediaProviderError(`${provider}_${timeout ? "timeout" : "network"}`, timeout ? "Serviciul de generare nu a răspuns la timp. Încearcă din nou." : "Serviciul de generare nu poate fi contactat acum. Încearcă din nou.", true);
  }
  if (!response.ok) {
    const message = [401, 403].includes(response.status) ? "Conexiunea serviciului de generare trebuie verificată de administrator." : response.status === 402 ? "Serviciul de generare nu are credit disponibil. Contactează administratorul platformei." : response.status === 429 ? "Serviciul de generare este ocupat. Încearcă din nou mai târziu." : "Serviciul nu a putut genera acest material. Încearcă din nou.";
    throw new MediaProviderError(`${provider}_http_${response.status}`, message, response.status === 429 || response.status >= 500);
  }
  let payload: any;
  try { payload = await response.json(); } catch { throw new MediaProviderError(`${provider}_invalid_response`, "Serviciul de generare a returnat un răspuns nevalid."); }
  if (provider === "minimax" && payload?.base_resp?.status_code !== 0) {
    const code = payload?.base_resp?.status_code;
    throw new MediaProviderError(`minimax_api_${typeof code === "number" ? code : "invalid"}`, code === 1008 ? "Serviciul de generare nu are credit disponibil. Contactează administratorul platformei." : code === 1004 ? "Conexiunea MiniMax trebuie verificată de administrator." : "MiniMax nu a putut genera acest material. Încearcă din nou.", code === 1002);
  }
  return payload;
}
function outputUrl(value: unknown): string {
  if (typeof value === "string") {
    try { if (new URL(value).protocol === "https:") return value; } catch { /* safe error below */ }
  }
  throw new MediaProviderError("output_missing", "Serviciul nu a returnat fișierul generat.");
}
export type MediaPrediction = { id: string | null; status: "running" | "succeeded" | "failed"; outputUrl: string | null; errorCode?: string };

export async function startAiMediaPrediction(input: { kind: AiMediaKind; prompt: string; sourceUrl: string | null }): Promise<MediaPrediction> {
  const model = AI_MEDIA_MODELS[input.kind];
  if (input.kind !== "marketing_image" && !input.sourceUrl) throw new MediaProviderError("source_missing", "Fotografia încărcată nu a putut fi citită.");
  if (input.kind === "marketing_image") {
    const result = await api("minimax", "/v1/image_generation", { model: model.id, prompt: input.prompt.trim(), aspect_ratio: "1:1", response_format: "url", n: 1 });
    return { id: null, status: "succeeded", outputUrl: outputUrl(result?.data?.image_urls?.[0]) };
  }
  if (input.kind === "photo_enhance") {
    const result = await api("fal", `/${model.id}`, { prompt: input.prompt.trim() || DEFAULT_ENHANCE_PROMPT, image_url: input.sourceUrl, output_format: "png", num_images: 1, safety_tolerance: "2" });
    return { id: null, status: "succeeded", outputUrl: outputUrl(result?.images?.[0]?.url) };
  }
  const result = await api("minimax", "/v1/video_generation", { model: model.id, prompt: input.prompt.trim() || "Slow cinematic camera move through the room, steady, realistic lighting.", first_frame_image: input.sourceUrl, resolution: "768P", duration: 6 });
  if (typeof result?.task_id !== "string" || !result.task_id) throw new MediaProviderError("minimax_task_missing", "MiniMax nu a returnat referința generării video.");
  return { id: result.task_id, status: "running", outputUrl: null };
}
export async function readAiMediaPrediction(id: string): Promise<MediaPrediction> {
  const result = await api("minimax", `/v1/query/video_generation?task_id=${encodeURIComponent(id)}`);
  if (result.status === "Fail") return { id, status: "failed", outputUrl: null, errorCode: "minimax_status_failed" };
  if (["Preparing", "Queueing", "Processing"].includes(result.status)) return { id, status: "running", outputUrl: null };
  if (result.status !== "Success" || !result.file_id) throw new MediaProviderError("minimax_status_invalid", "Starea generării video nu a putut fi citită.");
  const file = await api("minimax", `/v1/files/retrieve?file_id=${encodeURIComponent(String(result.file_id))}`);
  return { id, status: "succeeded", outputUrl: outputUrl(file?.file?.download_url) };
}

export async function downloadAiMedia(url: string, kind: AiMediaKind): Promise<{ bytes: Uint8Array; extension: string; contentType: string }> {
  let response: Response;
  try { response = await fetch(outputUrl(url), { signal: AbortSignal.timeout(110_000) }); }
  catch { throw new MediaProviderError("download_failed", "Rezultatul nu a putut fi descărcat. Încearcă din nou."); }
  if (!response.ok) throw new MediaProviderError("download_failed", "Rezultatul nu a putut fi descărcat. Încearcă din nou.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new MediaProviderError("download_empty", "Serviciul a returnat un fișier gol.");
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (kind === "photo_video") {
    if (String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp") throw new MediaProviderError("download_invalid", "Fișierul video primit nu este valid.");
    return { bytes, extension: "mp4", contentType: "video/mp4" };
  }
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return { bytes, extension: "png", contentType: "image/png" };
  if (bytes[0] === 255 && bytes[1] === 216) return { bytes, extension: "jpg", contentType: "image/jpeg" };
  if (contentType === "image/webp" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { bytes, extension: "webp", contentType };
  throw new MediaProviderError("download_invalid", "Fișierul imagine primit nu este valid.");
}