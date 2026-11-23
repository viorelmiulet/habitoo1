import type {Tables} from '@/integrations/supabase/types';
import type {StoriaAdvert} from './mapper';
import taxonomy from './reference/investments-taxonomy.json';
import {publicCoords} from '@/lib/geo';
import {storiaAttributeSpec} from './taxonomy-snapshot';
const HIDE_PRICE='urn:concept:hide-price';
export function investmentPublishGate(connected:boolean){return connected?null:'Conectează contul dezvoltator Storia; contul agenției nu poate publica ansambluri.';}
/** Unitățile primesc hide-price doar dacă taxonomia categoriei lor îl conține (anunțurile simple nu trec niciodată pe aici). */
export function withInvestmentParent(advert:StoriaAdvert,parent:{status:string;external_uuid:string|null},opts:{hidePrice?:boolean}={}):StoriaAdvert{
 if(parent.status!=='published'||!parent.external_uuid)throw new Error('Investiția nu este încă publicată cu succes.');
 const out:StoriaAdvert={...advert,market:'primary',parent_uuid:parent.external_uuid};
 if(storiaAttributeSpec(advert.category_urn,HIDE_PRICE))out.attributes=[...(advert.attributes??[]).filter(a=>a.urn!==HIDE_PRICE),{urn:HIDE_PRICE,value:opts.hidePrice?'urn:concept:yes':'urn:concept:no'}];
 return out;
}
export function investmentEventStatus(code:string|null,eventType:string|null){if(code==='active')return 'published';if(code==='removed_by_parent_ad'||code==='removed_by_user'||/(deactivated|deleted)_success$/.test(eventType??''))return 'withdrawn';if(/_error$/.test(eventType??''))return 'error';return 'pending';}
export function mapInvestment(d:Tables<'developments'>,input:{images:string[];contact:NonNullable<StoriaAdvert['contact']>;price:number|null;currency:string|null}):StoriaAdvert{
 const coords=publicCoords(d);
 const state:Record<string,string>={'Finalizată':'ready','La cheie':'ready','În construcție':'in-construction','La roșu':'in-construction','Semifinisată':'in-construction','Proiect':'not-started'};
 const fields:Record<string,string|number|null|undefined>={state:state[d.construction_stage??''], 'area-from':d.area_from,'area-to':d.area_to,'price-per-sq-meter-from':d.price_per_sqm_from,'estate-type':d.estate_type,'total-number-of-properties-in-the-investment':d.total_units,'floors-in-building':d.floors_count,'start-date':d.construction_start_date,'end-date':d.delivery_date,'hide-price':d.storia_hide_price?'yes':'no'};
 const spec=taxonomy.data[0];const attributes:StoriaAdvert['attributes']=[];
 for(const a of spec?.attributes??[]){const key=a.code.replace('urn:concept:','');const value=fields[key];if(a.mandatory&&(value==null||value===''))throw new Error(`Completează ${a.label}.`);if(value!=null&&value!=='')attributes.push({urn:a.code,value:a.type==='select'?`urn:concept:${value}`:String(value)});}
 const amenities:Record<string,[string,string]>={'Lift':['project-amenities','elevators'],'Piscină interioară':['project-amenities','swimming-pool'],'Piscină exterioară':['project-amenities','swimming-pool'],'Spații agrement':['project-amenities','relax-area'],'Loc de joacă':['project-amenities','playground'],'Sală fitness':['project-amenities','gym'],'Parcare subterană':['extra-spaces','underground-parking-space'],'Pază':['project-security','security-vigilance'],'Supraveghere video':['project-security','monitoring']};
 for(const name of d.amenities){const a=amenities[name];if(a&&!attributes.some(v=>v.urn===`urn:concept:${a[0]}`&&v.value===`urn:concept:${a[1]}`))attributes.push({urn:`urn:concept:${a[0]}`,value:`urn:concept:${a[1]}`});}
 if(!d.name.trim()||!d.description?.trim()||!coords||!input.images.length||!input.price||!['RON','EUR'].includes(input.currency??'')||!input.contact.email)throw new Error('Completează titlul, descrierea, poziția pe hartă, prețul, fotografiile și emailul agentului.');
 return {title:d.name,description:d.description,category_urn:'urn:concept:investments',market:'primary',contact:input.contact,price:{value:Math.round(input.price),currency:input.currency??'EUR'},location:{lat:coords.lat,lon:coords.lng,exact:d.location_precise},images:input.images.slice(0,40).map(url=>({url})),attributes,site_urn:'urn:site:storiaro',custom_fields:{id:`HBT-DEV-${d.id}`},auto_extend:false};
}
