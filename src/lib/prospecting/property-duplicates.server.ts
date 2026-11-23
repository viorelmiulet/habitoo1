import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import jpeg from 'jpeg-js';
import { normalizeReportImage } from '@/lib/acp/report/images.server';
import { readComplete } from '@/lib/owner-reports/price.server';
import { duplicateMatch,perceptualHash,type DuplicateOffer } from './property-duplicates';
type PhotoOffer=DuplicateOffer & {images:string[]};
const urls=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];
export function allowedDuplicateImage(raw:string,storageHost:string):boolean{
  try{const u=new URL(raw);return u.protocol==='https:' && !u.username && !u.password && (!u.port || u.port==='443') && (u.hostname===storageHost || ['olxcdn.com','storia.ro','imobiliare.ro','romimo.ro','homezz.ro','imoradar24.ro','anuntul.ro','fbcdn.net'].some(h=>u.hostname===h || u.hostname.endsWith(`.${h}`)));}catch{return false;}
}
async function hashPhoto(url:string,storageHost:string):Promise<string|null>{
  if(!allowedDuplicateImage(url,storageHost))return null;
  try{
    const res=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(5000)});if(!res.ok || Number(res.headers.get('content-length')??0)>3000000)return null;
    if(!res.body)return null;
    const reader=res.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>3000000){await reader.cancel();return null;}chunks.push(r.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    const normalized=normalizeReportImage(bytes,72,70);if(!normalized)return null;
    const image=jpeg.decode(normalized.jpeg,{useTArray:true,formatAsRGBA:true,maxResolutionInMP:1,maxMemoryUsageInMB:10});
    return perceptualHash(image.data,image.width,image.height);
  }catch{return null;}
}
export async function findPropertyDuplicates(db:SupabaseClient<Database>,org:string,agent:string|null,kind:'map'|'property',id:string){
  const pcols='id,title,address,city,lat,lng,surface,usable_surface,floor,assigned_to';
  const propertyQuery=()=>{let q=db.from('properties').select(pcols).eq('organization_id',org).is('deleted_at',null);if(agent)q=q.eq('assigned_to',agent);return q;};
  const {data:p,error}=kind==='property'?await propertyQuery().eq('id',id).maybeSingle():{data:null,error:null};
  if(error || (kind==='property' && !p))throw new Error('Anunțul nu este accesibil.');
  const {data:m,error:me}=kind==='map'?await db.from('listings').select('id,title,city,surface,floor_num,images,source,url').eq('id',id).eq('is_owner',true).maybeSingle():{data:null,error:null};
  if(me || (kind==='map' && !m))throw new Error('Anunțul nu este accesibil.');
  const city=p?.city??m?.city;
  if(!city)return {matches:[],checked:0,photoNotice:'Localitatea lipsește; comparația nu este disponibilă.'};
  const own=await readComplete((a,b)=>propertyQuery().eq('city',city).order('id').range(a,b));
  const map=await readComplete((a,b)=>db.from('listings').select('id,title,city,surface,floor_num,images,source,url').eq('city',city).order('id').range(a,b));
  const offers:PhotoOffer[]=[...own.map(r=>({id:`property:${r.id}`,title:r.title,source:'Habitoo',href:`/app/properties/${r.id}`,city:r.city,address:r.address,lat:r.lat,lng:r.lng,area:r.usable_surface??r.surface,floor:r.floor,hashes:[],images:[]})),...map.map(r=>({id:`map:${r.id}`,title:r.title??'Anunț',source:`MAP · ${r.source}`,href:r.url,city:r.city,address:null,lat:null,lng:null,area:r.surface,floor:r.floor_num,hashes:[],images:urls(r.images)}))];
  const anchor=offers.find(r=>r.id===`${kind==='map'?'map':'property'}:${id}`);if(!anchor)throw new Error('Anunțul nu mai este disponibil.');
  // ACP source snapshots carry only listing facts, never technical collection details.
  const analyses=await readComplete((a,b)=>db.from('acp_analyses').select('id,property_id,created_at').eq('organization_id',org).eq('status','completed').order('created_at',{ascending:false}).order('id').range(a,b));
  const latest=new Set<string>();
  for(const analysis of analyses.filter(a=>a.property_id && own.some(p=>p.id===a.property_id))){
    if(!analysis.property_id || latest.has(analysis.property_id))continue;
    latest.add(analysis.property_id);
    const cs=await readComplete((a,b)=>db.from('acp_comparables').select('id,source_name,source_type,source_property_id,snapshot').eq('analysis_id',analysis.id).order('id').range(a,b));
    for(const c of cs){
      if(c.source_type==='facebook' || c.source_name?.toLowerCase().includes('facebook'))continue;
      if(c.source_property_id)continue; // Own listings already included; other agencies never leak.
      const s=c.snapshot as {title?:string;url?:string;subject?:{city?:string;latitude?:number;longitude?:number;usableArea?:number;floor?:number};report?:{photos?:string[]}}|null;
      const v=s?.subject;if(!v || v.city!==city)continue;
      if(s?.url && offers.some(o=>o.href===s.url))continue;
      offers.push({id:`acp:${c.id}`,title:s?.title??'Comparabilă ACP',source:c.source_name??'ACP',href:s?.url??null,city:v.city,address:null,lat:v.latitude??null,lng:v.longitude??null,area:v.usableArea??null,floor:v.floor??null,hashes:[],images:urls(s?.report?.photos)});
    }
  }
  const candidates=offers.filter(c=>c.id!==anchor.id && (!anchor.href || c.href!==anchor.href) && (anchor.area===null || c.area===null || Math.abs(c.area-anchor.area)<=Math.max(c.area,anchor.area)*.05) && (anchor.floor===null || c.floor===null || c.floor===anchor.floor));
  const storageHost=new URL(process.env['SUPABASE_URL']??'https://invalid.example').hostname;
  const toHash=[anchor,...candidates.slice(0,30)];let unavailable=0;let checkedPhotos=0;
  const deadline=Date.now()+15000;
  for(const o of toHash){
    if(Date.now()>=deadline)break;
    if(o.source==='Habitoo'){
      const {data:images}=await db.from('property_images').select('storage_path').eq('organization_id',org).eq('property_id',o.id.slice(9)).eq('is_confidential',false).order('position').limit(3);
      for(const image of images??[]){if(!image.storage_path)continue;const signed=await db.storage.from('property-media').createSignedUrl(image.storage_path,120,{transform:{width:160,height:160,resize:'contain',quality:70}});if(signed.data?.signedUrl)o.images.push(signed.data.signedUrl);}
    }
    for(const image of o.images.slice(0,3)){if(Date.now()>=deadline)break;const h=await hashPhoto(image,storageHost);checkedPhotos++;if(h)o.hashes.push(h);else unavailable++;}
  }
  const matches=candidates.flatMap(c=>{const match=duplicateMatch(anchor,c);if(!match)return [];const {images:_images,...offer}=match.offer as PhotoOffer;return [{...match,offer:{...offer,hashes:[]}}];}).sort((a,b)=>b.score-a.score);
  return {matches,checked:candidates.length,photoNotice:`${checkedPhotos} fotografii verificate, ${unavailable} indisponibile; maximum 3/anunț și 30 anunțuri similare, în limita timpului disponibil. Comparațiile rămase folosesc doar datele disponibile.`};
}