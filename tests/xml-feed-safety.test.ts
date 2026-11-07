import { beforeEach, describe, expect, it, vi } from "vitest";
import { XMLParser } from "fast-xml-parser";
import type { FeedAuthOk } from "@/lib/site-feed/auth.server";
import { createHash } from "node:crypto";
import { clickimobFeedToken } from "@/lib/portals/clickimob/index-feed";
import { properstarEntityId } from "@/lib/portals/properstar/mapper";

const state = vi.hoisted(() => ({tableError: "", missingAgency: false, noPhone: false, authError: false, rows: 1}));
const ORG = "11111111-1111-4111-8111-111111111111";
const PROPERTY = "22222222-2222-4222-8222-222222222222";
const AGENT = "33333333-3333-4333-8333-333333333333";
const KEY = "hbxx_EXEMPLU_INDEX_FICTIV";
process.env["BAZARULDECASE_INDEX_KEY"] = KEY;
vi.mock("@/integrations/supabase/client.server", () => ({supabaseAdmin: {from: (table: string) => {
  const filters: ((r: Record<string, unknown>) => boolean)[] = [];
  let start=0, end=999;
  const query = {
    select: () => query, order: () => query, upsert: () => query, insert: () => query, update: () => query,
    maybeSingle: async () => ({data: table === "site_feed_tokens" ? {id:"fake-site-token",organization_id:ORG,token_prefix:"hbxx_EXEMPLU_SITE",scope:null,revoked_at:null} : null,error:null}),
    eq: (k: string,v: unknown) => {filters.push(r => r[k] === v);return query;},
    is: (k: string,v: unknown) => {filters.push(r => (r[k]??null) === v);return query;},
    in: (k: string,v: unknown[]) => {filters.push(r => v.includes(r[k]));return query;},
    range: (a: number,b: number) => {start=a;end=b;return query;},
    then: (resolve: (r: unknown) => unknown) => {
      const rows: Record<string, unknown>[] = table === "organizations" ? (state.missingAgency ? [] : [{id:ORG,status:"active",archived_at:null,updated_at:"2026-11-07T00:00:00Z"}])
        : table === "portal_connections" ? [{organization_id:ORG,portal:"bazaruldecase",activated:true}]
        : table === "portal_publications" ? [{organization_id:ORG,property_id:PROPERTY,portal_key:"bazaruldecase",enabled:true}]
        : table === "properties" ? [{id:PROPERTY,organization_id:ORG,assigned_to:AGENT,publish_status:"published",deleted_at:null,status:"active",updated_at:"2026-11-07T00:00:00Z",property_type:"apartment",transaction_kind:"sale",for_sale:true,for_rent:false,price:100000,sale_price:100000,currency:"EUR",sale_currency:"EUR",features:[]}]
        : table === "profiles" ? [{id:AGENT,organization_id:ORG,full_name:"Agent fictiv",phone:state.noPhone?null:"0722123456",email:null}]
        : table === "property_images" ? Array.from({length:state.rows},(_,i) => ({id:`image-${i}`,organization_id:ORG,property_id:PROPERTY,include_in_publish:true,is_confidential:false,position:i})) : [];
      const filtered = rows.filter(r=>filters.every(f=>f(r)));
      const failed = state.tableError===table || (state.authError && table==="organizations");
      return Promise.resolve({data:failed?null:filtered.slice(start,end+1),error:failed?{message:"simulated read failure"}:null,count:filtered.length}).then(resolve);
    },
  };return query;
}}}));
import { Route } from "@/routes/api/public/portal/v1/bazaruldecase.feed[.]xml";
import { handlePortalIndex, listPortalIndexedAgencies } from "@/lib/portals/clickimob/index-feed.server";
import { handlePropertiesList } from "@/lib/site-feed/handlers.server";

const xmlRequest = (token="portal") => {
  const handler = Route.options.server?.handlers?.GET;
  if (typeof handler !== "function") throw new Error("Missing XML handler");
  const signed = token==="site" ? "hbxx_EXEMPLU_SITE" : clickimobFeedToken(properstarEntityId("hb",ORG),KEY,"bazaruldecase");
  return handler({request:new Request("https://www.habitoo.ro/api/public/portal/v1/bazaruldecase/feed.xml",{headers:{authorization:`Bearer ${signed}`}})} as never) as Promise<Response>;
};
beforeEach(()=>{state.tableError="";state.missingAgency=false;state.noPhone=false;state.authError=false;state.rows=1;});
describe("XML and index inventory safety",()=>{
  for(const table of ["portal_publications","properties","profiles","property_images"]) it(`${table} read error gives 503, no partial XML`,async()=>{
    state.tableError=table;const r=await xmlRequest();expect(r.status).toBe(503);expect(r.headers.get("retry-after")).toBe("300");expect(await r.text()).not.toContain("<root>");
  });
  it("index fails rather than silently omitting an active agency",async()=>{
    state.missingAgency=true;
    const res=await handlePortalIndex(new Request("https://www.habitoo.ro/index"),KEY,"bazaruldecase",{indexKey:()=>KEY,listAgencies:now=>listPortalIndexedAgencies(now,"bazaruldecase"),rateLimited:()=>false,log:async()=>{}});
    expect(res.status).toBe(503);expect(res.headers.get("retry-after")).toBe("300");expect(await res.text()).not.toContain('"agencies"');
  });
  it("index agency read errors are retryable",async()=>{
    state.tableError="organizations";
    const res=await handlePortalIndex(new Request("https://www.habitoo.ro/index"),KEY,"bazaruldecase",{indexKey:()=>KEY,listAgencies:now=>listPortalIndexedAgencies(now,"bazaruldecase"),rateLimited:()=>false,log:async()=>{}});
    expect(res.status).toBe(503);expect(res.headers.get("retry-after")).toBe("300");
  });
  it("agency resolver error returns 503 at XML boundary",async()=>{state.authError=true;expect((await xmlRequest()).status).toBe(503);});
  it("no contact phone excludes property from both XML and JSON",async()=>{
    state.noPhone=true;
    const xml=await xmlRequest();expect(xml.status).toBe(200);expect(await xml.text()).not.toContain("<property>");
    const json=await handlePropertiesList(new Request("https://www.habitoo.ro/api/public/sites/v1/properties"),{organizationId:ORG,portal:"bazaruldecase",scopes:["feed:read"]} as FeedAuthOk);
    expect(json.response.status).toBe(200);expect((await json.response.json()).data).toEqual([]);
  });
  it("site token is 403 even with feed:read",async()=>{const r=await xmlRequest("site");expect(r.status).toBe(403);});
  it("a valid full feed is 200 with all image pages, not the database default limit",async()=>{
    state.rows=1101;
    const res=await xmlRequest();expect(res.status).toBe(200);
    const parsed=new XMLParser({isArray:n=>n==="property"}).parse(await res.text());
    expect(parsed.root.property).toHaveLength(1);expect(parsed.root.property[0].id).toBe(`${PROPERTY}-sale`);
  });
});