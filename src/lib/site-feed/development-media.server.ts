import { AGENCY_SITE_PORTAL_KEY } from './agency-site';
import { readCompleteRows } from './complete-read.server';
import { readDevelopmentFeedUnits } from './developments.server';
import { parseMediaId } from './media-redirect.server';
import { publishableImageTarget } from './property-media.server';
import type { ImageParams } from './image-params';
import type { FeedAuthOk } from './auth.server';

/** Public image capabilities require at least one unit selected in an active JSON feed. */
export async function developmentMediaTarget(rawId: unknown, params?: ImageParams | null) {
  const id = parseMediaId(rawId);
  if (!id) return null;
  const {supabaseAdmin:db} = await import('@/integrations/supabase/client.server');
  const {data:image,error:imageError} = await db.from('development_images').select('*').eq('id',id).maybeSingle();
  if (imageError) throw imageError;
  if (!image) return null;
  const {data:d,error} = await db.from('developments').select('id,organization_id,status,deleted_at')
    .eq('id',image.development_id).eq('organization_id',image.organization_id).eq('status','active').is('deleted_at',null).maybeSingle();
  if (error) throw error;
  if (!d) return null;
  const pubs = await readCompleteRows((from,to)=>db.from('portal_publications').select('portal_key')
    .eq('organization_id',d.organization_id).eq('enabled',true).order('id').range(from,to));
  const {resolveIndexPortal} = await import('@/lib/dynamic-feed-portals.server');
  let eligible = false;
  for (const portal of new Set(pubs.map(p=>p.portal_key))) {
    if (portal===AGENCY_SITE_PORTAL_KEY) {
      const site = await db.from('agency_site_portals').select('active').eq('organization_id',d.organization_id).maybeSingle();
      if (site.error) throw site.error;
      if (!site.data?.active) continue;
    } else if (!(await resolveIndexPortal(portal))?.active) continue;
    const auth: FeedAuthOk = {ok:true,organizationId:d.organization_id,tokenId:'media',tokenPrefix:'media',source:'portal_key',portal,scopes:['feed:read']};
    if ((await readDevelopmentFeedUnits(auth,d.id)).length) {eligible=true;break;}
  }
  if (!eligible) return null;
  const {data:org,error:orgError} = await db.from('organizations')
    .select('logo_path, watermark_enabled, watermark_position, watermark_scale_percent, watermark_opacity_percent, watermark_margin_percent')
    .eq('id',d.organization_id).maybeSingle();
  if (orgError) throw orgError;
  // ANS1 gallery has no confidential/publication toggles: every gallery image is publishable.
  return publishableImageTarget(db,{...image,include_in_publish:true,is_confidential:false},
    {status:'active',publish_status:'published',deleted_at:null},org,params);
}