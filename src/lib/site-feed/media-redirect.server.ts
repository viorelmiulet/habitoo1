/** Redirect-uri publice pentru poza agentului și logo-ul agenției (fără token). */
import { httpsUrlOrNull } from "@/lib/site-feed/mapper";
import { storageTransform, type ImageParams } from "@/lib/site-feed/image-params";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_URL_TTL = 60 * 60 * 24;

export function parseMediaId(raw: unknown): string | null {
  const id = String(raw ?? "").replace(/\.(jpe?g|png|webp)$/i, "");
  return UUID_RE.test(id) ? id : null;
}

const notFound = () => new Response("Not found", { status: 404 });
const redirect = (location: string) =>
  new Response(null, {
    status: 302,
    headers: { location, "cache-control": "public, max-age=3600" },
  });

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function loadDb(db?: Db): Promise<Db> {
  if (db) return db;
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/** Cu parametri: varianta redimensionată; la orice eșec, originalul. */
export async function signed(db: Db, bucket: string, path: string, params?: ImageParams | null): Promise<string | null> {
  if (params) {
    try {
      const { data, error } = await db.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL, { transform: storageTransform(params) });
      const url = !error ? httpsUrlOrNull(data?.signedUrl ?? null) : null;
      if (url) return url;
    } catch { /* revenim la original */ }
  }
  const { data } = await db.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
  return httpsUrlOrNull(data?.signedUrl ?? null);
}

export async function agentPhotoRedirect(rawId: unknown, dbIn?: Db, params?: ImageParams | null): Promise<Response> {
  const id = parseMediaId(rawId);
  if (!id) return notFound();
  try {
    const db = await loadDb(dbIn);
    const { data: profile } = await db
      .from("profiles")
      .select("id, avatar_url, is_active")
      .eq("id", id)
      .maybeSingle();
    const raw = profile?.avatar_url?.trim();
    if (!profile || profile.is_active !== true || !raw) return notFound();
    const target = httpsUrlOrNull(raw) ?? (await signed(db, "avatars", raw, params));
    return target ? redirect(target) : notFound();
  } catch (error) {
    console.error("[site-feed] agent photo redirect failed", error);
    return new Response("Internal error", { status: 500 });
  }
}

export async function agencyLogoRedirect(rawId: unknown, dbIn?: Db, params?: ImageParams | null): Promise<Response> {
  const id = parseMediaId(rawId);
  if (!id) return notFound();
  try {
    const db = await loadDb(dbIn);
    const { data: org } = await db
      .from("organizations")
      .select("id, logo_path, logo_url")
      .eq("id", id)
      .maybeSingle();
    if (!org) return notFound();
    const path = org.logo_path?.trim();
    const target =
      (path ? await signed(db, "agency-logos", path, params) : null) ?? httpsUrlOrNull(org.logo_url);
    return target ? redirect(target) : notFound();
  } catch (error) {
    console.error("[site-feed] agency logo redirect failed", error);
    return new Response("Internal error", { status: 500 });
  }
}
