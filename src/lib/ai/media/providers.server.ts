/** Studio AI: imagini Gemini (date inline), video și îmbunătățire foto prin fal. Secretele rămân în apeluri. */
import { AI_MEDIA_MODEL_DEFAULTS } from "./models";

export type AiMediaKind = "photo_enhance" | "photo_video" | "marketing_image";
export const DEFAULT_ENHANCE_PROMPT = "Improve this real estate photo: natural daylight, balanced exposure, clean colours, straight vertical lines. Keep the room exactly as it is; do not add or remove objects.";
export const DEFAULT_VIDEO_PROMPT = "Slow cinematic camera move through the room, steady, realistic lighting.";
/** Furnizorul și modelul implicit pe tip; imaginea și video-ul pot fi schimbate din SuperAdmin. */
export const AI_MEDIA_MODELS = {
  marketing_image: { id: AI_MEDIA_MODEL_DEFAULTS.image, provider: "gemini" },
  photo_video: { id: AI_MEDIA_MODEL_DEFAULTS.video, provider: "fal" },
  photo_enhance: { id: "fal-ai/flux-pro/kontext", provider: "fal" },
} as const;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

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
  return Boolean(process.env["GEMINI_API_KEY"]?.trim() && process.env["FAL_KEY"]?.trim());
}
type Provider = "gemini" | "fal";
function keyFor(provider: Provider): string {
  const key = process.env[provider === "gemini" ? "GEMINI_API_KEY" : "FAL_KEY"]?.trim();
  if (!key) throw new MediaProviderError(`${provider}_not_configured`, `Conexiunea ${provider === "gemini" ? "Gemini" : "fal"} nu este configurată. Contactează administratorul platformei.`);
  return key;
}
async function api(provider: Provider, url: string, body?: unknown): Promise<any> {
  const key = keyFor(provider);
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(provider === "gemini" ? { "x-goog-api-key": key } : { Authorization: `Key ${key}` }), "Content-Type": "application/json" },
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
  try { return await response.json(); } catch { throw new MediaProviderError(`${provider}_invalid_response`, "Serviciul de generare a returnat un răspuns nevalid."); }
}
function outputUrl(value: unknown): string {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      // Some provider CDNs return HTTP links; fetch their HTTPS equivalent only.
      if (url.protocol === "http:") url.protocol = "https:";
      if (url.protocol === "https:") return url.href;
    } catch { /* safe error below */ }
  }
  throw new MediaProviderError("output_missing", "Serviciul nu a returnat fișierul generat.");
}
function safeModel(model: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(model) || model.includes("..")) throw new MediaProviderError("model_invalid", "Modelul configurat nu este valid.");
  return model;
}
/** fal queue: status/result folosesc doar aplicația (primele două segmente). */
export function falQueueApp(model: string): string { return safeModel(model).split("/").slice(0, 2).join("/"); }

export type MediaPrediction = { id: string | null; status: "running" | "succeeded" | "failed"; outputUrl: string | null; inline?: Uint8Array; errorCode?: string };

function decodeBase64(data: unknown): Uint8Array {
  if (typeof data !== "string" || !data || data.length > 30 * 1024 * 1024) throw new MediaProviderError("output_missing", "Serviciul nu a returnat fișierul generat.");
  try { return Uint8Array.from(atob(data), (c) => c.charCodeAt(0)); }
  catch { throw new MediaProviderError("output_invalid", "Serviciul a returnat un fișier nevalid."); }
}

