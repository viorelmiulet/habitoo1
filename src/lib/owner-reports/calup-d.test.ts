import { describe,it,expect,vi } from 'vitest';
import { estimatePrice,priceAlert,type PriceSubject,type PriceComparable } from './price';
import { buildHomeActions,selectActions } from '@/lib/daily-brief/actions';
import { buildReportData,reportLines,previousMonth,templateNarrative } from './report';
import { composeNarrative,generateOwnerReport,sendOwnerReport,type GenerateDeps,type SendDeps } from './run.server';
import { buildOwnerReportPdf } from './pdf.server';
import { PDFDocument } from 'pdf-lib';

const now=new Date('2026-11-23T07:07:00Z');
const subject:PriceSubject={id:'p',type:'apartment',transaction:'sale',city:'București',area:60,rooms:2,currency:'EUR'};
const rows:PriceComparable[]=[80000,90000,100000,110000,120000].map((price,i)=>({...subject,id:`c${i}`,price,title:`Apartament ${i}`,source:'Habitoo',url:null}));
const estimate=estimatePrice(subject,rows);
const data=()=>buildReportData({week:previousMonth(now),property:{title:'Apartament',reference:null,price:120000,currency:'EUR',city:'București'},siteVisits:[],portalStats:[{portal:'storia',views:32}],publishedPortals:['storia'],leads:[{source:'storia'}],inboundMessages:1,viewings:[{status:'done',description:'Maria Client, maria@client.ro, 0722111111'}],acp:null,estimate,agent:{name:'Agent',phone:null,email:null},agency:{name:'Agenție',accent:null}});

