import {beforeEach,it,expect,vi} from "vitest";
import {listPartnerPortals,generatePartnerApiKey,revokePartnerApiKey,savePartnerPortal} from "@/lib/partner-api/admin.functions";
vi.mock("@tanstack/react-start",async(original)=>({...await original<typeof import("@tanstack/react-start")>(),createServerFn:()=>{const builder={middleware:()=>builder,inputValidator:()=>builder,handler:(fn:unknown)=>fn};return builder;}}));
vi.mock("@/integrations/supabase/auth-middleware",()=>({requireSupabaseAuth:{}}));
type Row=Record<string,unknown>;let allowed=true;const queries:{table:string;projection:string;filters:[string,unknown][]}[]=[];let insert:Row|null;let insertError:Row|null;
const db={rpc:async()=>({data:allowed,error:null}),from:(table:string)=>{let projection="";let inserting=false;const filters:[string,unknown][]=[];
 const q={select:(s:string)=>{projection=s;return q;},order:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q;},insert:(row:Row)=>{insert=row;inserting=true;return q;},update:()=>q,single:async()=>({data:table==="dynamic_feed_portals"?{active:true,integration_mode:"api"}:{id:"example"},error:null}),then:(fn:(r:unknown)=>unknown)=>{queries.push({table,projection,filters});const data=table==="dynamic_feed_portals"?[{slug:"example",display_name:"Example",key_prefix:"hbex_",website:"https://example.org",logo_path:null,xml_enabled:false,active:true,show_public:false,integration_mode:"api",rate_limit_per_minute:120}]:[{id:"example-key",portal:"example",prefix:"hbpk_live_",last4:"abcd",environment:"live",status:"active",created_at:"2026-11-07",last_used_at:null}];return Promise.resolve({data,error:inserting?insertError:null}).then(fn);}};return q;}};
const invoke=(fn:unknown,data?:unknown)=>(fn as (input:unknown)=>Promise<unknown>)({context:{supabase:db,userId:"22222222-2222-4222-8222-222222222222"},data});
const newPortal={editing:false,slug:"nou-ro",display_name:"Portal Nou",website:"https://portal.example",logo_path:null,xml_enabled:false,show_public:false,integration_mode:"api",rate_limit_per_minute:120,active:true};
beforeEach(()=>{allowed=true;queries.length=0;insert=null;insertError=null;vi.restoreAllMocks();});
it("administration lists project only safe metadata, never hash or key",async()=>{const result=await invoke(listPartnerPortals);const query=queries.find(q=>q.table==="portal_index_keys");expect(query?.projection.split(",")).toEqual(["id","portal","prefix","last4","environment","status","created_at","last_used_at"]);expect(query?.filters).toContainEqual(["key_type","api"]);expect(JSON.stringify(result)).not.toContain("key_hash");});
it("generating a key returns it once but persists only SHA-256 and metadata",async()=>{const result=await invoke(generatePartnerApiKey,{portal:"example",environment:"live"}) as {key:string};expect(result.key).toMatch(/^hbpk_live_[a-f0-9]{64}$/);expect(insert).toMatchObject({portal:"example",key_type:"api",environment:"live",prefix:"hbpk_live_"});expect(JSON.stringify(insert)).not.toContain(result.key);expect(insert?.key_hash).toMatch(/^[a-f0-9]{64}$/);});
it("non-superadmin cannot list, create, edit, generate or revoke",async()=>{allowed=false;for(const fn of [listPartnerPortals,generatePartnerApiKey,revokePartnerApiKey,savePartnerPortal])await expect(invoke(fn,{})).rejects.toThrow("Acces refuzat.");expect(queries).toHaveLength(0);expect(insert).toBeNull();});
it("crearea unui portal API nou reușește fără a modifica un portal existent",async()=>{
  expect(await invoke(savePartnerPortal,newPortal)).toEqual({ok:true});
  expect(insert).toMatchObject({slug:"nou-ro",display_name:"Portal Nou",integration_mode:"api",key_prefix:"hbno_",created_by:"22222222-2222-4222-8222-222222222222"});
});
it("23505 păstrează mesajul de identificator existent",async()=>{
  insertError={code:"23505",message:"duplicate key value"};
  await expect(invoke(savePartnerPortal,newPortal)).rejects.toThrow("Identificatorul există deja.");
});
it("lipsa sandboxului are mesaj dedicat, iar jurnalul păstrează codul și motivul DB",async()=>{
  insertError={code:"P0001",message:"Sandbox not provisioned"};
  const log=vi.spyOn(console,"error").mockImplementation(()=>undefined);
  await expect(invoke(savePartnerPortal,newPortal)).rejects.toThrow("Agenția demo a Partner API lipsește.");
  expect(log).toHaveBeenCalledWith("[partner-api/savePartnerPortal] DB error",{code:"P0001",message:"Sandbox not provisioned"});
});
it("orice alt motiv DB este afișat și jurnalizat nemodificat",async()=>{
  insertError={code:"42501",message:"Regulă SQL refuzată"};
  const log=vi.spyOn(console,"error").mockImplementation(()=>undefined);
  await expect(invoke(savePartnerPortal,newPortal)).rejects.toThrow("Regulă SQL refuzată");
  expect(log).toHaveBeenCalledWith("[partner-api/savePartnerPortal] DB error",{code:"42501",message:"Regulă SQL refuzată"});
});
