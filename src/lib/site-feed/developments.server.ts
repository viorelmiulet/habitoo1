import { readDevelopmentContacts, resolveDevelopmentContact } from "@/lib/developments/contact.server";
import { feedSelectionPortal } from './agency-site';
import { selectedPropertyIdsForPortal } from './selection.server';
import { readCompleteRows } from './complete-read.server';
import { errorResponse, jsonResponse, FEED_API_VERSION, type FeedAuthOk } from './auth.server';
import { buildPaginatedFeed, parsePagination, isPropertyFeedEligible, FEED_PUBLIC_STATUSES, type PropertyRow } from './mapper';
import { mapDevelopmentToFeed, type DevelopmentRow } from './developments';
import { feedUrlsForRequest } from './config';
import type { FeedHandlerResult } from './handlers.server';
import {selectedDevelopmentIds} from '@/lib/developments/portal-selections.server';

type Db = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

/** Same portal/contact/status selection as properties, complete before deriving parents. */
export async function readDevelopmentFeedUnits(auth: FeedAuthOk, developmentId?: string): Promise<PropertyRow[]> {
  if (auth.indexStatus === 'grace') return [];
  const portal = feedSelectionPortal(auth);
  const selected = portal ? await selectedPropertyIdsForPortal(auth.organizationId, portal) : null;
  if (selected?.length === 0) return [];
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const chunks = selected ? Array.from({length: Math.ceil(selected.length / 300)}, (_,i) => selected.slice(i*300,(i+1)*300)) : [null];
  const units: PropertyRow[] = [];
  for (const chunk of chunks) {
    units.push(...await readCompleteRows((from,to) => {
      let q = db.from('properties').select('*').eq('organization_id',auth.organizationId)
        .eq('publish_status','published').is('deleted_at',null).in('status',[...FEED_PUBLIC_STATUSES])
        .not('development_id','is',null).order('id');
      if (chunk) q = q.in('id',chunk);
      if (developmentId) q = q.eq('development_id',developmentId);
      return q.range(from,to);
    }));
  }
  const allowed=portal&&portal!=='agency_site'?new Set(await selectedDevelopmentIds(db,portal,[...new Set(units.flatMap(u=>u.development_id?[u.development_id]:[]))])):null;
  return units.filter(u=>isPropertyFeedEligible(u)&&(!allowed||Boolean(u.development_id&&allowed.has(u.development_id))));
}

async function imagesFor(db: Db, organizationId: string, ids: string[]) {
  if (!ids.length) return [];
  return readCompleteRows((from,to) => db.from('development_images').select('*')
    .eq('organization_id',organizationId).in('development_id',ids).order('id').range(from,to));
}

export async function handleDevelopmentsList(request: Request, auth: FeedAuthOk): Promise<FeedHandlerResult> {
  if (!auth.scopes.includes('feed:read')) return {response:errorResponse(403,'Missing scope: feed:read'),items:0};
  const url = new URL(request.url);
  const {page,perPage} = parsePagination(url);
  const units = await readDevelopmentFeedUnits(auth);
  const unitMap = new Map<string,PropertyRow[]>();
  for (const unit of units) {
    if (!unit.development_id) continue;
    const list = unitMap.get(unit.development_id) ?? [];
    list.push(unit); unitMap.set(unit.development_id,list);
  }
  const {supabaseAdmin:db} = await import('@/integrations/supabase/client.server');
  const ids = [...unitMap.keys()];
  const parents: DevelopmentRow[] = [];
  for (let i=0; i<ids.length; i+=300) parents.push(...await readCompleteRows((from,to) => db.from('developments').select('*')
    .eq('organization_id',auth.organizationId).eq('status','active').is('deleted_at',null)
    .in('id',ids.slice(i,i+300)).order('id').range(from,to)));
  parents.sort((a,b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
  const rows = parents.slice((page-1)*perPage,page*perPage);
  const [images, contacts] = await Promise.all([imagesFor(db,auth.organizationId,rows.map(d=>d.id)), readDevelopmentContacts(db, rows)]);
  const baseUrl = feedUrlsForRequest(url).baseUrl;
  const feed = buildPaginatedFeed({data:rows.map(d=>mapDevelopmentToFeed(d,unitMap.get(d.id) ?? [],images.filter(i=>i.development_id===d.id),baseUrl,contacts.get(d.id)?.id ?? null)),total:parents.length,page,perPage,requestUrl:url});
  return {response:jsonResponse({...feed,api_version:FEED_API_VERSION},200,60),items:rows.length};
}

export async function handleDevelopmentDetail(request: Request, auth: FeedAuthOk, rawId: string): Promise<FeedHandlerResult> {
  if (!auth.scopes.includes('feed:read')) return {response:errorResponse(403,'Missing scope: feed:read'),items:0};
  const id = rawId.trim();
  const missing = () => ({response:errorResponse(404,'Development not found.'),items:0});
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || auth.indexStatus==='grace') return missing();
  const {supabaseAdmin:db} = await import('@/integrations/supabase/client.server');
  const {data:d,error} = await db.from('developments').select('*').eq('organization_id',auth.organizationId)
    .eq('id',id).eq('status','active').is('deleted_at',null).maybeSingle();
  if (error) throw error;
  if (!d) return missing();
  const units = await readDevelopmentFeedUnits(auth,id);
  if (!units.length) return missing();
  const [images, contact] = await Promise.all([imagesFor(db,auth.organizationId,[id]), resolveDevelopmentContact(db,d)]);
  const mapped = mapDevelopmentToFeed(d,units,images,feedUrlsForRequest(new URL(request.url)).baseUrl,contact?.id ?? null);
  return {response:jsonResponse({data:mapped,api_version:FEED_API_VERSION},200,60),items:1};
}