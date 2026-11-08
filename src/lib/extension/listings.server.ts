import type { ExtListingsStore, ExtListingRow } from "./listings";
import { FEED_PUBLIC_STATUSES, feedImageUrl } from "@/lib/site-feed/mapper";
import { CRM_URL } from "@/lib/host";

const COLS = "id,reference,title,description,transaction_kind,property_type,price,currency,rooms,usable_surface,surface,floor,floor_label,building_floors,build_year,city,district,county,address,street,street_number,location_precise,latitude,longitude,assigned_to,created_at";

export async function extensionListingsStore(): Promise<ExtListingsStore> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const published = () => db.from("properties").select(COLS)
    .is("deleted_at", null).eq("publish_status", "published").in("status", [...FEED_PUBLIC_STATUSES]);
  return {
    listings: async ({ org, user, all, q, cursor, limit }) => {
      let qb = published().eq("organization_id", org);
      if (!all) qb = qb.eq("assigned_to", user);
      const safe = q.replace(/[%_,()*\\"]/g, " ").trim();
      if (safe) qb = qb.or(`title.ilike.%${safe}%,reference.ilike.%${safe}%`);
      if (cursor) qb = qb.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
      const { data, error } = await qb.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ExtListingRow[];
    },
    images: async (ids) => {
      if (!ids.length) return {};
      const { data, error } = await db.from("property_images").select("id,property_id,position,created_at")
        .in("property_id", ids).eq("include_in_publish", true).eq("is_confidential", false)
        .order("position", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      const out: Record<string, string[]> = {};
      for (const r of data ?? []) (out[r.property_id] ??= []).push(feedImageUrl(CRM_URL, r.id));
      return out;
    },
    agents: async (ids) => {
      if (!ids.length) return {};
      const { data, error } = await db.from("profiles").select("id,full_name,phone,listing_phone,whatsapp").in("id", ids);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
    },
    posts: async (ids) => {
      if (!ids.length) return {};
      const { data, error } = await db.from("facebook_group_posts").select("property_id,group_name,group_url,posted_at")
        .in("property_id", ids).order("posted_at", { ascending: false }).limit(ids.length * 5 + 50);
      if (error) throw error;
      const out: Record<string, { group_name: string | null; group_url: string; posted_at: string }[]> = {};
      for (const r of data ?? []) (out[r.property_id] ??= []).push({ group_name: r.group_name, group_url: r.group_url, posted_at: r.posted_at });
      return out;
    },
    listingAccess: async ({ propertyId, org, user, all }) => {
      let qb = published().eq("organization_id", org).eq("id", propertyId);
      if (!all) qb = qb.eq("assigned_to", user);
      const { data } = await qb.maybeSingle();
      return !!data;
    },
    lastPost: async (propertyId, key, since) => {
      const { data } = await db.from("facebook_group_posts").select("posted_at").eq("property_id", propertyId).eq("group_key", key)
        .gte("posted_at", since).order("posted_at", { ascending: false }).limit(1).maybeSingle();
      return data?.posted_at ?? null;
    },
    insertPost: async (row) => {
      const { error } = await db.from("facebook_group_posts").insert(row);
      if (error) throw error;
    },
  };
}
