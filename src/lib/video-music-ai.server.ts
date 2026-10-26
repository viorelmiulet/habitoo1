/**
 * Generare de muzică cu AI prin fal.ai (ACE-Step), numai pe server.
 * Apel direct (fără coadă): POST fal.run întoarce direct `audio.url`.
 * Cheia FAL_KEY nu părăsește serverul și nu apare în loguri sau răspunsuri.
 * O generare eșuată nu lasă rânduri sau fișiere în bibliotecă.
 * Compatibil cu runtime-ul de producție: fără node:*, Buffer sau pauze cu setTimeout.
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

const FAL_DIRECT_URL = "https://fal.run/fal-ai/ace-step/prompt-to-audio";
const FAL_TIMEOUT_MS = 110_000;

export class AiMusicError extends Error {
  constructor(message: string, readonly code = "generation_failed") { super(message); }
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
export type AiMusicDeps = { fetchFn?: FetchFn };

function falErrorMessage(status: number): string {
  if (status === 401 || status === 403) return "Cheia serviciului de generare nu este validă.";
  if (status === 429) return "Serviciul de generare este ocupat. Încearcă din nou în câteva minute.";
  return "Generarea nu a putut fi pornită. Încearcă din nou.";
}

type FalDirectResult = { audio?: { url?: string; content_type?: string; file_name?: string } };

/** Apelează direct modelul și întoarce URL-ul fișierului audio generat. */
async function callFalDirect(apiKey: string, input: AiMusicInput, fetchFn: FetchFn): Promise<{ url: string; contentType: string | null }> {
  let res: Response;
  try {
    res = await fetchFn(FAL_DIRECT_URL, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: buildAiMusicPrompt(input), instrumental: true, duration: input.durationSec }),
      signal: AbortSignal.timeout(FAL_TIMEOUT_MS),
    });
  } catch (error) {
    const aborted = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new AiMusicError(
      aborted ? "Generarea a durat prea mult. Încearcă din nou." : "Serviciul de generare nu a putut fi contactat. Încearcă din nou.",
      aborted ? "fal_timeout" : "fal_network",
    );
  }
  if (!res.ok) throw new AiMusicError(falErrorMessage(res.status), `fal_${res.status}`);
  const body = (await res.json().catch(() => null)) as FalDirectResult | null;
  const url = body?.audio?.url;
  if (!url) throw new AiMusicError("Fișierul generat lipsește din răspuns.", "fal_result_invalid");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new AiMusicError("Fișierul generat lipsește din răspuns.", "fal_result_invalid"); }
  if (parsed.protocol !== "https:") throw new AiMusicError("Fișierul generat lipsește din răspuns.", "fal_result_invalid");
  return { url, contentType: body?.audio?.content_type ?? null };
}

function audioExtension(contentType: string | null, url: string): string {
  if (contentType?.includes("mpeg") || contentType?.includes("mp3")) return "mp3";
  if (contentType?.includes("wav")) return "wav";
  const match = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(url);
  return match ? match[1].toLowerCase() : "wav";
}

/** Mesaj de eroare sigur pentru jurnal: fără chei, fără URL-uri, max 150 de caractere. */
function sanitizeErrorMessage(raw: string, apiKey: string): string {
  let text = raw;
  if (apiKey) text = text.split(apiKey).join("[key]");
  text = text.replace(/https?:\/\/\S+/gi, "[url]");
  return text.slice(0, 150);
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
 * apel direct fal.ai → descărcare → stocare → rând nou. Orice eșec nu lasă urme.
 */
export async function generateAiMusicTrack(
  args: { apiKey: string; input: AiMusicInput; userId: string; organizationId: string | null; db: AiMusicDb },
  deps: AiMusicDeps = {},
): Promise<AiMusicResult> {
  const validationError = validateAiMusicInput(args.input);
  const fetchFn = deps.fetchFn ?? fetch;
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

  const writeUsage = (success: boolean, extraInfo?: Record<string, unknown>) =>
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
        extra_info: extraInfo ?? null,
      })
      .then(({ error }) => {
        if (error) console.error("[ai-music] usage_insert_failed");
      });

  try {
    if (validationError) throw new AiMusicError(validationError, "validation");
    if (!args.apiKey.trim()) throw new AiMusicError("Generarea de muzică cu AI nu este configurată.", "configuration");
    const audio = await callFalDirect(args.apiKey, args.input, fetchFn);
    const audioRes = await fetchFn(audio.url).catch(() => null);
    if (!audioRes?.ok) throw new AiMusicError("Fișierul generat nu a putut fi descărcat.", "download_failed");
    const contentType = audioRes.headers.get("content-type") ?? audio.contentType;
    const bytes = await audioRes.arrayBuffer().catch(() => { throw new AiMusicError("Fișierul generat nu a putut fi descărcat.", "download_failed"); });
    const TOO_LARGE = "Piesa generată e prea mare. Alege o durată mai scurtă.";
    if (bytes.byteLength > 30 * 1024 * 1024) throw new AiMusicError(TOO_LARGE, "audio_too_large");

    const id = crypto.randomUUID();
    const ext = audioExtension(contentType, audio.url);
    const storagePath = `tracks/${id}.${ext}`;
    const upload = await args.db.storage
      .from(MUSIC_BUCKET)
      .upload(storagePath, new Blob([bytes], { type: contentType ?? "audio/wav" }), { contentType: contentType ?? "audio/wav" });
    if (upload.error) {
      const msg = upload.error.message ?? "";
      throw new AiMusicError(/size|large|413|exceed/i.test(msg) ? TOO_LARGE : "Fișierul generat nu a putut fi salvat.", "upload_failed");
    }

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
      throw new AiMusicError("Piesa generată nu a putut fi adăugată în bibliotecă.", "track_insert_failed");
    }

    await writeUsage(true);
    return { id, title: args.input.title.trim(), durationSec: args.input.durationSec, storagePath };
  } catch (error) {
    if (error instanceof AiMusicError) {
      if (!error.message.startsWith("Ai atins limita")) await writeUsage(false, { error_code: error.code });
      throw error;
    }
    // Eroare neprevăzută: păstrăm numele și un fragment sigur al mesajului, ca să
    // putem diagnostica producția fără să expunem chei sau URL-uri cu token.
    const name = error instanceof Error ? error.name || "Error" : typeof error;
    const raw = error instanceof Error ? error.message : String(error);
    await writeUsage(false, {
      error_code: "internal",
      error_name: name,
      error_message: sanitizeErrorMessage(raw, args.apiKey),
    });
    throw new AiMusicError("Piesa nu a putut fi generată din cauza unei probleme interne. Încearcă din nou.", "internal");
  }
}
