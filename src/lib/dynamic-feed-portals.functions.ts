import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { dynamicFeedPortalSchema, dynamicPortalDefinition } from "./dynamic-feed-portals";

export const getDynamicFeedRegistry = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("dynamic_feed_portals")
    .select("slug,display_name,key_prefix,website,logo_path,xml_enabled,active,show_public").eq("active", true).order("slug");
  if (error) throw new Error("Catalogul portalurilor nu poate fi încărcat.");
  const rows = await Promise.all((data ?? []).map(async row => {
    const definition = dynamicPortalDefinition(row);
    if (row.logo_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const signed = await supabaseAdmin.storage.from("feed-portal-logos").createSignedUrl(row.logo_path, 3600);
      definition.logo_url = signed.data?.signedUrl;
    }
    return definition;
  }));
  return rows;
});
export const createDynamicFeedPortal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(dynamicFeedPortalSchema).handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc("is_superadmin");
    if (error || allowed !== true) throw new Error("Acces refuzat.");
    const { createDynamicFeedPortalCore } = await import("./dynamic-feed-portals.server");
    return createDynamicFeedPortalCore(context.supabase as never, data);
  });
export const updateDynamicFeedPortal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ slug: dynamicFeedPortalSchema.shape.slug, active: z.boolean().optional(), show_public: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc("is_superadmin");
    if (error || allowed !== true) throw new Error("Acces refuzat.");
    const { slug, ...patch } = data;
    const { data: row, error: failure } = await context.supabase.from("dynamic_feed_portals").update(patch).eq("slug", slug).select("slug").maybeSingle();
    if (failure || !row) throw new Error("Portalul nu a putut fi actualizat.");
    return { ok: true };
  });
export const getPublicDynamicFeedPortals = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicDynamicFeedPortals } = await import("./public-feed-portals.server");
  const { publicRead } = await import("./public-read");
  return publicRead("dynamic_public_portals", loadPublicDynamicFeedPortals, []);
});