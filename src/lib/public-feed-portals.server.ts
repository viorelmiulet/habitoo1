import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { dynamicPortalDefinition } from "./dynamic-feed-portals";
import { STATIC_PORTALS, PROMOTION_CATALOGS } from "./portals/registry";
export async function loadPublicDynamicFeedPortals() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Configurația publică lipsește.");
  const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => { const headers = new Headers(init?.headers); if (key.startsWith("sb_")) headers.delete("authorization"); headers.set("apikey", key); return fetch(input, { ...init, headers }); } },
  });
  const { data, error } = await db.from("dynamic_feed_portals").select("slug,display_name,key_prefix,website,logo_path,xml_enabled,active,show_public").eq("active", true).eq("show_public", true).order("slug");
  if (error) throw new Error("Catalogul public nu poate fi încărcat.");
  const reserved = new Set([...STATIC_PORTALS, ...PROMOTION_CATALOGS].map(p => p.id));
  return (data ?? []).filter(p => !reserved.has(p.slug)).map(dynamicPortalDefinition);
}