// Server function publică pentru pagina „Anunțuri Proprietari”.
// Fără token și fără sesiune: citește strict anunțurile cu is_owner = true
// din tabelul `listings`, prin clientul public (RLS permite SELECT pentru toți).
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type OwnerListing = {
  id: string;
  source: string;
  title: string | null;
  price: number | null;
  currency: string | null;
  pricePerM2: number | null;
  rooms: number | null;
  surface: number | null;
  location: string | null;
  county: string | null;
  propertyType: string | null;
  transactionType: string | null;
  ownerType: string | null;
  phone: string | null;
  url: string | null;
  scrapedAt: string | null;
};

export const getOwnerListings = createServerFn({ method: "GET" }).handler(
  async (): Promise<OwnerListing[]> => {
    const supabase = createClient<Database>(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
    );

    const { data, error } = await supabase
      .from("listings")
      .select(
        "id, source, title, price, currency, price_per_m2, rooms, surface, location, county, property_type, transaction_type, owner_type, phone, url, scraped_at",
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
      location: row.location,
      county: row.county,
      propertyType: row.property_type,
      transactionType: row.transaction_type,
      ownerType: row.owner_type,
      phone: row.phone,
      url: row.url,
      scrapedAt: row.scraped_at,
    }));
  },
);
