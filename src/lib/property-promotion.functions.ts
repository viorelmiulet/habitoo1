// Fila „Promovare” a anunțului. Citește anunțul cu clientul utilizatorului (RLS ca restul filelor);
// rândul de catalog refolosește regulile feed-ului Facebook, doar pentru acest anunț.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import type { CatalogRowReason, SocialPostData } from "@/lib/social-post";

export type PromotionPhoto = { id: string; storagePath: string | null; url: string | null; alt: string | null };

export type PropertyPromotion = {
  agencyName: string;
  post: SocialPostData;
  photos: PromotionPhoto[];
  catalog: { included: boolean; reason: CatalogRowReason | null };
};

type Db = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export const getPropertyPromotion = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ propertyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<PropertyPromotion> => {
    const db = (context as unknown as { supabase: Db }).supabase;
    const { data: p } = await db
      .from("properties")
      .select("*")
      .eq("id", data.propertyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!p) throw new Error("Anunțul nu există sau nu ai acces la el.");

    const [{ data: imgs }, { data: org }, agentRes] = await Promise.all([
      db
        .from("property_images")
        .select("id, storage_path, url, alt, position, is_primary, include_in_publish, is_confidential")
        .eq("property_id", p.id)
        .eq("include_in_publish", true)
        .eq("is_confidential", false)
        .order("is_primary", { ascending: false })
        .order("position", { ascending: true }),
      db.from("organizations").select("name").eq("id", p.organization_id).maybeSingle(),
      p.assigned_to
        ? db.from("profiles").select("full_name, phone").eq("id", p.assigned_to).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const [{ supabaseAdmin }, { loadFacebookCatalogInput }, fb] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/site-feed/facebook-catalog.server"),
      import("@/lib/site-feed/facebook-catalog"),
    ]);
    const input = await loadFacebookCatalogInput(supabaseAdmin, p.organization_id, true, [p.id], false);
    const { data: optIn } = await supabaseAdmin
      .from("portal_publications")
      .select("enabled")
      .eq("organization_id", p.organization_id)
      .eq("property_id", p.id)
      .eq("portal_key", "facebook_catalog")
      .eq("enabled", true)
      .limit(1);
    const catalogEnabled = (optIn ?? []).length > 0;
    const result = fb.buildFacebookCatalogCsv({
      ...input,
      baseUrl: "https://crm.habitoo.ro",
      publicSiteUrl: "https://habitoo.ro",
    });
    const reason =
      input.properties.length === 0
        ? ("not_published" as const)
        : result.included > 0
          ? null
          : (result.excludedItems?.[0]?.reason ?? null);
    const catalog = { enabled: catalogEnabled, included: catalogEnabled && !reason, reason };

    const offer = fb.pickOffer(p);
    const agent = agentRes.data as { full_name: string | null; phone: string | null } | null;
    return {
      agencyName: org?.name ?? "",
      post: {
        propertyType: p.property_type ?? null,
        transactionKind: offer?.mode ?? (p.transaction_kind === "rent" ? "rent" : "sale"),
        rooms: p.rooms ?? null,
        district: p.district ?? null,
        city: p.city ? fb.metaCity(p.city).city : null,
        floor: p.floor ?? null,
        usableSurface: p.usable_surface ?? null,
        features: Array.isArray(p.features) ? p.features : [],
        price: offer?.amount ?? null,
        currency: offer?.currency ?? null,
        agentName: agent?.full_name ?? null,
        agentPhone: agent?.phone ?? null,
      },
      photos: ((imgs ?? []) as {
        id: string;
        storage_path: string | null;
        url: string | null;
        alt: string | null;
      }[]).map((i) => ({ id: i.id, storagePath: i.storage_path, url: i.url, alt: i.alt })),
      catalog,
    };
  });
