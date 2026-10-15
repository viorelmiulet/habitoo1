/**
 * Publicarea pe Instagram cu tokenul paginii de care ține contul (doar pe server).
 */
import { META_GRAPH_BASE } from "./core";
import { IG_POLL_INTERVAL_MS, IG_POLL_MAX_MS, IgPostError, classifyInstagramError, planInstagramPost, type IgMedia, type IgPostKind } from "./instagram-core";

type Fetch = typeof fetch;
export type IgDeps = { fetch?: Fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; pollMaxMs?: number };

export type IgPublishResult =
  | { status: "published"; mediaId: string; permalink: string | null }
  | { status: "processing"; containerId: string };

async function graph(f: Fetch, path: string, token: string, params?: Record<string, string>, method: "GET" | "POST" = "POST") {
  const url = new URL(`${META_GRAPH_BASE}/${path}`);
  let init: RequestInit = { method };
  if (method === "GET") {
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    url.searchParams.set("access_token", token);
  } else {
    const b = new URLSearchParams(params ?? {});
    b.set("access_token", token);
    init = { method, body: b };
  }
  let res: Response;
  try {
    res = await f(url.toString(), init);
  } catch {
    throw new IgPostError("rejected", "Instagram nu a răspuns. Încearcă din nou.");
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.error) throw classifyInstagramError(json);
  return json;
}

export async function containerStatus(igUserToken: string, containerId: string, f: Fetch = fetch): Promise<string> {
  const r = await graph(f, containerId, igUserToken, { fields: "status_code" }, "GET");
  return String(r.status_code ?? "");
}

/** Așteaptă FINISHED (la 5 s, max 5 min). `false` = încă se procesează. */
export async function waitForContainer(token: string, containerId: string, deps: IgDeps = {}): Promise<boolean> {
  const f = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const deadline = now() + (deps.pollMaxMs ?? IG_POLL_MAX_MS);
  for (;;) {
    const s = await containerStatus(token, containerId, f);
    if (s === "FINISHED") return true;
    if (s === "ERROR" || s === "EXPIRED") throw new IgPostError("video", "Instagram nu a putut procesa fișierul. Verifică video-ul și încearcă din nou.");
    if (now() + IG_POLL_INTERVAL_MS > deadline) return false;
    await sleep(IG_POLL_INTERVAL_MS);
  }
}

export async function publishContainer(igUserId: string, token: string, containerId: string, f: Fetch = fetch) {
  const r = await graph(f, `${igUserId}/media_publish`, token, { creation_id: containerId });
  const mediaId = String(r.id);
  let permalink: string | null = null;
  try {
    const p = await graph(f, mediaId, token, { fields: "permalink" }, "GET");
    permalink = typeof p.permalink === "string" ? p.permalink : null;
  } catch {
    permalink = null;
  }
  return { mediaId, permalink };
}

export async function publishToInstagram(
  input: { igUserId: string; token: string; kind: IgPostKind; caption: string; media: IgMedia },
  deps: IgDeps = {},
): Promise<IgPublishResult> {
  const f = deps.fetch ?? fetch;
  const steps = planInstagramPost(input.kind, input.media, input.caption);
  const children: string[] = [];
  let containerId = "";
  for (const s of steps) {
    if (s.op === "carousel_item") {
      const r = await graph(f, `${input.igUserId}/media`, input.token, { image_url: input.media.images[s.image]!, is_carousel_item: "true" });
      children.push(String(r.id));
    } else if (s.op === "carousel") {
      const r = await graph(f, `${input.igUserId}/media`, input.token, { media_type: "CAROUSEL", children: children.join(","), caption: s.caption });
      containerId = String(r.id);
    } else if (s.op === "container") {
      const r = await graph(f, `${input.igUserId}/media`, input.token, s.params);
      containerId = String(r.id);
    } else if (s.op === "wait") {
      if (!(await waitForContainer(input.token, containerId, deps))) return { status: "processing", containerId };
    } else {
      const res = await publishContainer(input.igUserId, input.token, containerId, f);
      return { status: "published", ...res };
    }
  }
  throw new IgPostError("rejected", "Postarea nu a reușit.");
}
