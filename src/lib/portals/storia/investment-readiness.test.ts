import { expect, it } from 'vitest';
import type { Tables } from '@/integrations/supabase/types';
import taxonomy from './reference/investments-taxonomy.json';
import { mapInvestment } from './investment';
import { investmentPrice, investmentRequiredLabels, missingInvestmentFields } from './investment-readiness';

const d = {id:'0f1e2d3c-aaaa-bbbb-cccc-1234567890ab',name:'MRM',description:'Descriere',construction_stage:'În construcție',area_from:45,area_to:100,price_per_sqm_from:1800,estate_type:'flats',total_units:65,lat:44.4,lng:26.1,amenities:['Lift'],location_precise:true,storia_hide_price:false} as Tables<'developments'>;
const input = { images:['https://e.test/1.jpg'], contact:{name:'A',email:'a@e.test'}, price:100000, currency:'EUR' };
const readiness = {imageCount:1,email:input.contact.email,price:input.price,currency:input.currency};

it('listează exact cele patru lipsuri și mapperul le raportează într-o singură eroare', () => {
  const incomplete = {...d,description:null,area_from:null,area_to:null,price_per_sqm_from:null};
  const missing = ['Descriere','Suprafață minimă (m²)','Suprafață maximă (m²)','Preț minim pe m²'];
  expect(missingInvestmentFields(incomplete,readiness)).toEqual(missing);
  expect(() => mapInvestment(incomplete,input)).toThrow(`Completează: ${missing.join(', ')}.`);
});

it('ansamblu complet, inclusiv MRM de trei caractere: listă goală și payload identic', () => {
  expect(missingInvestmentFields(d,readiness)).toEqual([]);
  expect(mapInvestment(d,input)).toEqual({title:'MRM',description:'Descriere',category_urn:'urn:concept:investments',market:'primary',contact:input.contact,price:{value:100000,currency:'EUR'},location:{lat:44.4,lon:26.1,exact:true},images:[{url:'https://e.test/1.jpg'}],
    attributes:[{urn:'urn:concept:state',value:'urn:concept:in-construction'},{urn:'urn:concept:area-from',value:'45'},{urn:'urn:concept:area-to',value:'100'},{urn:'urn:concept:price-per-sq-meter-from',value:'1800'},{urn:'urn:concept:estate-type',value:'urn:concept:flats'},{urn:'urn:concept:hide-price',value:'urn:concept:no'},{urn:'urn:concept:total-number-of-properties-in-the-investment',value:'65'},{urn:'urn:concept:project-amenities',value:'urn:concept:elevators'}],
    site_urn:'urn:site:storiaro',custom_fields:{id:`HBT-DEV-${d.id}`,reference_id:'ANS-0F1E2D3C'},auto_extend:false});
});

it('fiecare atribut obligatoriu din taxonomie are eticheta română a formularului', () => {
  const expected = {'urn:concept:state':'Stadiu construcție','urn:concept:area-from':'Suprafață minimă (m²)','urn:concept:area-to':'Suprafață maximă (m²)','urn:concept:price-per-sq-meter-from':'Preț minim pe m²','urn:concept:estate-type':'Tip unități','urn:concept:total-number-of-properties-in-the-investment':'Număr total unități'};
  expect(investmentRequiredLabels).toEqual(expected);
  expect(taxonomy.data[0]?.attributes.filter(a=>a.mandatory).map(a=>a.code).sort()).toEqual(Object.keys(expected).sort());
});

it('toate lipsurile generale și obligatorii sunt raportate separat', () => {
  expect(missingInvestmentFields({...d,name:'',description:' ',lat:null,construction_stage:null,area_from:null,area_to:null,price_per_sqm_from:null,estate_type:null,total_units:null},{imageCount:0,email:null,price:null,currency:'USD'})).toEqual([
    'Nume ansamblu','Descriere','Poziția pe hartă','Fotografie','Preț (din unitățile de vânzare sau «Preț minim — suprascriere»)','Monedă EUR sau RON','Emailul agentului','Stadiu construcție','Suprafață minimă (m²)','Suprafață maximă (m²)','Preț minim pe m²','Tip unități','Număr total unități',
  ]);
});

it('păstrează verificările existente fără limite numerice sau validări email noi', () => {
  expect(missingInvestmentFields({...d,area_from:0,total_units:0},{...readiness,price:-1,email:'x'})).toEqual([]);
});

it('prețul folosește unitățile active de vânzare în aceeași monedă, sau suprascrierea', () => {
  const unit: Parameters<typeof investmentPrice>[1][number] = {sale_price:120000,sale_currency:'EUR',currency:'RON',for_sale:true,status:'active'};
  const units: Parameters<typeof investmentPrice>[1] = [unit,{...unit,sale_price:100000},{...unit,sale_price:1,status:'sold'},{...unit,sale_price:2,for_sale:false}];
  expect(investmentPrice({...d,price_from:null},units)).toEqual({price:100000,currency:'EUR'});
  expect(investmentPrice({...d,price_from:90000,currency:'RON'},units)).toEqual({price:90000,currency:'RON'});
  expect(investmentPrice({...d,price_from:null},[unit,{...unit,sale_currency:'RON'}]).price).toBeNull();
});