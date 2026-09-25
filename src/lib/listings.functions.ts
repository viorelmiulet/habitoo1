// Server function pentru pagina „Anunțuri Proprietari", disponibilă doar
// utilizatorilor autentificați: citește anunțurile cu is_owner = true din
// tabelul `listings` ca utilizatorul conectat (RLS permite SELECT public).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OwnerListing = {
  id: string;
  source: string;
  title: string | null;
  price: number | null;
  currency: string | null;
  pricePerM2: number | null;
  rooms: number | null;
  surface: number | null;
  floor: string | null;
  location: string | null;
  county: string | null;
  propertyType: string | null;
  transactionType: string | null;
  ownerType: string | null;
  phone: string | null;
  url: string | null;
  description: string | null;
  scrapedAt: string | null;
};

export const getOwnerListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OwnerListing[]> => {
    const { data, error } = await context.supabase
      .from("listings")
      .select(
        "id, source, title, price, currency, price_per_m2, rooms, surface, floor, location, county, property_type, transaction_type, owner_type, phone, url, description, scraped_at",
      )
      .eq("is_owner", true)
      .order("scraped_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      price: row.price === null ? null : Number(row.price),
      currency: row.currency,
      pricePerM2: row.price_per_m2 === null ? null : Number(row.price_per_m2),
      rooms: row.rooms,
      surface: row.surface === null ? null : Number(row.surface),
      floor: row.floor,
      location: row.location,
      county: row.county,
      propertyType: row.property_type,
      transactionType: row.transaction_type,
      ownerType: row.owner_type,
      phone: row.phone,
      url: row.url,
      description: row.description,
      scrapedAt: row.scraped_at,
    }));
  });
