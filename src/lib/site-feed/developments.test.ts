import { beforeEach, expect, it, vi } from 'vitest';
import { handleDevelopmentDetail, handleDevelopmentsList } from './developments.server';
import { mapDevelopmentToFeed, type DevelopmentRow, type DevelopmentImageRow } from './developments';
import { mapPropertyToFeed, type PropertyRow } from './mapper';
import { developmentMediaTarget } from './development-media.server';
import { selectedPropertyIdsForPortal } from './selection.server';
import type { FeedAuthOk } from './auth.server';
import { mapPartnerListing } from '@/lib/partner-api/schema';

type Row = Record<string,unknown>;
const state = vi.hoisted(()=>({tables:{} as Record<string,Row[]>,selected:['p1','p2'],fail:''}));
function query(table: string) {
  const filters: ((r:Row)=>boolean)[]=[];
  let range: [number,number] | null=null;
  const run=()=>{
    const rows=(state.tables[table] ?? []).filter(r=>filters.every(f=>f(r)));
    return {data:range ? rows.slice(range[0],range[1]+1) : rows,error:state.fail===table ? {message:'read failed'} : null};
  };
  const q={select:()=>q,order:()=>q,
    eq:(k:string,v:unknown)=>(filters.push(r=>r[k]===v),q),
    is:(k:string,v:unknown)=>(filters.push(r=>(r[k] ?? null)===v),q),
    not:(k:string,_op:string,v:unknown)=>(filters.push(r=>(r[k] ?? null)!==v),q),
    in:(k:string,v:unknown[])=>(filters.push(r=>v.includes(r[k])),q),
    range:(a:number,b:number)=>(range=[a,b],q),
    maybeSingle:async()=>{const r=run();return {data:r.data[0] ?? null,error:r.error};},
    then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(run()).then(resolve),
  };return q;
}
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{from:query}}));
vi.mock('./selection.server',()=>({selectedPropertyIdsForPortal:vi.fn(async()=>state.selected)}));
vi.mock('@/lib/dynamic-feed-portals.server',()=>({resolveIndexPortal:vi.fn(async()=>({active:true}))}));
vi.mock('./property-media.server',()=>({publishableImageTarget:vi.fn(async()=> 'https://example.org/watermarked.jpg')}));

