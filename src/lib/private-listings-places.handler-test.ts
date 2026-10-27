import { it, expect, vi } from "vitest";
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>{const b={middleware:()=>b,inputValidator:()=>b,handler:(h:unknown)=>h};return b;}}));
vi.mock("@/lib/org-access",()=>({requireActiveOrgAuth:{}}));
import { getOwnerListings, privateListingsFiltersSchema } from "./listings.functions";
import { legacyPlaceChoices } from "./search-places";
it("uses parameterized geography RPC in both count phases and preserves scope and price",async()=>{
 const rpc=vi.fn(),eq=vi.fn(),gte=vi.fn();
 const chain={select:()=>chain,eq:(...args:unknown[])=>{eq(...args);return chain;},or:()=>chain,gte:(...args:unknown[])=>{gte(...args);return chain;},order:()=>chain,range:async()=>({data:[],error:null,count:0}),then:(resolve:(v:unknown)=>unknown)=>resolve({data:[],error:null,count:0})};
 rpc.mockReturnValue(chain);
 const places=[...legacyPlaceChoices('București','București','Militari'),...legacyPlaceChoices('Ilfov','Chiajna')];
 const run=getOwnerListings as unknown as (v:unknown)=>Promise<unknown>;
 await run({data:privateListingsFiltersSchema.parse({places,scope:'facebook',priceMin:100,sort:'price_asc'}),context:{supabase:{rpc,from:vi.fn(()=>chain)}}});
 expect(rpc).toHaveBeenCalledTimes(2);expect(rpc).toHaveBeenCalledWith('search_listings_places',{_choices:places});expect(eq).toHaveBeenCalledWith('source','facebook');expect(gte).toHaveBeenCalledWith('price',100);
});
