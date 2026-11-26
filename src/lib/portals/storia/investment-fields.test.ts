import {it,expect,describe} from 'vitest';
import {mapInvestment} from './investment';
import taxonomy from './reference/investments-taxonomy.json';
import {developmentAmenityGroups,isAmenityChecked,toggleAmenity,storiaAmenityAttributes,ceilingHeightError,canMarkFloorPlan} from '@/lib/developments/amenities';
import type {Tables} from '@/integrations/supabase/types';
const base={id:'0f1e2d3c-aaaa-bbbb-cccc-1234567890ab',name:'MRM',description:'Descriere',construction_stage:'În construcție',area_from:45,area_to:100,price_per_sqm_from:1800,estate_type:'flats',total_units:65,lat:44.4,lng:26.1,amenities:[],location_precise:true,storia_hide_price:false} as unknown as Tables<'developments'>;
const input={images:['https://e.test/1.jpg'],contact:{name:'A',email:'a@e.test'},price:100000,currency:'EUR'};
const attrs=(d:Partial<Tables<'developments'>>)=>mapInvestment({...base,...d} as Tables<'developments'>,input).attributes??[];
const GROUPS=['project-amenities','project-security','extra-spaces'];
describe('A — facilități',()=>{
 it('toate cele 19 opțiuni Storia se trimit, fiecare o dată',()=>{
  const all=developmentAmenityGroups.flatMap(g=>g.options).filter(o=>o.storia).map(o=>o.label);
  const out=attrs({amenities:all}).filter(a=>GROUPS.includes(a.urn.replace('urn:concept:','')));
  expect(out).toHaveLength(19);expect(new Set(out.map(a=>a.urn+a.value)).size).toBe(19);
 });
 it('MRM: Interfon, Lift, Videointerfon, Supraveghere video → elevators + monitoring, ca înainte',()=>{
  const out=attrs({amenities:['Interfon','Lift','Videointerfon','Supraveghere video']}).filter(a=>GROUPS.includes(a.urn.replace('urn:concept:','')));
  expect(out).toEqual([{urn:'urn:concept:project-amenities',value:'urn:concept:elevators'},{urn:'urn:concept:project-security',value:'urn:concept:monitoring'}]);
 });
 it('bifele vechi rămân bifate, fără dubluri; debifarea scoate și eticheta veche',()=>{
  const opt=(l:string)=>developmentAmenityGroups.flatMap(g=>g.options).find(o=>o.label===l)!;
  const saved=['Spații agrement','Piscină interioară','Piscină exterioară','Supraveghere video','Lift'];
  for(const l of ['Zonă de relaxare','Piscină','Serviciu de monitorizare / protecție','Lift'])expect(isAmenityChecked(saved,opt(l))).toBe(true);
  expect(toggleAmenity(saved,opt('Piscină'),true)).toEqual(saved);
  expect(toggleAmenity(saved,opt('Piscină'),false)).toEqual(['Spații agrement','Supraveghere video','Lift']);
  expect(storiaAmenityAttributes(saved).filter(a=>a.value==='urn:concept:swimming-pool')).toHaveLength(1);
 });
 it('paritate formular ↔ taxonomie pentru cele trei grupuri',()=>{
  const spec=taxonomy.data[0]!.attributes;
  for(const g of GROUPS){
   const tax=new Set((spec.find(a=>a.code===`urn:concept:${g}`)?.values??[]).map(v=>v.code));
   const form=new Set(developmentAmenityGroups.flatMap(x=>x.options).filter(o=>o.storia?.group===g).map(o=>`urn:concept:${o.storia!.value}`));
   expect([...form].filter(v=>!tax.has(v))).toEqual([]);expect([...tax].filter(v=>!form.has(v))).toEqual([]);
  }
 });
});
describe('B — atribute noi',()=>{
 it('nimic nou fără completare',()=>{const urns=attrs({}).map(a=>a.urn);for(const u of ['ceiling-height-from-cm','ceiling-height-to-cm','remote-services','net-area-m2','number-of-rooms','on-demand'])expect(urns).not.toContain(`urn:concept:${u}`);});
 it('valori corecte când sunt completate',()=>{
  const out=attrs({ceiling_height_from_cm:260,ceiling_height_to_cm:300,remote_services:true,net_area_m2:55.5,number_of_rooms:'3',on_demand:true});
  expect(out).toEqual(expect.arrayContaining([{urn:'urn:concept:ceiling-height-from-cm',value:'260'},{urn:'urn:concept:ceiling-height-to-cm',value:'300'},{urn:'urn:concept:remote-services',value:'urn:concept:yes'},{urn:'urn:concept:net-area-m2',value:'55.5'},{urn:'urn:concept:number-of-rooms',value:'urn:concept:3'},{urn:'urn:concept:on-demand',value:'urn:concept:yes'}]));
 });
 it('număr de camere „Mai multe”',()=>expect(attrs({number_of_rooms:'more'})).toContainEqual({urn:'urn:concept:number-of-rooms',value:'urn:concept:more'}));
 it('validarea înălțimilor',()=>{expect(ceilingHeightError(260,300)).toBeNull();expect(ceilingHeightError(300,300)).toBeNull();expect(ceilingHeightError(310,300)).toContain('cel mult');expect(ceilingHeightError(-1,null)).toContain('pozitiv');expect(ceilingHeightError(2.5,null)).toContain('întreg');});
});
describe('C — media',()=>{
 it('link valid trimis, nevalid omis cu avertisment',()=>{
  const warnings:string[]=[];
  const ok=mapInvestment({...base,video_url:'https://www.youtube.com/watch?v=abc123',virtual_tour_url:'https://bit.ly/x'} as Tables<'developments'>,{...input,warnings});
  expect(ok.movie_url).toBe('https://www.youtube.com/watch?v=abc123');expect(ok).not.toHaveProperty('virtual_walk');expect(warnings).toHaveLength(1);
 });
 it('planul ajunge în floor_plan și ultima în images, în limita de 40',()=>{
  const imgs=Array.from({length:45},(_,i)=>`https://e.test/${i}.jpg`);
  const p=mapInvestment(base,{...input,images:imgs,floorPlan:'https://e.test/plan.jpg'});
  expect(p.floor_plan).toBe('https://e.test/plan.jpg');expect(p.images).toHaveLength(40);expect(p.images.at(-1)).toEqual({url:'https://e.test/plan.jpg'});
 });
 it('coperta nu poate fi marcată',()=>{expect(canMarkFloorPlan({is_primary:true})).toBe(false);expect(canMarkFloorPlan({is_primary:false})).toBe(true);});
});
describe('D — restul payloadului',()=>{
 it('reference_id și auto_extend',()=>{
  const p=mapInvestment(base,input);expect(p.custom_fields).toEqual({id:`HBT-DEV-${base.id}`,reference_id:'ANS-0F1E2D3C'});expect(p.auto_extend).toBe(false);
  expect(mapInvestment({...base,storia_auto_extend:true} as Tables<'developments'>,input).auto_extend).toBe(true);
 });
 it('fără câmpuri noi: același payload ca înainte, în afară de reference_id',()=>{
  const p=mapInvestment({...base,amenities:['Lift']} as Tables<'developments'>,input);
  expect({...p,custom_fields:{id:p.custom_fields.id}}).toEqual({title:'MRM',description:'Descriere',category_urn:'urn:concept:investments',market:'primary',contact:input.contact,price:{value:100000,currency:'EUR'},location:{lat:44.4,lon:26.1,exact:true},images:[{url:'https://e.test/1.jpg'}],
   attributes:[{urn:'urn:concept:state',value:'urn:concept:in-construction'},{urn:'urn:concept:area-from',value:'45'},{urn:'urn:concept:area-to',value:'100'},{urn:'urn:concept:price-per-sq-meter-from',value:'1800'},{urn:'urn:concept:estate-type',value:'urn:concept:flats'},{urn:'urn:concept:hide-price',value:'urn:concept:no'},{urn:'urn:concept:total-number-of-properties-in-the-investment',value:'65'},{urn:'urn:concept:project-amenities',value:'urn:concept:elevators'}],
   site_urn:'urn:site:storiaro',custom_fields:{id:`HBT-DEV-${base.id}`},auto_extend:false});
 });
});
