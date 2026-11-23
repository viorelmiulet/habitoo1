import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { estimatePrice, type PriceComparable, type PriceSubject } from './price';

const columns = 'id,title,property_type,transaction_kind,city,usable_surface,surface,rooms,price,currency' as const;
export async function readComplete<T>(query: (a: number,b: number) => PromiseLike<{data:T[]|null;error:unknown}>): Promise<T[]> {
  const all:T[]=[];
  for(let a=0;;a+=500){ const r=await query(a,a+499); if(r.error)throw new Error('Comparabilele nu au putut fi încărcate.'); all.push(...r.data??[]); if((r.data?.length??0)<500)return all; }
}
export async function loadPriceEstimate(db: SupabaseClient<Database>, organizationId: string, propertyId: string, agentId?:string) {
  const {data:p,error}=await db.from('properties').select(columns).eq('id',propertyId).eq('organization_id',organizationId).is('deleted_at',null).maybeSingle();
  if(error || !p)throw new Error('Anunțul nu este disponibil.');
  const subject:PriceSubject={id:p.id,type:p.property_type,transaction:p.transaction_kind,city:p.city,area:p.usable_surface??p.surface,rooms:p.rooms,currency:p.currency??''};
  const own = await readComplete((a,b)=>{
    let q=db.from('properties').select(columns).eq('organization_id',organizationId).eq('status','active').is('deleted_at',null).is('archived_at',null).neq('id',propertyId);
    if(agentId)q=q.eq('assigned_to',agentId);
    return q.order('id').range(a,b);
  });
  const rows:PriceComparable[]=own.map(c=>({id:c.id,type:c.property_type,transaction:c.transaction_kind,city:c.city,area:c.usable_surface??c.surface,rooms:c.rooms,currency:c.currency??'',price:c.price??0,title:c.title,source:'Habitoo · ofertele accesibile ale agenției',url:null}));
  if(p.city){
    const map=await readComplete((a,b)=>db.from('listings').select('id,title,property_type,transaction_type,city,surface,rooms,price,currency,source,url').eq('city',p.city??'').neq('source','facebook').order('id').range(a,b));
    rows.push(...map.map(c=>({id:`map:${c.id}`,title:c.title??'Ofertă MAP',type:c.property_type,transaction:c.transaction_type,city:c.city,area:c.surface,rooms:c.rooms,price:c.price??0,currency:c.currency??'',source:`MAP · ${c.source}`,url:c.url})));
  }
  const {data:analysis,error:ae}=await db.from('acp_analyses').select('id').eq('property_id',propertyId).eq('organization_id',organizationId).eq('status','completed').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(ae)throw new Error('Analiza ACP nu a putut fi citită.');
  if(analysis){
    const acp=await readComplete((a,b)=>db.from('acp_comparables').select('id,source_property_id,source_name,source_type,snapshot').eq('analysis_id',analysis.id).eq('is_selected',true).eq('is_outlier',false).order('id').range(a,b));
    for(const c of acp){
      // Caller RLS governs private comparables. Owner/client data is never copied.
      if(c.source_property_id && !own.some(o=>o.id===c.source_property_id))continue;
      const s=c.snapshot as {title?:string;url?:string;subject?:{propertyType?:string;transactionType?:string;city?:string;usableArea?:number;rooms?:number;price?:number;currency?:string}}|null;
      const v=s?.subject;if(!v)continue;
      rows.push({id:c.source_property_id??c.id,title:s?.title??'Ofertă comparabilă',url:typeof s?.url==='string' && /^https?:\/\//.test(s.url)?s.url:null,source:c.source_name??c.source_type,type:v.propertyType??null,transaction:v.transactionType??null,city:v.city??null,area:v.usableArea??null,rooms:v.rooms??null,price:v.price??0,currency:v.currency??''});
    }
  }
  return estimatePrice(subject,rows);
}