import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { compareContractValues,checkContractBody,type CheckValue,type ContractCheckIssue } from './check';
const object=(v:unknown):Record<string,unknown>=>v && typeof v==='object' && !Array.isArray(v)?v as Record<string,unknown>:{};
const value=(v:unknown):string|number|null=>typeof v==='string' || typeof v==='number'?v:null;
export async function checkContractSources(db:SupabaseClient<Database>,c:Database['public']['Tables']['contracts']['Row']):Promise<{issues:ContractCheckIssue[];checked:number}>{
  const d=object(c.data),fields=object(d['fields']),exclusive=object(d['exclusiveProperty']);
  const values:CheckValue[]=[];
  const bodyValues:{field:string;label:string;value:string|number|null}[]=[{field:'bodyPrice',label:'Preț',value:c.price},{field:'bodyCommission',label:'Comision',value:c.commission}];
  const issues:ContractCheckIssue[]=[];
  if(c.property_id){
    const {data:p,error}=await db.from('properties').select('address,street,street_number,city,county,surface,usable_surface,price,commission,currency').eq('id',c.property_id).eq('organization_id',c.organization_id).is('deleted_at',null).maybeSingle();
    if(error || !p)issues.push({field:'property',source:'proprietate',kind:'unavailable',message:'Proprietatea asociată nu este accesibilă.'});
    else values.push(
      {field:'price',label:'Preț',contract:c.price,reference:p.price,source:'proprietatea asociată'},
      {field:'currency',label:'Monedă',contract:c.currency,reference:p.currency,source:'proprietatea asociată'},
      {field:'commission',label:'Comision',contract:c.commission,reference:p.commission,source:'proprietatea asociată',required:['commission','exclusive_representation'].includes(c.kind)},
      {field:'propertyAddress',label:'Adresă proprietate',contract:value(fields['propertyAddress']??object(d['rental'])['propertyAddress']),reference:object(d['rental'])['propertyAddress']?[p.address,p.city,p.county].filter(Boolean).join(', '):p.address,source:'proprietatea asociată',required:c.kind!=='exclusive_representation'},
      {field:'surface',label:'Suprafață',contract:value(exclusive['usableSurface']??exclusive['surface']??fields['surface'])??bodyNumber(c.body,/(?:suprafa[tț]a(?:\s+util[aă])?)\s*(?:de|:)?\s*([\d.,]+)/i),reference:p.usable_surface??p.surface,source:'proprietatea asociată'}
    );
    if(p && c.kind==='exclusive_representation')values.push({field:'street',label:'Stradă proprietate',contract:value(exclusive['street']),reference:p.street,source:'proprietatea asociată'},{field:'streetNumber',label:'Număr stradă',contract:value(exclusive['streetNumber']),reference:p.street_number,source:'proprietatea asociată'},{field:'city',label:'Localitate proprietate',contract:value(exclusive['locality']),reference:p.city,source:'proprietatea asociată'});
  }else issues.push({field:'property',source:'proprietate',kind:'unavailable',message:'Contractul nu are o proprietate asociată.'});
  const {data:parties,error:pe}=await db.from('contract_parties').select('id,contact_id,full_name,address,cnp_enc').eq('contract_id',c.id).eq('organization_id',c.organization_id);
  if(pe)throw new Error('Părțile contractului nu au putut fi citite.');
  const {decryptPii}=await import('./crypto.server');
  for(const party of parties??[]){
    bodyValues.push({field:`bodyName:${party.id}`,label:'Nume semnatar',value:party.full_name});
    if(!party.contact_id){issues.push({field:`party:${party.id}`,source:'contact',kind:'unavailable',message:'Partea contractului nu are un contact asociat.'});continue;}
    const {data:contact}=await db.from('contacts').select('first_name,last_name,company').eq('id',party.contact_id).eq('organization_id',c.organization_id).maybeSingle();
    values.push({field:`name:${party.id}`,label:'Nume semnatar',contract:party.full_name,reference:contact?[contact.first_name,contact.last_name].filter(Boolean).join(' '):null,source:'contactul asociat'});
    const {data:access,error:ae}=await db.rpc('can_access_contact_identity',{_contact_id:party.contact_id});
    if(ae || access!==true){issues.push({field:`identity:${party.id}`,source:'act scanat',kind:'unavailable',message:'Identitatea din act nu este accesibilă.'});continue;}
    bodyValues.push({field:`bodyId:${party.id}`,label:'CNP/CUI semnatar',value:decryptPii(party.cnp_enc)});
    const {data:identity}=await db.from('contact_identities').select('full_name,address,cnp_enc,extracted_at').eq('contact_id',party.contact_id).maybeSingle();
    values.push({field:`idName:${party.id}`,label:'Nume semnatar',contract:party.full_name,reference:identity?.full_name??null,source:'identitatea confirmată din act'},
      {field:`idAddress:${party.id}`,label:'Adresă semnatar',contract:party.address,reference:identity?.address??null,source:'identitatea confirmată din act'},
      {field:`cnp:${party.id}`,label:'CNP/CUI semnatar',contract:decryptPii(party.cnp_enc),reference:identity?.cnp_enc?decryptPii(identity.cnp_enc):null,source:'identitatea confirmată din act'});
    if(!identity?.extracted_at)issues.push({field:`scan:${party.id}`,source:'act scanat',kind:'unavailable',message:'Nu există un act scanat confirmat pentru această parte.'});
  }
  const {data:org}=await db.from('organizations').select('cui').eq('id',c.organization_id).maybeSingle();
  values.push({field:'agencyCui',label:'CUI agenție',contract:value(object(d['agency'])['cui']),reference:org?.cui??null,source:'datele agenției'});
  bodyValues.push({field:'bodyAgencyCui',label:'CUI agenție',value:value(object(d['agency'])['cui'])});
  const placeholders=c.body.match(/\{\{[^}]+\}\}/g)??[];
  if(placeholders.length)issues.push({field:'body',source:'contract',kind:'missing',message:'Documentul conține câmpuri de șablon necompletate.'});
  if(/_{3,}/.test(c.body))issues.push({field:'bodyBlanks',source:'contract',kind:'missing',message:'Textul documentului conține spații necompletate.'});
  return {issues:[...issues,...compareContractValues(values),...checkContractBody(c.body,bodyValues)],checked:values.length+bodyValues.length};
}
function bodyNumber(text:string,pattern:RegExp):number|null{const match=pattern.exec(text)?.[1];if(!match)return null;const n=Number(match.replace(',','.'));return Number.isFinite(n)?n:null;}