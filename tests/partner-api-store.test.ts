import {beforeEach,it,expect,vi} from "vitest";
import {partnerStore} from "@/lib/partner-api/store.server";
type Row=Record<string,unknown>;
const rows:Record<string,Row[]>={};const calls:{table:string;columns:string;filters:[string,string,unknown][]}[]=[];
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:{from:(table:string)=>{
 const filters:[string,string,unknown][]=[];let columns="";
 const value=(r:Row,key:string)=>key.startsWith("organizations.")?(r.organizations as Row)?.[key.slice(14)]:r[key];
 const selected=()=> (rows[table]??[]).filter(r=>filters.every(([op,k,v])=>op==="eq"?value(r,k)===v:op==="is"?value(r,k)===v:op==="in"?(v as unknown[]).includes(value(r,k)):op==="not"?!(v as string).slice(1,-1).split(",").includes(String(value(r,k))):true));
 const result=()=>{calls.push({table,columns,filters});return {data:selected(),count:selected().length,error:null};};
 const q={select:(s:string)=>{columns=s;return q;},eq:(k:string,v:unknown)=>{filters.push(["eq",k,v]);return q;},is:(k:string,v:unknown)=>{filters.push(["is",k,v]);return q;},in:(k:string,v:unknown)=>{filters.push(["in",k,v]);return q;},not:(k:string,_op:string,v:unknown)=>{filters.push(["not",k,v]);return q;},maybeSingle:async()=>({...result(),data:selected()[0]??null}),then:(fn:(r:unknown)=>unknown)=>Promise.resolve(result()).then(fn)};return q;
}}}));
beforeEach(()=>{for(const k of Object.keys(rows))delete rows[k];calls.length=0;rows.partner_api_test_agencies=[{organization_id:"test-agency"}];rows.portal_connections=[
 {portal:"example",activated:true,organization_id:"test-agency",organizations:{id:"test-agency",is_demo:true,archived_at:null}},
 {portal:"example",activated:true,organization_id:"real-agency",organizations:{id:"real-agency",is_demo:false,archived_at:null}},
 {portal:"example",activated:false,organization_id:"not-active",organizations:{id:"not-active",is_demo:false,archived_at:null}},
 {portal:"other",activated:true,organization_id:"other-portal",organizations:{id:"other-portal",is_demo:false,archived_at:null}},
 {portal:"example",activated:true,organization_id:"archived",organizations:{id:"archived",is_demo:false,archived_at:"2026-11-01"}},
 {portal:"example",activated:true,organization_id:"old-demo",organizations:{id:"old-demo",is_demo:true,archived_at:null}},
];});
it("live scope counts only activated real agencies for this portal",async()=>{expect(await (await partnerStore()).countAgencies("example","live")).toBe(1);});
it("test scope counts only explicitly allowlisted activated agencies, not old demos",async()=>{expect(await (await partnerStore()).countAgencies("example","test")).toBe(1);});
it("test environment stays empty until P5 allowlist exists",async()=>{rows.partner_api_test_agencies=[];expect(await (await partnerStore()).countAgencies("example","test")).toBe(0);});
it("API authentication lookup excludes all existing index keys",async()=>{rows.portal_index_keys=[{id:"index",key_hash:"hash",key_type:"index"},{id:"api",key_hash:"hash",key_type:"api"}];expect((await (await partnerStore()).key("hash"))?.id).toBe("api");expect(calls[0].filters).toContainEqual(["eq","key_type","api"]);});