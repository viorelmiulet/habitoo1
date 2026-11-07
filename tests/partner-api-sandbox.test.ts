import {beforeEach,describe,expect,it,vi} from "vitest";
import {handleSandbox,sandboxWriteStore} from "@/lib/partner-api/sandbox.server";
import {SANDBOX_AGENCY_ID,sandboxAgents,sandboxListings} from "@/lib/partner-api/sandbox";
import {handleAgencies,handleAgents,handleListings,supabaseReadStore} from "@/lib/partner-api/read.server";
import {handlePartnerWrite} from "@/lib/partner-api/write.server";
import type {PartnerContext} from "@/lib/partner-api/core.server";
const state=vi.hoisted(()=>({tables:{} as Record<string,Record<string,unknown>[]>,calls:[] as string[]}));
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:{
  from:(table:string)=>{
    state.calls.push(table);const filters:((r:Record<string,unknown>)=>boolean)[]=[];
    const data=()=> (state.tables[table]??[]).filter(r=>filters.every(f=>f(r)));
    const q={select:()=>q,eq:(k:string,v:unknown)=>{filters.push(r=>r[k]===v);return q;},in:(k:string,v:unknown[])=>{filters.push(r=>v.includes(r[k]));return q;},is:(k:string,v:unknown)=>{filters.push(r=>(r[k]??null)===v);return q;},gt:()=>q,or:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:data()[0]??null,error:null}),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({data:data(),error:null}).then(resolve)};return q;
  },rpc:async(name:string)=>{state.calls.push(name);return {data:{id:"a7b50000-0000-4000-8000-000000000777",test:true,deduplicated:false},error:null};}
}}));
const ctx=(environment:"live"|"test"="test"):PartnerContext=>({identity:{id:"a7b50000-0000-4000-8000-000000000900",portal:"example",environment,prefix:`hbpk_${environment}_`,key_hash:"a".repeat(64),status:"active"},portal:{slug:"example",active:true,display_name:"Example",integration_mode:"api",rate_limit_per_minute:120},requestId:"a7b50000-0000-4000-8000-000000000901"});
const real="a7b50000-0000-4000-8000-000000000999";
beforeEach(()=>{
  state.calls=[];state.tables={partner_api_agency_state:[{organization_id:SANDBOX_AGENCY_ID,active:true,activated_at:null},{organization_id:real,active:true,activated_at:null}],partner_api_test_agencies:[{organization_id:SANDBOX_AGENCY_ID}],organizations:[{id:SANDBOX_AGENCY_ID,name:"Agenția Demo Habitoo",is_demo:true},{id:real,name:"Real",is_demo:false}],partner_api_listing_state:sandboxListings({apartment:"https://example.invalid/apartment.jpg",house:"https://example.invalid/house.jpg",land:"https://example.invalid/land.jpg"}).map(payload=>({portal:"example",property_id:payload.id,organization_id:SANDBOX_AGENCY_ID,visible:true,payload,updated_at:"2026-11-07T00:00:00Z",withdrawn_at:null})),partner_api_agent_state:sandboxAgents.map(payload=>({portal:"example",organization_id:SANDBOX_AGENCY_ID,payload}))};
});
describe("P5 sandbox",()=>{
  it("test sees only demo agency, 12 listings and 2 agents",async()=>{
    const store=await supabaseReadStore();
    expect((await (await handleAgencies(ctx(),store)).json()).data.map((x:{id:string})=>x.id)).toEqual([SANDBOX_AGENCY_ID]);
    expect((await (await handleListings(ctx(),store,new URL("https://example.invalid/listings"))).json()).data).toHaveLength(12);
    expect((await (await handleAgents(ctx(),store,new URL("https://example.invalid/agents"))).json()).data).toHaveLength(2);
  });
  it("live never sees demo",async()=>{
    const store=await supabaseReadStore();expect((await store.scope("example","live")).known).toEqual([real]);
    expect((await (await handleListings(ctx("live"),store,new URL("https://example.invalid/listings"))).json()).data).toEqual([]);
  });
  it("test lead never reaches CRM ingestion, email claim or real notifications",async()=>{
    const read=await supabaseReadStore(),store=await sandboxWriteStore(read);
    const response=await handlePartnerWrite(ctx(),store,"lead",{external_id:"test-1",agency_id:SANDBOX_AGENCY_ID,name:"Test",email:"demo@example.invalid"});
    expect(response.status).toBe(201);expect(await response.json()).toMatchObject({test:true,label:"Test"});
    expect(state.calls).toContain("partner_api_sandbox_write");
    expect(state.calls).not.toContain("leads");expect(state.calls).not.toContain("notifications");expect(state.calls).not.toContain("partner_api_email_claim");
  });
  it("live simulate is 403 with no mutation",async()=>{
    const run=vi.fn();expect((await handleSandbox(ctx("live"),"simulate",{action:"listing_update"},run)).status).toBe(403);expect(run).not.toHaveBeenCalled();
  });
  it("fictitious fixtures cover property types, transactions, currencies and address privacy",()=>{
    const rows=sandboxListings({apartment:"a",house:"h",land:"l"});expect(rows).toHaveLength(12);
    expect(new Set(rows.map(r=>r.property_type))).toEqual(new Set(["apartment","studio","house","villa","land","commercial","office"]));
    expect(new Set(rows.flatMap(r=>r.offers.map(o=>o.type)))).toEqual(new Set(["sale","rent"]));
    expect(new Set(rows.flatMap(r=>r.offers.map(o=>o.currency)))).toEqual(new Set(["EUR","RON"]));
    expect(rows.filter(r=>!r.location.is_precise).every(r=>r.location.street===null&&r.location.street_number===null)).toBe(true);
  });
});