/**
 * Backfill: citește `/meta` pentru anunțurile Storia deja publicate și salvează
 * linkul public (`state.url`) plus id-ul numeric extras din el (`AD:<id>`).
 *
 * Superadmin-only. Necesar o singură dată pentru anunțurile create înainte de
 * introducerea coloanei `portal_listings.public_url`; ulterior linkul se
 * salvează automat la publicare și din notificările de ciclu de viață.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth-middleware-helpers";

export const backfillStoriaPublicUrls = createServerFn({ method: "POST" })
  .middleware([requireSuperadmin.middleware])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { parseAdvertRefs, readAdvertMeta, storiaAdIdFromUrl, withStoriaAdId } = await import(
      "./adverts.server"
    );

    let query = admin
      .from("portal_listings")
      .select("id, organization_id, property_id, external_id, public_url")
      .eq("portal", "storia");
    if (data.organizationId) query = query.eq("organization_id", data.organizationId);
    const { data: rows } = await query;

    const results: {
      propertyId: string;
      url: string | null;
      adId: string | null;
      externalId: string | null;
    }[] = [];

    for (const row of rows ?? []) {
      const refs = parseAdvertRefs(row.external_id);
      let url: string | null = null;
      for (const uuid of [refs.sale, refs.rent].filter(Boolean) as string[]) {
        const meta = await readAdvertMeta(row.organization_id, uuid).catch(() => null);
        if (meta?.url) {
          url = meta.url;
          break;
        }
      }
      const adId = storiaAdIdFromUrl(url);
      const externalId = adId ? withStoriaAdId(row.external_id, adId) : row.external_id;
      if (url) {
        await admin
          .from("portal_listings")
          .update({ public_url: url, external_id: externalId })
          .eq("id", row.id);
      }
      results.push({ propertyId: row.property_id, url, adId, externalId });
    }

    return { checked: (rows ?? []).length, results };
  });