export async function startAiMediaPrediction(input: { kind: AiMediaKind; prompt: string; sourceUrl: string | null; model?: string }): Promise<MediaPrediction> {
  const model = safeModel(input.model || AI_MEDIA_MODELS[input.kind].id);
  if (input.kind !== "marketing_image" && !input.sourceUrl) throw new MediaProviderError("source_missing", "Fotografia încărcată nu a putut fi citită.");
  if (input.kind === "marketing_image") {
    const result = await api("gemini", `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      contents: [{ role: "user", parts: [{ text: input.prompt.trim() }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
    });
    const parts: any[] = result?.candidates?.[0]?.content?.parts ?? [];
    const image = parts.find((p) => p?.inlineData?.data || p?.inline_data?.data);
    if (!image) throw new MediaProviderError("gemini_no_image", "Gemini nu a returnat nicio imagine. Reformulează descrierea și încearcă din nou.");
    return { id: null, status: "succeeded", outputUrl: null, inline: decodeBase64((image.inlineData ?? image.inline_data).data) };
  }
  if (input.kind === "photo_enhance") {
    const result = await api("fal", `https://fal.run/${model}`, { prompt: input.prompt.trim() || DEFAULT_ENHANCE_PROMPT, image_url: input.sourceUrl, output_format: "png", num_images: 1, safety_tolerance: "2" });
    return { id: null, status: "succeeded", outputUrl: outputUrl(result?.images?.[0]?.url) };
  }
  const result = await api("fal", `https://queue.fal.run/${model}`, { prompt: input.prompt.trim() || DEFAULT_VIDEO_PROMPT, image_url: input.sourceUrl, duration: "5" });
  if (typeof result?.request_id !== "string" || !result.request_id) throw new MediaProviderError("fal_task_missing", "Serviciul video nu a returnat referința generării.");
  return { id: result.request_id, status: "running", outputUrl: null };
}
export async function readAiMediaPrediction(id: string, model: string = AI_MEDIA_MODELS.photo_video.id): Promise<MediaPrediction> {
  const base = `https://queue.fal.run/${falQueueApp(model)}/requests/${encodeURIComponent(id)}`;
  const status = await api("fal", `${base}/status`);
  if (status?.status === "IN_QUEUE" || status?.status === "IN_PROGRESS") return { id, status: "running", outputUrl: null };
  if (status?.status !== "COMPLETED") throw new MediaProviderError("fal_status_invalid", "Starea generării video nu a putut fi citită.");
  if (status.error) return { id, status: "failed", outputUrl: null, errorCode: "fal_status_failed" };
  let result: any;
  try { result = await api("fal", base); }
  catch (error) {
    const safe = mediaError(error);
    if (safe.retryable) throw safe;
    return { id, status: "failed", outputUrl: null, errorCode: "fal_status_failed" };
  }
  return { id, status: "succeeded", outputUrl: outputUrl(result?.video?.url) };
}

export function validateAiMediaBytes(bytes: Uint8Array, kind: AiMediaKind, contentType?: string | null): { bytes: Uint8Array; extension: string; contentType: string } {
  if (!bytes.length) throw new MediaProviderError("download_empty", "Serviciul a returnat un fișier gol.");
  if (kind === "photo_video") {
    if (String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp") throw new MediaProviderError("download_invalid", "Fișierul video primit nu este valid.");
    return { bytes, extension: "mp4", contentType: "video/mp4" };
  }
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return { bytes, extension: "png", contentType: "image/png" };
  if (bytes[0] === 255 && bytes[1] === 216) return { bytes, extension: "jpg", contentType: "image/jpeg" };
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" && (!contentType || contentType === "image/webp")) return { bytes, extension: "webp", contentType: "image/webp" };
  throw new MediaProviderError("download_invalid", "Fișierul imagine primit nu este valid.");
}
export async function downloadAiMedia(url: string, kind: AiMediaKind): Promise<{ bytes: Uint8Array; extension: string; contentType: string }> {
  let response: Response;
  try { response = await fetch(outputUrl(url), { signal: AbortSignal.timeout(110_000) }); }
  catch { throw new MediaProviderError("download_failed", "Rezultatul nu a putut fi descărcat. Încearcă din nou."); }
  if (!response.ok) throw new MediaProviderError("download_failed", "Rezultatul nu a putut fi descărcat. Încearcă din nou.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  return validateAiMediaBytes(bytes, kind, response.headers.get("content-type")?.split(";")[0]?.trim());
}
