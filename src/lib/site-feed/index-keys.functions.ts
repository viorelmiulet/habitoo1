import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const portalSchema = z.enum(["clickimob", "imobli", "locuit", "imobiliareplus", "imove", "bazaruldecase"]);
export const listPortalIndexKeys = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: allowed, error } = await context.supabase.rpc("is_superadmin");
  if (error || allowed !== true) throw new Error("Acces refuzat.");
  const { INDEX_PORTALS } = await import("@/lib/portals/clickimob/index-feed");
  const { readIndexKeys, safeIndexKey, hashIndexKey, sameKeyHash } = await import("./index-keys.server");
  return Promise.all(Object.keys(INDEX_PORTALS).map(async name => {
    const portal = portalSchema.parse(name);
    const rows = await readIndexKeys(portal);
    const legacy = process.env[INDEX_PORTALS[portal].secret];
    const legacyRow = legacy ? rows.find(row => sameKeyHash(row.key_hash, hashIndexKey(legacy))) : null;
    return { portal, prefix: INDEX_PORTALS[portal].prefix,
      indexUrl: `https://www.habitoo.ro/api/public/feed/${portal}/index/{indexKey}`,
      keys: rows.filter(row => row.source === "managed").map(safeIndexKey),
      legacy: legacy ? { prefix: INDEX_PORTALS[portal].prefix, last4: legacy.slice(-4),
        status: legacyRow?.status ?? "active", last_used_at: legacyRow?.last_used_at ?? null } : null };
  }));
});
export const createPortalIndexKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ portal: portalSchema })).handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc("is_superadmin");
    if (error || allowed !== true) throw new Error("Acces refuzat.");
    const { generateIndexKey } = await import("./index-keys.server");
    const generated = generateIndexKey(data.portal);
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