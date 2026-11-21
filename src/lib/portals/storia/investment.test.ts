import {it,expect,vi} from 'vitest';
import {mapInvestment,withInvestmentParent,investmentPublishGate,investmentEventStatus} from './investment';
import {storiaMarket,mapPropertyToStoria} from './mapper';
import type {Tables} from '@/integrations/supabase/types';
import {prepareInvestmentUnits,processDevelopmentLifecycle,runDevelopmentWorker} from './development.server';
import {olxAuthorizedRequest} from './oauth.server';
import {buildStoriaPayload} from './payload.server';
vi.mock('./payload.server',()=>({buildStoriaPayload:vi.fn()}));
vi.mock('./oauth.server',()=>({olxAuthorizedRequest:vi.fn(()=>{throw new Error('No live calls allowed');})}));
const d={id:'development',name:'Ansamblu Test',description:'Descriere reală',construction_stage:'În construcție',area_from:45,area_to:100,price_per_sqm_from:1800,estate_type:'flats',total_units:50,lat:44.4,lng:26.1,amenities:[],location_precise:true} as unknown as Tables<'developments'>;
const input={images:['https://example.test/photo.jpg'],contact:{name:'Agent',email:'agent@example.test'},price:100000,currency:'EUR'};
it('investiția are categoria investments și market primary',()=>{const payload=mapInvestment(d,input);expect(payload.category_urn).toBe('urn:concept:investments');expect(payload.market).toBe('primary');expect(payload.attributes).toContainEqual({urn:'urn:concept:state',value:'urn:concept:in-construction'});});
it.each(['area_from','area_to','price_per_sqm_from','estate_type','total_units','construction_stage'] as const)('nu inventează atributul obligatoriu %s',key=>{expect(()=>mapInvestment({...d,[key]:null},input)).toThrow('Completează');});
it('unitățile nu pot primi parent_uuid înainte de succesul investiției',()=>{const payload=mapInvestment(d,input);expect(()=>withInvestmentParent(payload,{status:'pending',external_uuid:'parent-uuid'})).toThrow();expect(withInvestmentParent(payload,{status:'published',external_uuid:'parent-uuid'})).toMatchObject({market:'primary',parent_uuid:'parent-uuid'});});
it('contul de agenție singur nu permite publicarea investiției',()=>{expect(investmentPublishGate(false)).toContain('contul agenției nu poate publica');expect(investmentPublishGate(true)).toBeNull();});
it('removed_by_parent_ad este withdrawn',()=>expect(investmentEventStatus('removed_by_parent_ad','advert_lifecycle')).toBe('withdrawn'));
it('proprietate primary fără ansamblu este isolated și nu are parent_uuid',()=>{
 const p={id:'p',title:'Apartament cu două camere',description:'Descriere '.repeat(25),property_type:'apartment',status:'active',publish_status:'published',market:'primary',for_sale:true,sale_price:120000,sale_currency:'EUR',currency:'EUR',rooms:2,usable_surface:50,lat:44.4,lng:26.1,development_id:null,construction_stage:'Finalizată'} as unknown as Tables<'properties'>;
 expect(storiaMarket(p)).toBe('primary');const result=mapPropertyToStoria(p,{baseUrl:'https://example.test',images:[{id:'img',include_in_publish:true,is_confidential:false,is_primary:true,position:0} as Tables<'property_images'>],agent:{full_name:'Agent',email:'agent@example.test',phone:'0722333444'}});expect(result.ok).toBe(true);if(result.ok){expect(result.listings[0]?.advert.market).toBe('primary');expect(result.listings[0]?.advert).not.toHaveProperty('parent_uuid');}
});
it('pregătirea unităților pending nu citește și nu înscrie lucrări',async()=>{const from=vi.fn();await prepareInvestmentUnits({from} as never,{status:'pending',external_uuid:'parent',desired_active:true} as Tables<'development_portal_publications'>);expect(from).not.toHaveBeenCalled();});
it('notificarea clonei (removed_by_parent_ad) schimbă doar unitatea, nu anunțul de agenție',async()=>{
 const writes:any[]=[];const unit={id:'u',property_id:'p',development_id:'d',organization_id:'o',transaction_kind:'sale',external_uuid:'child',last_event_at:null};
 const db={from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,single:async()=>({data:{development_id:'d'}}),maybeSingle:async()=>({data:table==='storia_development_units'?unit:null}),update:(payload:unknown)=>{writes.push([table,payload]);return q;},upsert:(payload:unknown)=>{writes.push([table,payload]);return q;},then:(resolve:any)=>resolve({error:null})};return q;},rpc:vi.fn()};
 await processDevelopmentLifecycle(db as never,{advertUuid:'child',data:{code:'removed_by_parent_ad'},eventType:'advert_lifecycle',eventTimestampMs:1000000000000,publicUrl:'https://www.storia.ro/ro/oferta/clona'} as never);
 expect(writes).toContainEqual(['storia_development_units',expect.objectContaining({status:'withdrawn',public_url:'https://www.storia.ro/ro/oferta/clona'})]);
 expect(writes.filter(([t])=>t==='portal_listings'||t==='portal_publications')).toEqual([]);expect(db.rpc).not.toHaveBeenCalled();
});
it('succesul părintelui înscrie unitățile bifate fără a publica înainte',async()=>{
 const queued:any[]=[];let unit:any=null;
 const db={rpc:vi.fn(async(name:string,args:unknown)=>{queued.push([name,args]);return {error:null};}),from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,is:()=>q,in:()=>q,maybeSingle:async()=>({data:table==='portal_publications'||table==='development_portal_selections'?{enabled:true}:table==='portal_listings'?{external_id:null}:unit}),upsert:(payload:unknown)=>{unit={...(payload as any),id:'unit-id'};return q;},single:async()=>({data:unit,error:null}),then:(resolve:any)=>resolve({data:table==='properties'?[{id:'property-id',for_sale:true,for_rent:false}]:null,error:null})};return q;}};
 const parent={development_id:'d',organization_id:'o',connection_id:'c',external_uuid:'parent-id',desired_active:true} as unknown as Tables<'development_portal_publications'>;
 await prepareInvestmentUnits(db as never,{...parent,status:'pending'});expect(queued).toHaveLength(0);
 await prepareInvestmentUnits(db as never,{...parent,status:'published'});expect(unit).toMatchObject({property_id:'property-id',connection_id:'c',transaction_kind:'sale'});expect(queued).toEqual([['queue_storia_development',{_id:'d',_operation:'unit',_unit:'unit-id'}]]);
});
it('clona activă nu înscrie nicio retragere a anunțului de agenție',async()=>{
 const queue=vi.fn();const writes:string[]=[];const unit={id:'u',property_id:'p',development_id:'d',organization_id:'o',transaction_kind:'sale',external_uuid:'child',old_agency_uuid:'old',last_event_at:null};
 const db={rpc:queue,from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='storia_development_units'?unit:null}),update:()=>{writes.push(table);return q;},upsert:()=>{writes.push(table);return q;},then:(resolve:any)=>resolve({error:null})};return q;}};
 await processDevelopmentLifecycle(db as never,{advertUuid:'child',data:{code:'active'},eventType:'advert_posted_success',eventTimestampMs:1000000000001,publicUrl:null} as never);
 expect(queue).not.toHaveBeenCalled();expect(writes).toEqual(['storia_development_units']);
});
it('notificarea anunțului de agenție nu mai este ignorată când există clonă',async()=>{
 const db={rpc:vi.fn(),from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null})};return q;}};
 expect(await processDevelopmentLifecycle(db as never,{advertUuid:'old',data:{code:'active'},eventType:'advert_posted_success',eventTimestampMs:1,publicUrl:null} as never)).toBeNull();
});
it('workerul publică unitatea doar cu părinte activ și din contul dezvoltator',async()=>{
 const remote=vi.mocked(olxAuthorizedRequest);remote.mockClear();remote.mockResolvedValue({status:202,body:{data:{uuid:'child'}},raw:''});
 vi.mocked(buildStoriaPayload).mockResolvedValue({ok:true,listings:[{transaction:'sale',advert:{...mapInvestment(d,input),category_urn:'urn:concept:apartments-for-sale'}}],warnings:[]});
 const writes:any[]=[];const job={id:'j',unit_id:'u',development_id:'d',organization_id:'o',operation:'unit'};let parentStatus='pending';
 const rows:Record<string,unknown>={development_portal_selections:{enabled:true},portal_connections:{id:'c'},properties:{development_id:'d',status:'active',deleted_at:null},portal_publications:{enabled:true},storia_development_units:{id:'u',property_id:'p',development_id:'d',status:'queued',transaction_kind:'sale',external_uuid:null}};
 const db={rpc:async()=>({data:[job],error:null}),from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,single:async()=>({data:table==='development_portal_publications'?{id:'parent-row',status:parentStatus,external_uuid:'parent',desired_active:true,connection_id:'c'}:rows[table]}),maybeSingle:async()=>({data:rows[table]}),update:(v:unknown)=>{writes.push([table,v]);return q;},then:(r:any)=>r({error:null})};return q;}};
 await runDevelopmentWorker(db as never);expect(remote).not.toHaveBeenCalled();
 parentStatus='published';await runDevelopmentWorker(db as never);
 expect(remote).toHaveBeenCalledWith('o','POST','/advert/v1/',expect.objectContaining({category_urn:'urn:concept:apartments-for-sale',parent_uuid:'parent',market:'primary'}),false,'developer');
 expect(writes).toContainEqual(['storia_development_units',expect.objectContaining({external_uuid:'child',status:'pending'})]);
 remote.mockReset();remote.mockImplementation(()=>{throw new Error('No live calls allowed');});
});
