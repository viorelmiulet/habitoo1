// Tokenul dedicat Catalogului Facebook (`site_feed_tokens.scope = facebook_catalog`).
// Valoarea în clar se păstrează criptat cu mecanismul credențialelor de portal
// (AES-256-GCM, PORTAL_CREDENTIALS_KEY). Nu se loghează și nu intră în audit.
import { decryptPortalCredential, encryptPortalCredential } from "@/lib/portals/crypto.server";
import { generateFeedToken } from "@/lib/site-feed/auth.server";
import { facebookCatalogUrl } from "@/lib/facebook-catalog-status";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export const FACEBOOK_CATALOG_SCOPE = "facebook_catalog" as const;

/** Adresa completă pentru tokenul `facebook_catalog` activ al agenției, sau null. */
export async function loadFacebookCatalogFeedUrl(
  admin: AdminClient,
  organizationId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("site_feed_tokens")
    .select("token_encrypted")
    .eq("organization_id", organizationId)
    .eq("scope", FACEBOOK_CATALOG_SCOPE)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const encrypted = data?.[0]?.token_encrypted ?? null;
  if (!encrypted) return null;
  let plain: string | null = null;
  try {
    plain = decryptPortalCredential(encrypted);
  } catch {
    plain = null;
  }
  return plain ? facebookCatalogUrl(plain) : null;
}

/**
 * Revocă DOAR tokenurile `facebook_catalog` active ale agenției și creează unul nou.
 * Tokenurile de site nu sunt atinse.
 */
export async function rotateFacebookCatalogToken(
  admin: AdminClient,
  organizationId: string,
  actorId: string,
): Promise<{ url: string; regenerated: boolean }> {
  const now = new Date().toISOString();
  const { data: revoked } = await admin
    .from("site_feed_tokens")
    .update({ revoked_at: now, updated_by: actorId })
    .eq("organization_id", organizationId)
    .eq("scope", FACEBOOK_CATALOG_SCOPE)
    .is("revoked_at", null)
    .select("id");

  const generated = generateFeedToken();
  const { error } = await admin.from("site_feed_tokens").insert({
    organization_id: organizationId,
    name: "Catalog Facebook",
    scope: FACEBOOK_CATALOG_SCOPE,
    token_prefix: generated.prefix,
    token_hash: generated.hash,
    token_encrypted: encryptPortalCredential(generated.token),
    created_by: actorId,
    updated_by: actorId,
  });
  if (error) throw new Error("Adresa feedului nu a putut fi generată.");

  const regenerated = (revoked?.length ?? 0) > 0;
  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    actor_id: actorId,
    action: regenerated ? "facebook_catalog.token_regenerated" : "facebook_catalog.token_generated",
    entity: "site_feed_tokens",
    new_values: { scope: FACEBOOK_CATALOG_SCOPE, revoked: revoked?.length ?? 0 },
  });

  return { url: facebookCatalogUrl(generated.token), regenerated };
}
