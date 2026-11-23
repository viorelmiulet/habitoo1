import { describe,it,expect,vi } from 'vitest';
import { approachSentences,validateApproach } from '../approach';
import { generateApproach } from '../approach.server';
import { duplicateMatch,perceptualHash,hashDistance,groupPossibleDuplicates,type DuplicateOffer } from '../property-duplicates';
import { allowedDuplicateImage,findPropertyDuplicates } from '../property-duplicates.server';
import jpeg from 'jpeg-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
const offer:DuplicateOffer={id:'a',title:'Apartament',source:'MAP',href:null,city:'București',address:null,lat:null,lng:null,area:60,floor:3,hashes:['0123456789abcdef']};
describe('ciornă de abordare',()=>{
  const allowed=approachSentences({title:'Apartament',city:'București',area:60,rooms:2,price:100000,currency:'EUR'},'Agent','Agenție');
  it('primește numai faptele anunțului, fără servicii sau cifre inventate',()=>{
    expect(allowed.join(' ')).toContain('60 m²');expect(allowed.join(' ')).toContain('100000 EUR');
    expect(validateApproach({sentences:[allowed[0],allowed[1], 'Am 50 de cumpărători pentru dvs.']},allowed)).toBeNull();
  });
  it('ciorna AI validă nu trimite și nu salvează nimic',async()=>{
    const generate=vi.fn(async()=>({text:JSON.stringify({sentences:allowed}),inputTokens:10,outputTokens:20}));
    const result=await generateApproach({generate} as never,allowed);
    expect(result.text).toBe(allowed.join('\n\n'));expect(generate).toHaveBeenCalledOnce();
    expect(Object.keys(result)).toEqual(['text','generated']);
  });
  it('răspuns invalid sau câmpuri suplimentare sunt respinse',async()=>{
    await expect(generateApproach({generate:async()=>({text:'not json'})} as never,allowed)).rejects.toThrow();
    expect(validateApproach({sentences:allowed,send:true},allowed)).toBeNull();
  });
  it('date lipsă nu primesc valori inventate',()=>{
    const list=approachSentences({title:null,city:null,area:null,rooms:null,price:null,currency:null},'Agent','Agenție');
    expect(list.join(' ')).not.toMatch(/\d/);
  });
});
describe('posibile duplicate',()=>{
  it('fotografie/suprafață/etaj: încredere ridicată, fără unire sau mutație',()=>{
    const b={...offer,id:'b'};const before=JSON.stringify([offer,b]);
    const result=groupPossibleDuplicates([offer,b]);
    expect(result[0]?.members[0]).toMatchObject({score:75,confidence:'high'});
    expect(JSON.stringify([offer,b])).toBe(before);
  });
  it('adresă sau coordonate + suprafață + etaj: încredere medie și motive',()=>{
    const a={...offer,address:'Strada Exemplu 10',hashes:[]};
    expect(duplicateMatch(a,{...a,id:'b'})).toMatchObject({score:45,confidence:'medium',reasons:['Aceeași adresă','Suprafață cu diferență de cel mult 5%','Același etaj']});
    const coords={...offer,hashes:[],lat:44.4,lng:26.1};
    expect(duplicateMatch(coords,{...coords,id:'b',lat:44.4001})).toMatchObject({confidence:'medium'});
  });
  it('etaj, oraș sau suprafață diferite: fără potrivire, chiar cu aceeași poză',()=>{
    expect(duplicateMatch(offer,{...offer,id:'b',floor:4})).toBeNull();
    expect(duplicateMatch(offer,{...offer,id:'b',city:'Cluj'})).toBeNull();
    expect(duplicateMatch(offer,{...offer,id:'b',area:90})).toBeNull();
  });
  it('fără date solide sau poză uniformă nu inventează duplicate',()=>{
    expect(duplicateMatch({...offer,hashes:[]},{...offer,id:'b',hashes:[]})).toBeNull();
    expect(duplicateMatch({...offer,hashes:['0000000000000000']},{...offer,id:'b',hashes:['0000000000000000']})).toBeNull();
  });
  it('hash perceptual RGBA și distanță Hamming exactă',()=>{
    const pixels=new Uint8Array(9*8*4);for(let y=0;y<8;y++)for(let x=0;x<9;x++){const at=(y*9+x)*4;pixels[at]=(8-x)*25;pixels[at+1]=(8-x)*25;pixels[at+2]=(8-x)*25;pixels[at+3]=255;}
    expect(perceptualHash(pixels,9,8)).toBe('ffffffffffffffff');
    expect(hashDistance('0123456789abcdef','0123456789abcdee')).toBe(1);
    expect(hashDistance('bad','bad')).toBe(64);
  });
  it('nicio descărcare către host arbitrar, local sau URL cu credențiale',()=>{
    expect(allowedDuplicateImage('https://images.olxcdn.com/1.jpg','storage.example')).toBe(true);
    expect(allowedDuplicateImage('https://127.0.0.1/1.jpg','storage.example')).toBe(false);
    expect(allowedDuplicateImage('https://user:secret@images.olxcdn.com/1.jpg','storage.example')).toBe(false);
    expect(allowedDuplicateImage('https://olxcdn.com.attacker.test/a.jpg','storage.example')).toBe(false);
  });
  it('anunțuri MAP reale simulate: decodează JPEG și compară pozele fără scrieri',async()=>{
    const pixels=new Uint8Array(72*64*4);
    for(let y=0;y<64;y++)for(let x=0;x<72;x++){const at=(y*72+x)*4;const v=Math.round((Math.sin(x/8+y/20)+1)*100);pixels[at]=v;pixels[at+1]=v;pixels[at+2]=v;pixels[at+3]=255;}
    const photo=jpeg.encode({data:pixels,width:72,height:64},90).data;
    const fetchMock=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(new Uint8Array(photo),{headers:{'content-type':'image/jpeg'}}));vi.stubGlobal('fetch',fetchMock);
    const rows=[{id:'a',title:'Anunț A',city:'București',surface:60,floor_num:3,source:'storia',url:'https://storia.ro/a',images:['https://images.storia.ro/a.jpg']},{id:'b',title:'Anunț B',city:'București',surface:60,floor_num:3,source:'olx',url:'https://olx.ro/b',images:['https://images.olxcdn.com/b.jpg']}];
    const calls:{table:string;op:string;args:unknown[]}[]=[];
    const db={from:(table:string)=>{let single=false;let list=table==='listings'?rows:[];const q:Record<string,unknown>={};for(const op of ['select','eq','is','order','range'])q[op]=(...args:unknown[])=>{calls.push({table,op,args});if(op==='eq' && args[0]==='id')list=list.filter(r=>r.id===args[1]);return q;};q['maybeSingle']=()=>{single=true;return q;};q['then']=(resolve:(r:unknown)=>void)=>resolve({data:single?list[0]??null:list,error:null});return q;}} as unknown as SupabaseClient<Database>;
    try{
      const result=await findPropertyDuplicates(db,'org','agent','map','a');
      expect(result.matches[0]).toMatchObject({score:75,confidence:'high',offer:{id:'map:b'}});
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({redirect:'manual'});
      expect(calls).toContainEqual({table:'properties',op:'eq',args:['assigned_to','agent']});
      expect(calls.every(c=>!['update','insert','delete'].includes(c.op))).toBe(true);
    }finally{vi.unstubAllGlobals();}
  });
});