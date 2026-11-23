import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCompleteness, completenessInputFromRow, missingRequiredMessage } from "@/lib/property-completeness";

/** Citește proprietatea și fotografiile și calculează gradul de completare. */
export async function loadPropertyCompleteness(client: SupabaseClient, propertyId: string) {
  const [{ data: property, error }, { data: images }] = await Promise.all([
    client.from("properties").select("*").eq("id", propertyId).maybeSingle(),
    client.from("property_images").select("is_primary").eq("property_id", propertyId),
  ]);
  if (error) throw new Error(error.message);
  if (!property) throw new Error("Proprietatea nu a fost găsită.");
  const imageCount = images?.length ?? 0;
  const result = computeCompleteness(completenessInputFromRow(property as Record<string, unknown>, {
    imageCount, hasCover: imageCount > 0,
  }));
  return { property: property as Record<string, unknown>, result, message: missingRequiredMessage(result) };
}
