import {beforeEach,expect,it,vi} from 'vitest';

type Row=Record<string,unknown>;
const mocks=vi.hoisted(()=>({tables:{} as Record<string,Row[]>,reads:[] as {table:string;filters:[string,unknown][]}[],tokens:vi.fn(),sign:vi.fn(),rpc:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{
 let validate:(v:unknown)=>unknown=v=>v;
 const builder={middleware:()=>builder,inputValidator:(f:(v:unknown)=>unknown)=>{validate=f;return builder;},handler:(f:(args:unknown)=>unknown)=>(input:{data:unknown})=>f({data:validate(input.data),context:{supabase:{from,rpc:mocks.rpc}}})};
 return builder;
}}));
vi.mock('@/lib/org-access',()=>({requireActiveOrgAuth:{}}));
vi.mock('./oauth.server',()=>({loadStoriaTokens:mocks.tokens}));
vi.mock('@/lib/site-feed/property-media.server',()=>({publishableImageTarget:mocks.sign}));
function from(table:string){
 const filters:[string,unknown][]=[];mocks.reads.push({table,filters});
 const result=()=>({data:(mocks.tables[table]??[]).filter(row=>filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):(row[key]??null)===value)),error:null});
 const query={select:()=>query,eq:(key:string,value:unknown)=>{filters.push([key,value]);return query;},is:(key:string,value:unknown)=>{filters.push([key,value]);return query;},in:(key:string,values:unknown[])=>{filters.push([key,values]);return query;},range:()=>query,order:()=>query,single:async()=>({...result(),data:result().data[0]??null}),maybeSingle:async()=>({...result(),data:result().data[0]??null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
 return query;
}
import {getDevelopmentPublishing} from './development.functions';
const id='00000000-0000-4000-8000-000000000030';
beforeEach(()=>{
 vi.clearAllMocks();mocks.reads=[];mocks.tokens.mockResolvedValue(null);
 mocks.tables={
  developments:[{id,organization_id:'org',assigned_to:'agent',name:'MRM',description:null,lat:44.4,lng:26.1,construction_stage:'În construcție',area_from:null,area_to:null,price_per_sqm_from:null,estate_type:'flats',total_units:65,price_from:null}],
  profiles:[{id:'agent',organization_id:'org',email:'a@e.test'}],
  development_images:[{development_id:id,storage_path:'private.jpg'},{development_id:'other',storage_path:'outside.jpg'}],
  properties:[{development_id:id,deleted_at:null,status:'active',for_sale:true,sale_price:100000,sale_currency:'EUR'},{development_id:id,deleted_at:'yesterday',status:'active',for_sale:true,sale_price:1,sale_currency:'RON'},{development_id:'other',deleted_at:null,status:'active',for_sale:true,sale_price:1,sale_currency:'RON'}],
 };
});
it('citirea întoarce cele patru lipsuri folosind prețul, agentul și fotografiile ansamblului, fără semnare sau scrieri',async()=>{
 const result=await getDevelopmentPublishing({data:{id}});
 expect(result.missingFields).toEqual(['Descriere','Suprafață minimă (m²)','Suprafață maximă (m²)','Preț minim pe m²']);
 expect(mocks.reads.find(r=>r.table==='properties')?.filters).toEqual([['development_id',id],['deleted_at',null]]);
 expect(mocks.reads.find(r=>r.table==='profiles')?.filters).toEqual([['organization_id','org'],['id',['agent']]]);
 expect(mocks.sign).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});
it('numără numai fotografiile publicabile, excluzând planul separat',async()=>{
 mocks.tables['development_images']=[{development_id:id,url:'http://e.test/invalid.jpg'},{development_id:id,storage_path:'plan.jpg',is_floor_plan:true,is_primary:false}];
 const result=await getDevelopmentPublishing({data:{id}});
 expect(result.missingFields).toContain('Fotografie');expect(mocks.sign).not.toHaveBeenCalled();
});
it('ansamblul inaccesibil nu permite alte citiri',async()=>{
 mocks.tables['developments']=[];
 await expect(getDevelopmentPublishing({data:{id}})).rejects.toThrow('Ansamblu inaccesibil.');
 expect(mocks.reads.map(r=>r.table)).toEqual(['developments']);expect(mocks.tokens).not.toHaveBeenCalled();
});
it('contactul informativ folosește același creator ca preflightul Storia',async()=>{
 const d=mocks.tables['developments']?.[0];if(!d)throw new Error('Lipsește ansamblul fictiv');
 d['created_by']='creator';
 mocks.tables['profiles']?.push({id:'creator',organization_id:'org',is_active:true,full_name:'Creator fictiv',email:'creator@e.test',phone:'0700000001'});
 const result=await getDevelopmentPublishing({data:{id}});
 expect(result.contactAgent).toEqual({name:'Creator fictiv',phone:'0700000001'});
});
