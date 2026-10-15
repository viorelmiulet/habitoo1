/**
 * YouTube Data API v3 — părți pure și apeluri HTTP cu `fetch` injectabil (testabile fără rețea).
 * Nu conține secrete; secretul clientului se primește ca parametru doar pe server.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const YT_CLIENT_ID = "541052839618-7751t7pajaglkh0mlmr5ln419i0jbpnv.apps.googleusercontent.com";
export const YT_REDIRECT_URI = "https://crm.habitoo.ro/api/public/youtube/oauth/callback";
export const YT_ORIGIN = "https://crm.habitoo.ro";
export const YT_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
export const YT_STATE_TTL_MS = 10 * 60 * 1000;
export const YT_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YT_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const YT_API = "https://www.googleapis.com/youtube/v3";
export const YT_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
export const YT_TITLE_MAX = 100;
export const YT_DESCRIPTION_MAX = 5000;
export const YT_TAGS_MAX = 500;
export const YT_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const YT_CATEGORY_ID = "22";
export const YT_RECONNECT_MESSAGE = "Reconectează canalul YouTube din Setări → Promovare";
export const YT_PENDING_APPROVAL_MESSAGE = "Până la aprobarea Google, video-urile încărcate pot rămâne private.";
export type YtPrivacy = "public" | "unlisted" | "private";

type Fetch = typeof fetch;

export type YtState = { organizationId: string; userId: string; exp: number };

export function signYoutubeState(input: { organizationId: string; userId: string }, secret: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ o: input.organizationId, u: input.userId, exp: now + YT_STATE_TTL_MS, n: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  const sig = createHmac("sha256", `${secret}:yt-state`).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyYoutubeState(state: string | null | undefined, secret: string, now = Date.now()): YtState | null {
  if (!state) return null;
  const [payload, sig, extra] = state.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", `${secret}:yt-state`).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { o?: string; u?: string; exp?: number };
    if (typeof p.o !== "string" || typeof p.u !== "string" || typeof p.exp !== "number" || p.exp < now) return null;
    return { organizationId: p.o, userId: p.u, exp: p.exp };
  } catch {
    return null;
  }
}

export function buildYoutubeOAuthUrl(state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", YT_CLIENT_ID);
  u.searchParams.set("redirect_uri", YT_REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", YT_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

// ---------- Metadate ----------

export function youtubeTitle(title: string, price: string | null): string {
  const base = [title.trim(), price?.trim()].filter(Boolean).join(" – ").replace(/[<>]/g, "");
  return [...base].length > YT_TITLE_MAX ? [...base].slice(0, YT_TITLE_MAX - 1).join("").trimEnd() + "…" : base;
}

export function youtubeDescription(text: string, propertyId: string): string {
  const link = `https://www.habitoo.ro/oferta/${propertyId}`;
  const clean = text.replace(/[<>]/g, "").trim();
  const body = clean.includes(link) ? clean.replace(link, "").trim() : clean;
  const room = YT_DESCRIPTION_MAX - link.length - 2;
  const cut = body.length > room ? body.slice(0, room - 1).trimEnd() + "…" : body;
  return cut ? `${cut}\n\n${link}` : link;
}

/** Etichete din hashtaguri; totalul (cu virgule) rămâne sub 500 de caractere. */
export function youtubeTags(hashtags: string[]): string[] {
  const out: string[] = [];
  let total = 0;
  for (const h of hashtags) {
    const t = h.replace(/^#+/, "").replace(/[<>,]/g, "").trim();
    if (!t || out.includes(t)) continue;
    const cost = t.length + (t.includes(" ") ? 2 : 0) + (out.length ? 1 : 0);
    if (total + cost > YT_TAGS_MAX) break;
    out.push(t);
    total += cost;
  }
  return out;
}

export function youtubeVideoResource(input: { title: string; description: string; tags: string[]; privacy: YtPrivacy }) {
  return {
    snippet: { title: input.title, description: input.description, tags: input.tags, categoryId: YT_CATEGORY_ID },
    status: { privacyStatus: input.privacy, selfDeclaredMadeForKids: false },
  };
}

// ---------- Erori ----------

export type YtErrorKind = "expired" | "quota" | "rejected" | "permission";
export class YoutubeError extends Error {
  constructor(public kind: YtErrorKind, message: string, public reason?: string) {
    super(message);
  }
}

export function classifyYoutubeError(body: unknown): YoutubeError {
  const e = (body as { error?: { code?: number; message?: string; errors?: { reason?: string }[] } } | null)?.error;
  const reason = e?.errors?.[0]?.reason;
  if (reason === "quotaExceeded" || reason === "uploadLimitExceeded" || reason === "dailyLimitExceeded")
    return new YoutubeError("quota", "Limita zilnică YouTube a fost depășită. Încearcă din nou mâine.", reason);
  if (e?.code === 401 || reason === "authError") return new YoutubeError("expired", `Conexiunea YouTube a expirat. ${YT_RECONNECT_MESSAGE}.`, reason);
  if (e?.code === 403) return new YoutubeError("permission", "Habitoo nu are permisiunea să încarce pe acest canal. Reconectează canalul.", reason);
  return new YoutubeError("rejected", `YouTube a respins video-ul${e?.message ? `: ${e.message.slice(0, 200)}` : "."}`, reason);
}

// ---------- OAuth ----------

export async function exchangeYoutubeCode(code: string, secret: string, f: Fetch = fetch) {
  const res = await f(YT_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: YT_CLIENT_ID, client_secret: secret, redirect_uri: YT_REDIRECT_URI, grant_type: "authorization_code" }),
  });
  const j = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string } | null;
  if (!res.ok || !j?.access_token || !j.refresh_token) throw new Error("exchange_failed");
  return { accessToken: j.access_token, refreshToken: j.refresh_token };
}

