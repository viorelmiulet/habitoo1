import {beforeEach,it,expect,vi} from 'vitest';
import {supabaseReadStore} from '@/lib/partner-api/read.server';
import {supabaseSyncDeps} from '@/lib/partner-api/sync.server';
import {SANDBOX_AGENCY_ID,SANDBOX_DEVELOPMENT_ID} from '@/lib/partner-api/sandbox';
type Row=Record<string,unknown>;
const state=vi.hoisted(()=>({tables:{} as Record<string,Row[]>,fail:''}));
function from(table:string){const filters:((r:Row)=>boolean)[]=[];let range:[number,number]|null=null;let limit=10000;const run=()=>{let data=(state.tables[table]??[]).filter(r=>filters.every(f=>f(r)));if(range)data=data.slice(range[0],range[1]+1);return {data:data.slice(0,limit),error:table===state.fail?{message:'read failed'}:null};};const q={select:()=>q,order:()=>q,eq:(k:string,v:unknown)=>(filters.push(r=>r[k]===v),q),in:(k:string,v:unknown[])=>(filters.push(r=>v.includes(r[k])),q),is:(k:string,v:unknown)=>(filters.push(r=>(r[k]??null)===v),q),gt:()=>q,or:()=>q,range:(a:number,b:number)=>(range=[a,b],q),limit:(n:number)=>(limit=n,q),maybeSingle:async()=>({data:run().data[0]??null,error:run().error}),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(run()).then(resolve)};return q;}
const db={from};
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{from:(t:string)=>from(t)}}));
vi.mock('@/lib/site-feed/selection.server',()=>({selectedPropertyIdsForPortal:async()=>['u']}));
beforeEach(()=>{state.fail='';state.tables={development_portal_selections:[{development_id:'d',portal_key:'cauta',enabled:true}],partner_api_development_state:[{development_id:'d',portal:'cauta',organization_id:'o',visible:true,payload:{id:'d'},updated_at:'2026-11-21'}],developments:[{id:'d',organization_id:'o',status:'active',deleted_at:null,name:'D',amenities:[]}],properties:[{id:'u',development_id:'d',organization_id:'o',publish_status:'published',status:'active',deleted_at:null}],property_images:[],development_images:[]};});
it('Partner API citește numai ansamblurile bifate, inclusiv în instantaneul încă vizibil',async()=>{
 const store=await supabaseReadStore();const query={orgIds:['o'],updatedSince:null,after:null,limit:25};
 expect(await store.development('cauta','d')).toBeTruthy();expect(await store.developments('cauta',query)).toHaveLength(1);
 state.tables.development_portal_selections=[];
 expect(await store.development('cauta','d')).toBeNull();expect(await store.developments('cauta',query)).toEqual([]);
});
it('sincronizarea Partner scoate părintele și legăturile când portalul este debifat',async()=>{
 const deps=supabaseSyncDeps(db as never);await deps.eligibleListings('cauta','o');expect((await deps.eligibleDevelopments?.('cauta','o'))?.developments).toHaveLength(1);
 state.tables.development_portal_selections=[];await deps.eligibleListings('cauta','o');expect(await deps.eligibleDevelopments?.('cauta','o')).toEqual({developments:[],links:{}});
});
it('citirea selecțiilor e completă și nu ignoră erori',async()=>{
 state.tables.development_portal_selections=Array.from({length:501},(_,i)=>({development_id:'d'+i,portal_key:'cauta',enabled:true}));
 state.tables.partner_api_development_state=[{development_id:'d500',portal:'cauta',organization_id:'o',visible:true}];
 const store=await supabaseReadStore();expect(await store.developments('cauta',{orgIds:['o'],updatedSince:null,after:null,limit:25})).toHaveLength(1);
 state.fail='development_portal_selections';await expect(store.development('cauta','d')).rejects.toThrow('read failed');
});
it('demo Partner API rămâne izolată și nu necesită un ansamblu CRM real',async()=>{
 state.tables.development_portal_selections=[];state.tables.partner_api_development_state=[{development_id:SANDBOX_DEVELOPMENT_ID,portal:'cauta',organization_id:SANDBOX_AGENCY_ID,visible:true}];
 const store=await supabaseReadStore();expect(await store.developments('cauta',{orgIds:[SANDBOX_AGENCY_ID],updatedSince:null,after:null,limit:25})).toHaveLength(1);
 expect(await store.developments('cauta',{orgIds:['o'],updatedSince:null,after:null,limit:25})).toEqual([]);
});