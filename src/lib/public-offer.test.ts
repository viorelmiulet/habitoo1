import { describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ filters: [] as unknown[][], order: [] as unknown[][], limits: [] as unknown[][] }));
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => { const chain = { inputValidator: () => chain, handler: (fn: unknown) => fn }; return chain; } }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (table: string) => {
 const images = Array.from({length:12},(_,position)=>({id:`photo-${position}`,alt:null,is_primary:position===3,position,width:1200,height:900,include_in_publish:true,is_confidential:false}));
 images.push({...images[0],id:'private',is_confidential:true}, {...images[1],id:'excluded',include_in_publish:false});
 let rows: any[] = table==='property_images'?images:table==='properties'?[{id:'offer',organization_id:'agency',features:[],utilities:[]}]:[{name:'Agency'}];
 const chain: Record<string, any> = { select:()=>chain, eq:(key:string,value:unknown)=>{ mock.filters.push([table,key,value]); if(table==='property_images') rows=rows.filter(r=>r[key]===value); return chain; }, is:()=>chain, in:()=>chain,
 order:(key:string,opts:unknown)=>{mock.order.push([table,key,opts]);rows.sort((a,b)=>a[key]-b[key]);return chain;},limit:(n:number)=>{mock.limits.push([table,n]);rows=rows.slice(0,n);return chain;},maybeSingle:()=>Promise.resolve({data:rows[0],error:null}),then:(resolve:any)=>Promise.resolve({data:rows,error:null}).then(resolve) };
 return chain;
} } }));
import { getPublicOffer } from './public-offer.functions';
const run=getPublicOffer as unknown as (input:{data:{id:string}})=>Promise<{images:{id:string}[]} | null>;
describe('public offer image privacy and completeness',()=>{
 it('returns all 12 publishable photos without authentication and without a six-photo cap',async()=>{
  const result=await run({data:{id:'offer'}});
  expect(result?.images).toHaveLength(12);
  expect(mock.limits).not.toContainEqual(['property_images',6]);
 });
 it('excludes confidential and excluded images while retaining primary first then CRM order',async()=>{
  const result=await run({data:{id:'offer'}});
  expect(result?.images.map(i=>i.id)).toEqual(['photo-3','photo-0','photo-1','photo-2','photo-4','photo-5','photo-6','photo-7','photo-8','photo-9','photo-10','photo-11']);
  expect(mock.filters).toContainEqual(['property_images','include_in_publish',true]);
  expect(mock.filters).toContainEqual(['property_images','is_confidential',false]);
  expect(mock.order).toContainEqual(['property_images','position',{ascending:true}]);
 });
});
