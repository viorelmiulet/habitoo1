import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('./payload.server',()=>({buildStoriaPayload:vi.fn()}));
vi.mock('./oauth.server',()=>({olxAuthorizedRequest:vi.fn(()=>{throw new Error('No live calls allowed');})}));
import {syncDevelopmentClone} from './development.server';
type Rows=Record<string,unknown>;
function fakeDb(rows:Rows,lists:Record<string,unknown[]>){
 const rpc=vi.fn(async()=>({error:null}));const upserts:any[]=[];
 const db={rpc,from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,is:()=>q,in:()=>q,maybeSingle:async()=>({data:rows[table]??null}),single:async()=>({data:{id:'unit-id'},error:null}),upsert:(v:unknown)=>{upserts.push([table,v]);return q;},then:(r:any)=>r({data:lists[table]??null,error:null})};return q;}};
 return {db,rpc,upserts};
}
const parent={development_id:'d',organization_id:'o',connection_id:'c',external_uuid:'parent',status:'published',desired_active:true};
it('asocierea unui anunț deja publicat pe Storia nu creează retragere pentru contul de agenție',async()=>{
 const {db,rpc,upserts}=fakeDb({properties:{development_id:'d'},development_portal_publications:parent,portal_publications:{enabled:true},portal_listings:{external_id:'SALE:agency-uuid'}},{properties:[{id:'p',for_sale:true,for_rent:false}],storia_development_units:[]});
 expect(await syncDevelopmentClone(db as never,'o','p',false)).toBe('queued_publish');
 const ops=rpc.mock.calls.map(c=>(c as unknown[])[1] as {_operation:string});
 expect(ops.map(o=>o._operation)).toEqual(['unit']);
 expect(upserts.filter(([t])=>t!=='storia_development_units')).toEqual([]);
 expect(upserts[0]?.[1]).not.toHaveProperty('old_agency_uuid');
});
it('fără investiție confirmată nu se creează clonă',async()=>{
 const {db,rpc}=fakeDb({properties:{development_id:'d'},development_portal_publications:{...parent,status:'pending'}},{storia_development_units:[]});
 expect(await syncDevelopmentClone(db as never,'o','p',false)).toBe('none');expect(rpc).not.toHaveBeenCalled();
});
it('debifarea Storia retrage clona, iar adaptorul continuă retragerea normală din contul de agenție',async()=>{
 const {db,rpc}=fakeDb({},{storia_development_units:[{id:'u1',development_id:'d',status:'published'},{id:'u2',development_id:'d',status:'withdrawn'}]});
 expect(await syncDevelopmentClone(db as never,'o','p',true)).toBe('queued_withdraw');
 expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('queue_storia_development',{_id:'d',_operation:'unit_withdraw',_unit:'u1'});
 const adapter=readFileSync('src/lib/portals/adapters/storia.server.ts','utf8');
 expect(adapter).not.toContain('routeDevelopmentUnit');expect(adapter).not.toContain('return developerRoute');
 expect(adapter.match(/queueDevelopmentClone\([^)]*true/g)).toHaveLength(1);
});
it('worker-ul nu mai execută old_withdraw',()=>{
 const src=readFileSync('src/lib/portals/storia/development.server.ts','utf8');
 expect(src).not.toMatch(/old_withdraw',_unit/);expect(src).not.toContain('confirmed_property_ids');expect(src).not.toContain('contului vechi');
});