/** Access token nou din refresh token; `invalid_grant` → YoutubeError("expired"). */
export async function refreshYoutubeToken(refreshToken: string, secret: string, f: Fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await f(YT_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: YT_CLIENT_ID, client_secret: secret, grant_type: "refresh_token" }),
    });
  } catch {
    throw new YoutubeError("rejected", "Google nu a răspuns. Încearcă din nou.");
  }
  const j = (await res.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (j?.error === "invalid_grant") throw new YoutubeError("expired", `Conexiunea YouTube a expirat. ${YT_RECONNECT_MESSAGE}.`, "invalid_grant");
  if (!res.ok || !j?.access_token) throw new YoutubeError("rejected", "Tokenul YouTube nu a putut fi reîmprospătat. Încearcă din nou.");
  return j.access_token;
}

export async function fetchYoutubeChannel(accessToken: string, f: Fetch = fetch) {
  const res = await f(`${YT_API}/channels?part=snippet&mine=true`, { headers: { authorization: `Bearer ${accessToken}` } });
  const j = (await res.json().catch(() => null)) as {
    items?: { id: string; snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> } }[];
  } | null;
  if (!res.ok) throw new Error("exchange_failed");
  const c = j?.items?.[0];
  if (!c) throw new Error("no_channel");
  const th = c.snippet?.thumbnails ?? {};
  return { id: c.id, title: c.snippet?.title ?? "", thumbnail: th["default"]?.url ?? th["medium"]?.url ?? null };
}

export async function revokeYoutubeToken(token: string, f: Fetch = fetch) {
  const res = await f(YT_REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (!res.ok) throw new Error("revoke_failed");
}

// ---------- Încărcare ----------

export async function startResumableUpload(
  accessToken: string,
  resource: ReturnType<typeof youtubeVideoResource>,
  size: number,
  f: Fetch = fetch,
): Promise<string> {
  const res = await f(YT_UPLOAD_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": "video/mp4",
      "x-upload-content-length": String(size),
      origin: YT_ORIGIN,
    },
    body: JSON.stringify(resource),
  });
  if (!res.ok) throw classifyYoutubeError(await res.json().catch(() => null));
  const loc = res.headers.get("location");
  if (!loc) throw new YoutubeError("rejected", "YouTube nu a pornit încărcarea. Încearcă din nou.");
  return loc;
}

/** Starea video-ului după încărcare; respins/eșuat → YoutubeError("rejected"). */
export async function checkUploadedVideo(accessToken: string, videoId: string, f: Fetch = fetch) {
  const res = await f(`${YT_API}/videos?part=status&id=${encodeURIComponent(videoId)}`, { headers: { authorization: `Bearer ${accessToken}` } });
  const j = (await res.json().catch(() => null)) as { items?: { status?: { uploadStatus?: string; rejectionReason?: string; failureReason?: string } }[] } | null;
  if (!res.ok) throw classifyYoutubeError(j);
  const s = j?.items?.[0]?.status;
  if (!s) throw new YoutubeError("rejected", "Video-ul nu a fost găsit pe canal.");
  if (s.uploadStatus === "rejected" || s.uploadStatus === "failed")
    throw new YoutubeError("rejected", `YouTube a respins video-ul (${s.rejectionReason ?? s.failureReason ?? s.uploadStatus}).`, s.uploadStatus);
  return { uploadStatus: s.uploadStatus ?? "uploaded" };
}

export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
