// Acces la conexiunea YouTube a agenției. Tokenurile nu părăsesc serverul și nu se loghează.
import { decryptPortalCredential } from "@/lib/portals/crypto.server";
import { YoutubeError, YT_RECONNECT_MESSAGE, refreshYoutubeToken } from "./core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export function youtubeClientSecret(): string {
  const s = process.env["GOOGLE_YT_CLIENT_SECRET"];
  if (!s) throw new Error("Conectarea YouTube nu este configurată încă.");
  return s;
}

/** Access token valid pentru agenție; la `invalid_grant` conexiunea devine „expirată”. */
export async function youtubeAccessToken(db: Db, organizationId: string, f: typeof fetch = fetch) {
  const { data: conn } = await db
    .from("youtube_connections")
    .select("id, status, refresh_token_enc, channel_id, channel_title")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!conn || conn.status !== "connected" || !conn.refresh_token_enc) throw new YoutubeError("expired", `${YT_RECONNECT_MESSAGE}.`);
  const refresh = decryptPortalCredential(conn.refresh_token_enc);
  if (!refresh) throw new YoutubeError("expired", `${YT_RECONNECT_MESSAGE}.`);
  try {
    const token = await refreshYoutubeToken(refresh, youtubeClientSecret(), f);
    return { token, conn: conn as { id: string; channel_id: string; channel_title: string | null } };
  } catch (e) {
    if (e instanceof YoutubeError && e.kind === "expired") await markYoutubeExpired(db, conn.id);
    throw e;
  }
}

export async function markYoutubeExpired(db: Db, connectionId: string) {
  await db.from("youtube_connections").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", connectionId);
}
