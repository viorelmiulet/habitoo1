import { resolveDevelopmentContact } from "@/lib/developments/contact.server";
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/integrations/supabase/types';
import { httpsUrlOrNull } from '@/lib/site-feed/mapper';
import { investmentPrice } from './investment-readiness';

/** Shared source reads for publishing and preflight; never signs image URLs. */
export async function readInvestmentData(db: SupabaseClient<Database>, d: Tables<'developments'>) {
  const [imagesResult, agent, propertiesResult] = await Promise.all([
    db.from('development_images').select('*').eq('development_id', d.id).order('position'),
    resolveDevelopmentContact(db, d),
    db.from('properties').select('sale_price,sale_currency,currency,for_sale,status').eq('development_id', d.id).is('deleted_at', null),
  ]);
  if (imagesResult.error) throw imagesResult.error;
  if (propertiesResult.error) throw propertiesResult.error;
  const images = imagesResult.data ?? [];
  // The mapper requires a regular photo, not just the separately supplied plan.
  let hasPlan = false;
  const imageCount = images.filter(image => {
    if (!image.storage_path && !httpsUrlOrNull(image.url)) return false;
    if (image.is_floor_plan && !image.is_primary && !hasPlan) { hasPlan = true; return false; }
    return true;
  }).length;
  return { images, agent, imageCount, ...investmentPrice(d, propertiesResult.data ?? []) };
}