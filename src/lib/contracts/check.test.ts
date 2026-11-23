import { describe,it,expect } from 'vitest';
import { compareContractValues,checkContractBody } from './check';
import { checkContractSources } from './check.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
describe('verificarea contractului',()=>{
  it('afişează doar câmpul nepotrivit, fără CNP/CUI sau modificări',()=>{
    const values=[{field:'cnp',label:'CNP/CUI',contract:'1960520123456',reference:'1960520654321',source:'act scanat'}];const before=JSON.stringify(values);
    const issues=compareContractValues(values);expect(issues).toMatchObject([{field:'cnp',kind:'mismatch'}]);
    expect(JSON.stringify(issues)).not.toContain('1960520');expect(JSON.stringify(values)).toBe(before);
  });
  it('preț, suprafață, adresă și comision se compară exact cu sursa',()=>{
    const issues=compareContractValues([{field:'price',label:'Preț',contract:100000,reference:110000,source:'proprietate'},{field:'area',label:'Suprafață',contract:60,reference:61,source:'proprietate'},{field:'address',label:'Adresă',contract:'Strada A',reference:'Strada B',source:'proprietate'},{field:'commission',label:'Comision',contract:'3%',reference:'2%',source:'proprietate'}]);
    expect(issues.map(i=>i.field)).toEqual(['price','area','address','commission']);
  });
  it('câmp gol distinct de sursă indisponibilă',()=>{
    expect(compareContractValues([{field:'name',label:'Nume',contract:'',reference:'Ion',source:'contact'}])[0]?.kind).toBe('missing');
    expect(compareContractValues([{field:'name',label:'Nume',contract:'Ion',reference:null,source:'contact'}])[0]?.kind).toBe('unavailable');
  });
  it('diacritice/case nu creează nepotrivire; nu inventează date',()=>{
    expect(compareContractValues([{field:'name',label:'Nume',contract:'Ștefan Ion',reference:'stefan ion',source:'contact'}])).toEqual([]);
  });
  it('modificarea manuală a textului este semnalată față de metadate',()=>{
    expect(checkContractBody('Preț 90.000 EUR',[{field:'price',label:'Preț',value:100000}])).toMatchObject([{field:'price',kind:'mismatch'}]);
    expect(checkContractBody('Preț 100.000 EUR',[{field:'price',label:'Preț',value:100000}])).toEqual([]);
    expect(checkContractBody('CNP lipsă',[{field:'cnp',label:'CNP',value:'1960520123456'}])[0]?.message).not.toContain('1960520');
  });
  it('citire read-only: fără acces la identitate nu decriptează sau citește actul',async()=>{
    const calls:string[]=[];
    const db={rpc:async()=>({data:false,error:null}),from:(table:string)=>{calls.push(table);const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:()=>q,then:(resolve:(v:unknown)=>void)=>resolve({data:table==='contract_parties'?[{id:'party',contact_id:'contact',full_name:'Ion',address:'A',cnp_enc:'not-decryptable'}]:table==='contacts'?{first_name:'Ion',last_name:'',company:null}:table==='properties'?{price:110000,currency:'EUR',address:'A',city:'București',county:'București',surface:60,usable_surface:60,commission:'3%'}:table==='organizations'?{cui:'1234'}:null,error:null})};return q;}} as unknown as SupabaseClient<Database>;
    const c={id:'contract',organization_id:'org',property_id:'property',price:100000,currency:'EUR',commission:'3%',kind:'commission',body:'Ion, 100000 EUR, 3%, CUI 1234, suprafata 60',data:{fields:{propertyAddress:'A'},agency:{cui:'1234'}}} as unknown as Database['public']['Tables']['contracts']['Row'];
    const before=JSON.stringify(c);const result=await checkContractSources(db,c);
    expect(result.issues).toMatchObject(expect.arrayContaining([{field:'identity:party',source:'act scanat',kind:'unavailable',message:'Identitatea din act nu este accesibilă.'}]));
    expect(result.issues.some(i=>i.field==='price' && i.kind==='mismatch')).toBe(true);
    expect(calls).not.toContain('contact_identities');expect(JSON.stringify(c)).toBe(before);expect(JSON.stringify(result)).not.toContain('not-decryptable');
  });
});