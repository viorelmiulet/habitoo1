/**
 * Generare de muzică cu AI prin fal.ai (ACE-Step), numai pe server.
 * Cheia FAL_KEY nu părăsește serverul și nu apare în loguri sau răspunsuri.
 * O generare eșuată nu lasă rânduri sau fișiere în bibliotecă.
 */
import { MUSIC_BUCKET } from "@/lib/video-music";
import {
  MUSIC_AI_ARTIST,
  MUSIC_AI_DAILY_LIMIT,
  MUSIC_AI_LICENSE,
  buildAiMusicPrompt,
  validateAiMusicInput,
  type AiMusicInput,
} from "@/lib/video-music-ai";

const FAL_SUBMIT_URL = "https://queue.fal.run/fal-ai/ace-step/prompt-to-audio";
const POLL_INTERVAL_MS = 2000;
const POLL_BUDGET_MS = 115_000;

export class AiMusicError extends Error {}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
export type AiMusicDeps = { fetchFn?: FetchFn; sleep?: (ms: number) => Promise<void> };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function falErrorMessage(status: number): string {
  if (status === 401 || status === 403) return "Cheia serviciului de generare nu este validă.";
  if (status === 429) return "Serviciul de generare este ocupat. Încearcă din nou în câteva minute.";
  return "Generarea nu a putut fi pornită. Încearcă din nou.";
}

type FalSubmit = { request_id?: string; status_url?: string; response_url?: string };

/** Trimite cererea la coada fal.ai și întoarce URL-urile de urmărire. */
async function submitFal(apiKey: string, input: AiMusicInput, fetchFn: FetchFn): Promise<{ statusUrl: string; responseUrl: string }> {
  let res: Response;
  try {
    res = await fetchFn(FAL_SUBMIT_URL, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: buildAiMusicPrompt(input), instrumental: true, duration: input.durationSec }),
    });
  } catch {
    throw new AiMusicError("Serviciul de generare nu a putut fi contactat. Încearcă din nou.");
  }
  if (!res.ok) throw new AiMusicError(falErrorMessage(res.status));
  const body = (await res.json().catch(() => null)) as FalSubmit | null;
  if (!body?.status_url || !body?.response_url) throw new AiMusicError("Răspunsul serviciului de generare nu a putut fi citit.");
  return { statusUrl: body.status_url, responseUrl: body.response_url };
}

/** Urmărește cererea până e gata și întoarce URL-ul fișierului audio. */
async function awaitFalAudioUrl(apiKey: string, urls: { statusUrl: string; responseUrl: string }, deps: Required<AiMusicDeps>): Promise<string> {
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > POLL_BUDGET_MS) throw new AiMusicError("Generarea a durat prea mult. Încearcă din nou.");
    await deps.sleep(POLL_INTERVAL_MS);
    const statusRes = await deps.fetchFn(urls.statusUrl, { headers: { Authorization: `Key ${apiKey}` } }).catch(() => null);
    if (statusRes?.ok) {
      const status = ((await statusRes.json().catch(() => null)) as { status?: string } | null)?.status;
      if (status === "FAILED") throw new AiMusicError("Generarea a eșuat. Încearcă din nou.");
      if (status === "COMPLETED") break;
    }
  }
  const resultRes = await deps.fetchFn(urls.responseUrl, { headers: { Authorization: `Key ${apiKey}` } }).catch(() => null);
  if (!resultRes?.ok) throw new AiMusicError("Rezultatul generării nu a putut fi citit.");
  const result = (await resultRes.json().catch(() => null)) as { audio?: { url?: string; content_type?: string; file_name?: string } } | null;
  const url = result?.audio?.url;
  if (!url) throw new AiMusicError("Fișierul generat lipsește din răspuns.");
  return url;
}

function audioExtension(contentType: string | null, url: string): string {
  if (contentType?.includes("mpeg") || contentType?.includes("mp3")) return "mp3";
  if (contentType?.includes("wav")) return "wav";
  const match = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(url);
  return match ? match[1].toLowerCase() : "wav";
}

