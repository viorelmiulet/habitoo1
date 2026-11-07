import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const portalSchema = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);
export const listPortalIndexKeys = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: allowed, error } = await context.supabase.rpc("is_superadmin");
  if (error || allowed !== true) throw new Error("Acces refuzat.");
  const { INDEX_PORTALS } = await import("@/lib/portals/clickimob/index-feed");
  const { loadDynamicFeedPortals } = await import("@/lib/dynamic-feed-portals.server");
  const dynamic = await loadDynamicFeedPortals();
  const { readIndexKeys, safeIndexKey, hashIndexKey, sameKeyHash } = await import("./index-keys.server");
  return Promise.all([...Object.keys(INDEX_PORTALS), ...dynamic.filter(p => !(p.slug in INDEX_PORTALS)).map(p => p.slug)].map(async name => {
    const portal = portalSchema.parse(name);
    const rows = await readIndexKeys(portal);
    const fixed = INDEX_PORTALS[portal as keyof typeof INDEX_PORTALS];
    const row = dynamic.find(p => p.slug === portal);
    const prefix = fixed?.prefix ?? row?.key_prefix ?? "";
    const legacy = fixed ? process.env[fixed.secret] : undefined;
    const legacyRow = legacy ? rows.find(row => sameKeyHash(row.key_hash, hashIndexKey(legacy))) : null;
    return { portal, prefix, displayName: row?.display_name, dynamic: Boolean(row) && !fixed,
      active: row?.active ?? true, showPublic: row?.show_public ?? false, xmlEnabled: row?.xml_enabled ?? false,
      indexUrl: `https://www.habitoo.ro/api/public/feed/${portal}/index/{indexKey}`,
      keys: rows.filter(row => row.source === "managed").map(safeIndexKey),
      legacy: legacy ? { prefix, last4: legacy.slice(-4),
        status: legacyRow?.status ?? "active", last_used_at: legacyRow?.last_used_at ?? null } : null };
  }));
});
export const createPortalIndexKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ portal: portalSchema })).handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc("is_superadmin");
    if (error || allowed !== true) throw new Error("Acces refuzat.");
    const { generateIndexKey } = await import("./index-keys.server");
    const { resolveIndexPortal } = await import("@/lib/dynamic-feed-portals.server");
    const config = await resolveIndexPortal(data.portal);
    if (!config?.active) throw new Error("Portal necunoscut sau dezactivat.");
    const generated = generateIndexKey(data.portal, config.prefix);
    // Caller RLS and the audit trigger apply; the plaintext is returned once, never persisted.
    const { error: insertError } = await context.supabase.from("portal_index_keys").insert({
      portal: data.portal, prefix: generated.prefix, last4: generated.last4,
      key_hash: generated.key_hash, created_by: context.userId,
    });
    if (insertError) throw new Error("Cheia nu a putut fi generată.");
    return { key: generated.key };
  });
export const revokePortalIndexKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ portal: portalSchema, id: z.string().uuid().optional(), legacy: z.boolean().default(false) }))
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc("is_superadmin");
    if (error || allowed !== true) throw new Error("Acces refuzat.");
    let id = data.id;
    if (data.legacy) {
      const { legacyIndexKey, readIndexKeys } = await import("./index-keys.server");
      id = (await legacyIndexKey(data.portal, await readIndexKeys(data.portal), context.userId))?.id;
    }
    if (!id) throw new Error("Cheia nu a fost găsită.");
    const { data: row, error: updateError } = await context.supabase.from("portal_index_keys")
      .update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", id).eq("portal", data.portal)
      .select("id").maybeSingle();
    if (updateError || !row) throw new Error("Cheia nu a putut fi revocată.");
    return { ok: true };
  });