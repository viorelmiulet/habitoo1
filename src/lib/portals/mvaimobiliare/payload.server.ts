import { mapAgent, mapPropertyToFeed, type ProfileRow, type PropertyRow, type PropertyImageRow } from '@/lib/site-feed/mapper';
import { readFeedImages } from '@/lib/site-feed/complete-read.server';
import { portalKeysFor } from '@/lib/site-feed/handlers.server';
import { feedUrlsForRequest } from '@/lib/site-feed/config';
import { CRM_URL } from '@/lib/host';
import { clickimobAgencyContact, type ClickimobOrgRow } from '../clickimob/index-feed';
import { indexLogoUrl } from '../clickimob/index-feed.server';

export async function buildMvaAgency(organizationId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('organizations').select('*').eq('id', organizationId).single();
  if (error || !data) throw new Error('Datele agenției nu pot fi citite.');
  const row = data as unknown as ClickimobOrgRow & { id: string; logo_path: string | null };
  const { cui: _cui, county: _county, ...agency } = clickimobAgencyContact({ ...row, logo_url: indexLogoUrl(row) });
  return agency;
}

export async function buildMvaPayload(organizationId: string, propertyId: string) {
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const { data, error } = await db.from('properties').select('*').eq('organization_id', organizationId).eq('id', propertyId).is('deleted_at', null).maybeSingle();
  if (error || !data) throw new Error('Anunțul nu poate fi citit.');
  const row = data as unknown as PropertyRow;
  const [images, agent, portals, development] = await Promise.all([
    readFeedImages<PropertyImageRow>(db, organizationId, [propertyId]),
    row.assigned_to ? db.from('profiles').select('*').eq('organization_id', organizationId).eq('id', row.assigned_to).maybeSingle() : Promise.resolve({ data: null, error: null }),
    portalKeysFor(organizationId, [propertyId]),
    row.development_id ? db.from('developments').select('storia_hide_price').eq('organization_id', organizationId).eq('id', row.development_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (agent.error || development.error) throw new Error('Datele anunțului nu pot fi citite complet.');
  const profile = agent.data as unknown as ProfileRow | null;
  const urls = feedUrlsForRequest(CRM_URL);
  return {
    property: mapPropertyToFeed(row, { ...urls, images: images.data, agent: profile, portalKeys: portals.get(propertyId) ?? [], developmentHidePrice: development.data?.storia_hide_price === true }),
    agent: profile?.is_active === true ? mapAgent(profile, urls.baseUrl) : null,
  };
}

export async function mvaListingId(organizationId: string, propertyId: string): Promise<string> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('properties').select('reference,id').eq('organization_id', organizationId).eq('id', propertyId).maybeSingle();
  if (error || !data) throw new Error('Referința anunțului nu poate fi citită.');
  return data.reference ?? data.id;
}