/** Porțiunea de bază de date de care are nevoie generarea (supabaseAdmin sau un dublu de test). */
export type AiMusicDb = {
  from: (table: "ai_usage_events" | "video_music_tracks") => {
    select: (cols: string, opts?: { count?: "exact"; head?: boolean }) => {
      eq: (col: string, value: unknown) => {
        eq: (col: string, value: unknown) => {
          eq: (col: string, value: unknown) => { gte: (col: string, value: string) => PromiseLike<{ count: number | null }> };
        };
      };
      order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => PromiseLike<{ data: { position: number }[] | null }> };
    };
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Blob, opts: { contentType: string }) => PromiseLike<{ error: { message: string } | null }>;
      remove: (paths: string[]) => PromiseLike<unknown>;
    };
  };
};

export type AiMusicResult = { id: string; title: string; durationSec: number; storagePath: string };

/**
 * Generează o piesă și o adaugă inactivă în bibliotecă. Pașii: limită zilnică →
 * coadă fal.ai → descărcare → stocare → rând nou. Orice eșec nu lasă urme.
 */
export async function generateAiMusicTrack(
  args: { apiKey: string; input: AiMusicInput; userId: string; organizationId: string | null; db: AiMusicDb },
  deps: AiMusicDeps = {},
): Promise<AiMusicResult> {
  const validationError = validateAiMusicInput(args.input);
  if (validationError) throw new AiMusicError(validationError);
  const fetchFn = deps.fetchFn ?? fetch;
  const fullDeps: Required<AiMusicDeps> = { fetchFn, sleep: deps.sleep ?? defaultSleep };
  const startedAt = Date.now();

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await args.db
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("provider", "fal")
    .eq("capability", "music")
    .eq("success", true)
    .gte("created_at", dayStart.toISOString());
  if ((count ?? 0) >= MUSIC_AI_DAILY_LIMIT) {
    throw new AiMusicError(`Ai atins limita de ${MUSIC_AI_DAILY_LIMIT} de generări pe zi. Încearcă mâine.`);
  }

  const writeUsage = (success: boolean) =>
    args.db
      .from("ai_usage_events")
      .insert({
        organization_id: args.organizationId,
        user_id: args.userId,
        provider: "fal",
        model: "ace-step",
        capability: "music",
        input_tokens: null,
        output_tokens: null,
        latency_ms: Date.now() - startedAt,
        success,
        tool_calls: 0,
        tokens_unknown: true,
        fallback_used: false,
      })
      .then(({ error }) => {
        if (error) console.error("[ai-music] usage insert failed", error.message);
      });

  try {
    const urls = await submitFal(args.apiKey, args.input, fetchFn);
    const audioUrl = await awaitFalAudioUrl(args.apiKey, urls, fullDeps);
    const audioRes = await fetchFn(audioUrl).catch(() => null);
    if (!audioRes?.ok) throw new AiMusicError("Fișierul generat nu a putut fi descărcat.");
    const contentType = audioRes.headers.get("content-type");
    const bytes = await audioRes.arrayBuffer();

    const id = crypto.randomUUID();
    const ext = audioExtension(contentType, audioUrl);
    const storagePath = `tracks/${id}.${ext}`;
    const upload = await args.db.storage
      .from(MUSIC_BUCKET)
      .upload(storagePath, new Blob([bytes], { type: contentType ?? "audio/wav" }), { contentType: contentType ?? "audio/wav" });
    if (upload.error) throw new AiMusicError("Fișierul generat nu a putut fi salvat.");

    const { data: last } = await args.db.from("video_music_tracks").select("position").order("position", { ascending: false }).limit(1);
    const position = (last?.[0]?.position ?? -1) + 1;
    const { error } = await args.db.from("video_music_tracks").insert({
      id,
      title: args.input.title.trim(),
      style: args.input.style.trim(),
      artist: MUSIC_AI_ARTIST,
      source_url: "",
      license: MUSIC_AI_LICENSE,
      storage_path: storagePath,
      duration_sec: args.input.durationSec,
      content_id_checked: false,
      active: false,
      position,
      created_by: args.userId,
      original_filename: `${id}.${ext}`,
      file_size_bytes: bytes.byteLength,
    });
    if (error) {
      await args.db.storage.from(MUSIC_BUCKET).remove([storagePath]);
      throw new AiMusicError("Piesa generată nu a putut fi adăugată în bibliotecă.");
    }

    await writeUsage(true);
    return { id, title: args.input.title.trim(), durationSec: args.input.durationSec, storagePath };
  } catch (error) {
    if (!(error instanceof AiMusicError && error.message.startsWith("Ai atins limita"))) await writeUsage(false);
    throw error;
  }
}
