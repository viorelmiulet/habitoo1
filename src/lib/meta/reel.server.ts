/** Facebook Page Reels: binary upload with page token confined to Meta hosts. */
import { META_GRAPH_BASE } from "./core";
import { MetaPostError, classifyMetaError, normalizePermalink, reelVideoError } from "./post-core";
import { inspectReelVideo } from "./reel-video";

type Fetch = typeof fetch;
export type ReelResult = { status: "published" | "processing"; postId: string; permalink: string | null };
export type ReelDeps = { fetch?: Fetch; sleep?: (ms: number) => Promise<void>; pollAttempts?: number };

async function graph(path: string, token: string, params: Record<string, string>, f: Fetch, method = "POST") {
  const url = new URL(`${META_GRAPH_BASE}/${path}`);
  const body = new URLSearchParams(params);
  body.set("access_token", token);
  if (method === "GET") url.search = body.toString();
  let response: Response;
  try {
    response = await f(url.toString(), { method, ...(method === "GET" ? {} : { body }), signal: AbortSignal.timeout(30000) });
  } catch {
    throw new MetaPostError("rejected", "Facebook nu a răspuns. Încearcă din nou.");
  }
  if (response.status >= 500 || response.status === 429) throw new MetaPostError("rejected", "Facebook nu a răspuns. Încearcă din nou.");
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !data || data.error) throw classifyMetaError(data);
  return data;
}

export async function facebookReelStatus(videoId: string, token: string, f: Fetch = fetch): Promise<"published" | "processing"> {
  const data = await graph(videoId, token, { fields: "status" }, f, "GET");
  const status = data.status as { video_status?: string; uploading_phase?: { status?: string }; processing_phase?: { status?: string }; publishing_phase?: { status?: string } } | undefined;
  const phases = [status?.video_status, status?.uploading_phase?.status, status?.processing_phase?.status, status?.publishing_phase?.status].map((s) => s?.toLowerCase());
  if (phases.some((s) => s === "error" || s === "failed" || s === "expired")) {
    throw new MetaPostError("rejected", "Facebook a respins video-ul pentru Reel. Generează din nou video-ul și încearcă din nou.");
  }
  return status?.publishing_phase?.status?.toLowerCase() === "complete" ? "published" : "processing";
}

export async function facebookReelPermalink(videoId: string, token: string, f: Fetch = fetch): Promise<string | null> {
  try {
    const data = await graph(videoId, token, { fields: "permalink_url" }, f, "GET");
    return normalizePermalink(typeof data.permalink_url === "string" ? data.permalink_url : null);
  } catch { return null; }
}

export async function publishFacebookReel(input: {
  pageId: string; pageToken: string; message: string; file: Blob;
  onSubmitted: (videoId: string) => Promise<void>;
}, deps: ReelDeps = {}): Promise<ReelResult> {
  const error = reelVideoError(await inspectReelVideo(input.file), input.file);
  if (error) throw new MetaPostError("rejected", error);
  const f = deps.fetch ?? fetch;
  const start = await graph(`${input.pageId}/video_reels`, input.pageToken, { upload_phase: "start" }, f);
  const videoId = typeof start.video_id === "string" || typeof start.video_id === "number" ? String(start.video_id) : "";
  let uploadUrl: URL;
  try { uploadUrl = new URL(String(start.upload_url)); } catch { throw new MetaPostError("rejected", "Facebook nu a furnizat adresa de încărcare pentru Reel."); }
  if (!videoId || uploadUrl.protocol !== "https:" || uploadUrl.hostname !== "rupload.facebook.com" || uploadUrl.port || uploadUrl.username || uploadUrl.password) {
    throw new MetaPostError("rejected", "Facebook nu a furnizat o adresă validă de încărcare pentru Reel.");
  }
  let upload: Response;
  try {
    upload = await f(uploadUrl.toString(), {
      method: "POST", redirect: "error", body: input.file,
      headers: { Authorization: `OAuth ${input.pageToken}`, offset: "0", file_size: String(input.file.size), "Content-Type": "application/octet-stream" },
      signal: AbortSignal.timeout(120000),
    });
  } catch { throw new MetaPostError("rejected", "Încărcarea Reel-ului nu a reușit. Verifică fișierul și încearcă din nou."); }
  const uploaded = await upload.json().catch(() => null) as { success?: boolean; error?: unknown } | null;
  if (!upload.ok || uploaded?.error) throw classifyMetaError(uploaded);
  if (uploaded?.success !== true) throw new MetaPostError("rejected", "Facebook nu a confirmat încărcarea Reel-ului.");
  // Persist the identifier before finish: status checks must never submit finish twice.
  await input.onSubmitted(videoId);
  const finish = await graph(`${input.pageId}/video_reels`, input.pageToken, { upload_phase: "finish", video_id: videoId, video_state: "PUBLISHED", description: input.message }, f);
  if (finish.success !== true) throw new MetaPostError("rejected", "Facebook nu a confirmat publicarea Reel-ului.");
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; attempt < (deps.pollAttempts ?? 3); attempt++) {
    if (attempt) await sleep(5000);
    try {
      if (await facebookReelStatus(videoId, input.pageToken, f) === "published") {
        return { status: "published", postId: videoId, permalink: await facebookReelPermalink(videoId, input.pageToken, f) };
      }
    } catch (e) {
      if (!(e instanceof MetaPostError) || e.kind !== "rejected" || e.message !== "Facebook nu a răspuns. Încearcă din nou.") throw e;
      // Network uncertainty after finish is processing, not a new publish attempt.
      break;
    }
  }
  return { status: "processing", postId: videoId, permalink: null };
}