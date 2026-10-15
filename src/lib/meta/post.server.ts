/**
 * Publicarea efectivă pe pagina de Facebook, cu tokenul paginii (doar pe server).
 * Tokenul nu se loghează și nu iese din această funcție.
 */
import { META_GRAPH_BASE } from "./core";
import {
  META_GRAPH_VIDEO_BASE,
  MetaPostError,
  buildAttachedMedia,
  classifyMetaError,
  normalizePermalink,
  planMetaPost,
  type MetaPostKind,
} from "./post-core";

type Fetch = typeof fetch;

export type MetaPublishInput = {
  pageId: string;
  pageToken: string;
  kind: MetaPostKind;
  message: string;
  link: string;
  photoUrls?: string[];
  file?: Blob | null;
  fileName?: string;
};

async function call(f: Fetch, url: string, body: FormData | URLSearchParams, method = "POST") {
  let res: Response;
  try {
    res = await f(url, { method, body });
  } catch {
    throw new MetaPostError("rejected", "Facebook nu a răspuns. Încearcă din nou.");
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.error) throw classifyMetaError(json);
  return json;
}

function form(fields: Record<string, string>, token: string) {
  const p = new URLSearchParams(fields);
  p.set("access_token", token);
  return p;
}

export async function publishToMetaPage(input: MetaPublishInput, f: Fetch = fetch): Promise<{ postId: string; permalink: string | null }> {
  const { pageId, pageToken: token } = input;
  const steps = planMetaPost(input.kind, input.photoUrls?.length ?? 0);
  let postId = "";

  if (input.kind === "link") {
    const r = await call(f, `${META_GRAPH_BASE}/${pageId}/feed`, form({ message: input.message, link: input.link }, token));
    postId = String(r.id);
  } else if (input.kind === "poster" || input.kind === "video") {
    if (!input.file) throw new MetaPostError("rejected", input.kind === "video" ? "Lipsește video-ul." : "Lipsește posterul.");
    const fd = new FormData();
    fd.set("access_token", token);
    fd.set(input.kind === "video" ? "description" : "message", input.message);
    fd.set("source", input.file, input.fileName ?? (input.kind === "video" ? "video.mp4" : "poster.png"));
    const url = input.kind === "video" ? `${META_GRAPH_VIDEO_BASE}/${pageId}/videos` : `${META_GRAPH_BASE}/${pageId}/photos`;
    const r = await call(f, url, fd);
    postId = String(r.post_id ?? r.id);
  } else if (steps.length === 1) {
    const r = await call(f, `${META_GRAPH_BASE}/${pageId}/photos`, form({ url: input.photoUrls![0]!, message: input.message }, token));
    postId = String(r.post_id ?? r.id);
  } else {
    const ids: string[] = [];
    for (const url of input.photoUrls!) {
      const r = await call(f, `${META_GRAPH_BASE}/${pageId}/photos`, form({ url, published: "false" }, token));
      ids.push(String(r.id));
    }
    const r = await call(f, `${META_GRAPH_BASE}/${pageId}/feed`, form({ message: input.message, ...buildAttachedMedia(ids) }, token));
    postId = String(r.id);
  }

  let permalink: string | null = null;
  try {
    const u = new URL(`${META_GRAPH_BASE}/${postId}`);
    u.searchParams.set("fields", "permalink_url");
    u.searchParams.set("access_token", token);
    const res = await f(u.toString());
    const j = (await res.json().catch(() => null)) as { permalink_url?: string } | null;
    permalink = normalizePermalink(j?.permalink_url);
  } catch {
    permalink = null;
  }
  return { postId, permalink };
}