const D='33333333-3333-4333-8333-333333333333';
const D2='66666666-6666-4666-8666-666666666666';
const I='44444444-4444-4444-8444-444444444444';
const auth:FeedAuthOk={ok:true,organizationId:'org-a',tokenId:'test',tokenPrefix:'test',source:'portal_key',portal:'clickimob',scopes:['feed:read']};
const req=(path='/developments')=>new Request('http://localhost:8080/api/public/sites/v1'+path);
function parent(overrides:Row={}): DevelopmentRow {
  return {id:D,organization_id:'org-a',status:'active',deleted_at:null,name:'Fictiv',developer_name:null,description:null,
    address:null,area_from:null,area_to:null,construction_start_date:null,county_siruta_code:null,created_by:null,
    estate_type:null,locality_siruta_code:null,price_per_sqm_from:null,uat_siruta_code:null,
    city:null,county:null,district:null,street:'Privată',street_number:'9',lat:44.4,lng:26.1,location_precise:false,
    construction_stage:'În construcție',delivery_date:'2027-12-01',buildings_count:2,floors_count:5,total_units:30,
    amenities:[],price_from:null,price_to:null,currency:'EUR',assigned_to:null,created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-20T00:00:00Z',...overrides} as DevelopmentRow;
}
function unit(id:string,overrides:Row={}):PropertyRow {
  return {id,organization_id:'org-a',development_id:D,market:'primary',reference:`HB-${id}`,title:'Unitate fictivă',
    publish_status:'published',status:'active',deleted_at:null,for_sale:true,sale_price:id==='p1'?100000:150000,
    sale_currency:'EUR',currency:'EUR',property_type:'apartment',transaction_kind:'sale',...overrides} as PropertyRow;
}
beforeEach(()=>{
  state.selected=['p1','p2'];state.fail='';state.tables={developments:[parent(),parent({id:D2,organization_id:'org-b'})],
    properties:[unit('p1'),unit('p2'),unit('p3',{sale_price:1000}),unit('other',{organization_id:'org-b',development_id:D2})],
    development_images:[{id:I,organization_id:'org-a',development_id:D,is_primary:true,position:2,url:'org-a/developments/img',storage_path:'org-a/developments/img',updated_at:'2026-11-20T00:00:00Z',width:1200,height:800}],
    portal_publications:[{id:'pub',organization_id:'org-a',portal_key:'clickimob',enabled:true}],organizations:[]};
});

it('adds exact property linkage and primary market fields without altering any previous field',()=>{
  const p=unit('p1');const current=mapPropertyToFeed(p,{baseUrl:'https://example.org'});
  expect(current.ansamblu_id).toBe(D);expect(current.piata).toBe('primara');
  const {ansamblu_id,piata,...existing}=current;
  const {ansamblu_id:a,piata:b,...without}=mapPropertyToFeed({...p,development_id:null,market:null},{baseUrl:'https://example.org'});
  expect(existing).toEqual(without);expect(a).toBeNull();expect(b).toBeNull();
  expect(mapPropertyToFeed({...p,market:'secondary'},{baseUrl:'https://example.org'}).piata).toBe('secundara');
});
it('excludes a development whose properties are not selected for this portal',async()=>{
  state.selected=[];const r=await handleDevelopmentsList(req(),auth);
  expect(await r.response.json()).toMatchObject({total:0,data:[],api_version:'habitoo-site-feed/1.1'});
});
it('returns 404 for a development in another agency',async()=>{
  expect((await handleDevelopmentDetail(req('/developments/'+D2),auth,D2)).response.status).toBe(404);
});
it('includes only eligible unit idstr and prices from active selected units',async()=>{
  state.tables.properties?.push(unit('draft',{publish_status:'draft'}),unit('deleted',{deleted_at:'2026-11-19'}),unit('sold',{status:'sold'}));
  state.selected.push('draft','deleted','sold');
  const r=await handleDevelopmentsList(req(),auth);const body=await r.response.json();
  expect(body.total).toBe(1);expect(body.data[0].unitati).toEqual(['HB-p1','HB-p2']);
  expect(body.data[0]).toMatchObject({pret_de_la:100000,pret_pana_la:150000,moneda:'EUR'});
  const detail=await handleDevelopmentDetail(req('/'+D),auth,D);
  expect((await detail.response.json()).data).toEqual(body.data[0]);
});
it('hides draft, archived, deleted and empty developments',async()=>{
  for(const overrides of [{status:'draft'},{status:'archived'},{deleted_at:'2026-11-19'}]){
    state.tables.developments=[parent(overrides)];
    expect((await handleDevelopmentsList(req(),auth)).items).toBe(0);
    expect((await handleDevelopmentDetail(req(),auth,D)).response.status).toBe(404);
  }
});
it('uses site selection and excludes grace inventories and missing scopes',async()=>{
  state.selected=['p2'];
  const r=await handleDevelopmentsList(req(),{...auth,portal:null,source:'site_token',selectionPortal:'agency_site'});
  expect(selectedPropertyIdsForPortal).toHaveBeenLastCalledWith('org-a','agency_site');
  expect((await r.response.json()).data[0].unitati).toEqual(['HB-p2']);
  expect((await handleDevelopmentsList(req(),{...auth,indexStatus:'grace'})).items).toBe(0);
  expect((await handleDevelopmentDetail(req(),{...auth,indexStatus:'grace'},D)).response.status).toBe(404);
  expect((await handleDevelopmentsList(req(),{...auth,scopes:[]})).response.status).toBe(403);
});
it('caps per_page at 200 and derives parents after complete reads beyond 500 units',async()=>{
  state.tables.properties=Array.from({length:601},(_,i)=>unit('p'+i,{development_id:i===600?D2:D}));
  state.selected=state.tables.properties.map(p=>String(p.id));
  state.tables.developments=[parent(),parent({id:D2,updated_at:'2026-11-21T00:00:00Z'})];
  const r=await handleDevelopmentsList(req('/developments?per_page=999'),auth);const body=await r.response.json();
  expect(body.per_page).toBe(200);expect(body.total).toBe(2);expect(body.data[0].id).toBe(D2);
  expect(body.data[1].unitati).toHaveLength(600);
});
it('fails closed on inventory read errors',async()=>{
  state.fail='properties';await expect(handleDevelopmentsList(req(),auth)).rejects.toThrow('read failed');
});
it('preserves exact or approximate privacy, delivery text and image schema',()=>{
  const d=parent({delivery_date:'2027-Q4'});const mapped=mapDevelopmentToFeed(d,[unit('p1')],state.tables.development_images as DevelopmentImageRow[],'https://example.org');
  expect(mapped.strada).toBeNull();expect(mapped.numarstradal).toBeNull();expect(mapped.latitudine).not.toBe(d.lat);
  expect(mapped.data_livrare).toBe('2027-Q4');expect(Object.keys(mapped.images[0] ?? {}).sort()).toEqual(['src','tip','pozitie','modificata','alt','width','height'].sort());
  const exact=mapDevelopmentToFeed({...d,location_precise:true},[],[],'https://example.org');
  expect(exact.strada).toBe('Privată');expect(exact.latitudine).toBe(44.4);
});
it('does not mix currencies and keeps explicit manual overrides',()=>{
  const d=parent();
  expect(mapDevelopmentToFeed(d,[unit('p1'),unit('p2',{sale_currency:'RON'})],[],'https://example.org')).toMatchObject({pret_de_la:null,pret_pana_la:null,moneda:null});
  expect(mapDevelopmentToFeed({...d,price_from:95000},[unit('p1')],[],'https://example.org')).toMatchObject({pret_de_la:95000,pret_pana_la:100000,moneda:'EUR'});
});
it('serves development images through the shared watermark boundary only while eligible',async()=>{
  expect(await developmentMediaTarget(I)).toBe('https://example.org/watermarked.jpg');
  state.selected=[];expect(await developmentMediaTarget(I)).toBeNull();
  state.selected=['p1'];state.tables.developments=[parent({status:'archived'})];expect(await developmentMediaTarget(I)).toBeNull();
});
it('keeps Partner API payload unchanged by development linkage',()=>{
  const p=unit('p1');expect(mapPartnerListing(p,[])).toEqual(mapPartnerListing({...p,development_id:null,market:null},[]));
});