describe('calup D — preț factual',()=>{
  it.each([0,1,2,3,4])('sub 5 comparabile (%i): nicio cifră de preț',n=>{
    const r=estimatePrice(subject,rows.slice(0,n));
    expect(r).toEqual({status:'insufficient',comparables:[],criteria:expect.any(Array)});
    expect(r).not.toHaveProperty('min');expect(r).not.toHaveProperty('max');expect(r).not.toHaveProperty('median');
  });
  it('5 comparabile: quartile 90000–110000 și mediană 100000, cu lista exactă',()=>{
    expect(estimate).toMatchObject({status:'ready',min:90000,max:110000,median:100000,currency:'EUR',comparables:rows});
  });
  it('exclude dubluri, anunțul însuși, Facebook, monede și orașe diferite',()=>{
    const r=estimatePrice(subject,[...rows.slice(0,4),rows[0] as PriceComparable,{...rows[0] as PriceComparable,id:'p'},{...rows[0] as PriceComparable,id:'fb',source:'Facebook'},{...rows[0] as PriceComparable,id:'ron',currency:'RON'},{...rows[0] as PriceComparable,id:'city',city:'Cluj'}]);
    expect(r.status).toBe('insufficient');
  });
  it('nu presupune suprafețe, monede sau tipuri lipsă',()=>{
    expect(estimatePrice({...subject,area:null},rows).status).toBe('insufficient');
    expect(estimatePrice(subject,rows.map(r=>({...r,currency:''}))).status).toBe('insufficient');
  });
  it('alerta strict peste 10%, nu exact 10%',()=>{
    expect(priceAlert(estimate,110000,'2026-10-01',[],now)).toBe(false);
    expect(priceAlert(estimate,110001,'2026-10-01',[],now)).toBe(true);
  });
  it('un lead la limita celor 30 zile suprimă alerta',()=>{
    const boundary=new Date(now.getTime()-30*86400000).toISOString();
    expect(priceAlert(estimate,120000,'2026-10-01',[boundary],now)).toBe(false);
    expect(priceAlert(estimate,120000,'2026-10-01',['2026-10-01'],now)).toBe(true);
  });
  it('publicare sub 30 zile, dată necunoscută sau comparabile insuficiente: fără alertă',()=>{
    expect(priceAlert(estimate,120000,'2026-11-01',[],now)).toBe(false);
    expect(priceAlert(estimate,120000,null,[],now)).toBe(false);
    expect(priceAlert(estimatePrice(subject,[]),120000,'2026-10-01',[],now)).toBe(false);
  });
  it('Top acțiuni: alertă numai cu date verificate și accesul agentului',()=>{
    const base={now,scope:'u',leads:[],requests:[],activities:[],events:[],properties:[{id:'p',title:'Apartament',price:120000,assigned_to:'u',created_at:'2026-10-01',status:'active'}],matches:[],checks:[],listings:[{property_id:'p',status:'published',published_at:'2026-10-01'}],contracts:[],proposals:[],map:[]};
    expect(buildHomeActions(base).some(a=>a.kind==='price_review')).toBe(false);
    const actions=buildHomeActions({...base,priceEstimates:[{propertyId:'p',estimate,leadDates:[]}]});
    expect(selectActions(actions,[],now)).toMatchObject([{kind:'price_review',search:{tab:'acp'}}]);
    expect(buildHomeActions({...base,scope:'other',priceEstimates:[{propertyId:'p',estimate,leadDates:[]}]})).toEqual([]);
  });
});
describe('calup D — raport',()=>{
  it('luna anterioară, inclusiv anul nou',()=>{
    expect(previousMonth(now)).toEqual({start:'2026-10-01',end:'2026-10-31'});
    expect(previousMonth(new Date('2027-01-05T10:00:00Z'))).toEqual({start:'2026-12-01',end:'2026-12-31'});
  });
  it('raportul conține comparabile și doar feedback agregat, fără datele clientului',()=>{
    const d=data();expect(JSON.stringify(d)).not.toMatch(/Maria|maria@|0722111111/);
    expect(d.viewings.feedback).toBe(1);expect(d.acp).toMatchObject({min:90000,max:110000});
    expect(reportLines(d).some(l=>l.label.startsWith('Comparabile'))).toBe(true);
  });
  it('zero vizualizări confirmate rămân zero, absența datelor nu este zero',()=>{
    const d=data();
    expect(buildReportData({week:d.week,property:d.property,siteVisits:[],portalStats:[{portal:'storia',views:0}],publishedPortals:[],leads:[],inboundMessages:0,viewings:[],acp:null,agent:d.agent,agency:d.agency}).views).toMatchObject({total:0});
  });
  it('estimarea veche fără 5 comparabile nu ajunge în raport',()=>{
    const d=data();const raw={...d,acp:{estimated_min:1,estimated_max:999999},estimate:estimatePrice(subject,rows.slice(0,4)),siteVisits:[],portalStats:[],publishedPortals:[],inboundMessages:0,leads:[],viewings:[]};
    const r=buildReportData(raw);expect(r.acp).toBeNull();expect(reportLines(r).some(l=>l.value==='Date insuficiente')).toBe(true);
  });
  it('fără AI: nu există apel, taxare sau creare de raport',async()=>{
    const claim=vi.fn();const provider={generate:vi.fn()};
    const result=await generateOwnerReport({isFeatureEnabled:async()=>false,claim,provider} as unknown as GenerateDeps,{property_id:'p',organization_id:'o',auto_send:false},previousMonth(now));
    expect(result).toBe('skipped');expect(claim).not.toHaveBeenCalled();expect(provider.generate).not.toHaveBeenCalled();
  });
  it('AI primește numai agregate și răspunsul invalid revine la textul sigur',async()=>{
    const generate=vi.fn(async()=>({text:JSON.stringify({intro:'99 clienți',conclusion:'x',recommendation:'y'})}));
    const result=await composeNarrative({isFeatureEnabled:async()=>true,creditsBlocked:async()=>null,withCredits:async(_a,run)=>run(),provider:{generate} as never},data(),{forbiddenNames:['Maria Client'],feedbackNotes:['Maria Client maria@client.ro 0722111111']},{organizationId:'o',userId:'u'});
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(/Maria|maria@|0722111111/);
    expect(result.isAi).toBe(false);expect(result.narrative).toEqual(templateNarrative(data()));
  });
  it('cron/absence de agent nu poate trimite, nici dacă era auto activat',async()=>{
    const lockDraft=vi.fn();const deps={lockDraft} as unknown as SendDeps;
    expect((await sendOwnerReport(deps,'r',{userId:null,via:'auto'})).ok).toBe(false);
    expect((await sendOwnerReport(deps,'r',{userId:null,via:'email'})).ok).toBe(false);
    expect(lockDraft).not.toHaveBeenCalled();
  });
  it('generarea produce numai o ciornă, chiar pentru vechea opțiune auto_send',async()=>{
    const finalize=vi.fn();
    const deps={isFeatureEnabled:async()=>true,claim:async()=> 'r',loadRaw:async()=>({raw:{week:previousMonth(now),property:data().property,siteVisits:[],portalStats:[],publishedPortals:[],leads:[],inboundMessages:0,viewings:[],acp:null,estimate,agent:data().agent,agency:data().agency},forbiddenNames:[],feedbackNotes:[],ownerContactId:'c',agentId:'u',logo:null}),creditsBlocked:async()=>null,provider:null,renderPdf:async()=>new Uint8Array([1]),savePdf:async()=> 'r.pdf',finalize,release:vi.fn(),notify:vi.fn()} as unknown as GenerateDeps;
    expect(await generateOwnerReport(deps,{property_id:'p',organization_id:'o',auto_send:true},previousMonth(now))).toBe('created');
    expect(finalize).toHaveBeenCalledWith('r',expect.objectContaining({auto_send:false,pdf_path:'r.pdf'}));
    expect(finalize.mock.calls[0]?.[1]).not.toHaveProperty('sent_at');
  });
  it('PDF real generat cu paginare și fără emailuri ale clienților în date',async()=>{
    const d=data();const bytes=await buildOwnerReportPdf(d,templateNarrative(d),null);
    const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(pdf.getTitle()).toBe('Raport pentru proprietar — Apartament');
  });
});