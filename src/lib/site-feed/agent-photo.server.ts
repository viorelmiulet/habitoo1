/**
 * Poza publică a agentului (JPEG 400×400, sub 1 MB) pentru portaluri, ex. Storia `contact.photo`.
 * Nu expune nimic altceva decât octeții imaginii.
 */
import { parseMediaId, signed } from "@/lib/site-feed/media-redirect.server";
import { httpsUrlOrNull } from "@/lib/site-feed/mapper";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
export const AGENT_PHOTO_MAX_BYTES = 1024 * 1024;
const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=300" } });

export async function serveAgentPhoto(rawId: unknown, deps: { db?: Db; fetchImpl?: typeof fetch } = {}): Promise<Response> {
  const id = parseMediaId(rawId);
  if (!id) return notFound();
  try {
    const db = deps.db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data: profile } = await db
      .from("profiles")
      .select("id, avatar_url, is_active, public_profile_hidden")
      .eq("id", id)
      .maybeSingle();
    const raw = profile?.avatar_url?.trim();
    if (!profile || !raw || profile.is_active !== true || profile.public_profile_hidden === true) return notFound();
    const source =
      httpsUrlOrNull(raw) ??
      (await signed(db, "avatars", raw, { width: 400, height: 400, resize: "cover" }));
    if (!source) return notFound();
    const res = await (deps.fetchImpl ?? fetch)(source, { headers: { accept: "image/jpeg" } });
    if (!res.ok) return notFound();
    const body = await res.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > AGENT_PHOTO_MAX_BYTES) return notFound();
    const type = res.headers.get("content-type") ?? "";
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": type.startsWith("image/") ? type : "image/jpeg",
        "cache-control": "public, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[site-feed] agent photo failed", error);
    return new Response("Internal error", { status: 500 });
  }
}
