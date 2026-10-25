import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

export const getPrivateListingImports = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<Record<string, string>> => {
    const imports: Record<string, string> = {};
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await context.supabase.from("private_listing_imports")
        .select("listing_id, property_id").order("consent_at").range(offset, offset + 999);
      if (error) throw new Error("Importurile nu pot fi încărcate acum.");
      for (const row of data ?? []) if (row.listing_id) imports[row.listing_id] = row.property_id;
      if ((data?.length ?? 0) < 1000) break;
    }
    return imports;
  });

export const importPrivateListingSchema = z.object({ listingId: z.string().uuid(), consent: z.literal(true) });

export const importPrivateListing = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => importPrivateListingSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Also check in the handler; no storage writes without explicit consent.
    if (data.consent !== true) throw new Error("Acordul proprietarului este obligatoriu.");
    const client = context.supabase;
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("organization_id,is_active").eq("id", context.userId).maybeSingle();
    if (profileError || !profile?.organization_id || !profile.is_active) throw new Error("Nu ai acces la o agenție activă.");
    const { data: listing, error } = await client.from("listings")
      .select("id,source,external_id,images").eq("id", data.listingId).eq("is_owner", true).maybeSingle();
    if (error || !listing) throw new Error("Anunțul nu mai există.");
    const { data: existing, error: existingError } = await client.from("private_listing_imports")
      .select("property_id").eq("organization_id", profile.organization_id)
      .eq("source", listing.source).eq("external_id", listing.external_id).maybeSingle();
    if (existingError) throw new Error("Importul nu poate fi verificat acum.");
    if (existing) return { propertyId: existing.property_id, created: false, skipped: 0 };
    const propertyId = crypto.randomUUID();
    const { copyListingPhotos } = await import("./private-listing-import.server");
    const copied = await copyListingPhotos(client, listing.images ?? [], profile.organization_id, propertyId);
    try {
      const result = await client.rpc("import_private_listing", {
        _listing_id: listing.id, _property_id: propertyId, _consent: true,
        _images: copied.paths.map(path => ({ path })),
      });
      if (result.error) throw new Error("Proprietatea nu a putut fi importată. Reîncearcă.");
      const parsed = z.object({ propertyId: z.string().uuid(), created: z.boolean() }).parse(result.data);
      if (!parsed.created && copied.paths.length) await client.storage.from("property-media").remove(copied.paths);
      return { ...parsed, skipped: parsed.created ? copied.skipped : 0 };
    } catch (error) {
      if (copied.paths.length) await client.storage.from("property-media").remove(copied.paths);
      throw error;
    }
  });