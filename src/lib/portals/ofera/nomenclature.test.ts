import { describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { downloadOferaNomenclature, runOferaNomenclatureSync, type OferaNomenclaturePayload } from "./nomenclature.server";
import { parseOferaPlaces, type OferaParameter } from "./nomenclature";
const parameter: OferaParameter = { code: "c_etaj", type: "dropdown", label: "Etaj", required: false, options: { "101": "Parter" } };
const category = (id: number, parent_id: number | null, path_url: string) => ({ id, parent_id, path_url, name: "Categorie", code: String(id), depth: parent_id ? 2 : 1, parameters: [parameter] });
const payload = (): OferaNomenclaturePayload => ({ categories: [category(81,null,"imobiliare"),category(94,81,"imobiliare/apartamente"),category(102,81,"imobiliare/case")], counties: [{ id:40,name:"București",name_normalized:"bucuresti" }], cities:[{id:179132,name:"București",name_normalized:"bucuresti",county_id:40},{id:2,name:"Altă localitate",name_normalized:"alta localitate",county_id:40}],zones:[{id:11,name:"Sectorul 6",name_normalized:"sectorul 6",city_id:179132},{id:11138,name:"Militari",name_normalized:"militari",city_id:179132}], raw:{categories:{index:[],details:{}},counties:[],zones:[],cities:{count:2,hash:"fixture-hash"}} });
describe("Ofera nomenclature validation", () => {
  it("downloads every real-estate detail without token and saves dropdown dictionaries", async () => {
    const p = payload();
    const cats = p.categories.map((c) => ({...c,children:c.id===81?[94,102]:[]}));
    const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      const path=new URL(String(url)).pathname.replace("/api/v2.1","");
      const data=path==="/categories"?{results:cats.map((c)=>({...c,parameters:[]}))}:path==="/counties"?[{id:40,nume:"București"}]:path==="/cities"?[{id:179132,nume:"București",judet_id:40}]:path==="/zones"?[{id:11,nume:"Sectorul 6",city_id:179132}]:cats.find((c)=>path===`/categories/${c.id}`);
      return new Response(JSON.stringify(data));
    });
    const result=await downloadOferaNomenclature(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(result.categories.find((c)=>c.id===94)?.parameters[0]?.options).toEqual({"101":"Parter"});
    expect(result.raw.cities.count).toBe(1);
    expect(result.raw.cities.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(result.raw.cities).sort()).toEqual(["count","hash"]);
  });
  it("invalid download never calls apply and records failure", async () => {
    const apply = vi.fn(); const failure = vi.fn(async (message: string) => ({ok:false,syncedAt:"fixture",counts:null,changes:null,message}));
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{"wrong":true}'));
    const result = await runOferaNomenclatureSync({ download: () => downloadOferaNomenclature(fetcher), apply, failure });
    expect(result.ok).toBe(false); expect(apply).not.toHaveBeenCalled(); expect(failure).toHaveBeenCalledOnce();
  });
  it("normalizes Romanian names and hyphens without merging repeated zones", () => {
    const places = parseOferaPlaces([{id:1,nume:"Șoseaua-Braşov",city_id:10},{id:2,nume:"Șoseaua-Braşov",city_id:10}],"zones",new Set([10]));
    expect(places.map((p)=>p.name_normalized)).toEqual(["soseaua brasov","soseaua brasov"]);
    expect(places).toHaveLength(2);
  });
  it("rejects missing geographic parents and duplicate IDs", () => {
    expect(()=>parseOferaPlaces([{id:1,nume:"X",judet_id:9}],"cities",new Set([10]))).toThrow("părinte lipsă");
    expect(parseOferaPlaces([{id:1,nume:"X",city_id:65531}],"zones",new Set([10]))[0]?.city_id).toBe(65531);
    expect(()=>parseOferaPlaces([{id:1,nume:"X"},{id:1,nume:"Y"}],"counties")).toThrow("duplicați");
  });
});
describe("Ofera transactional nomenclature", () => {
  it("is idempotent, soft-deactivates missing rows and records exact field/option changes", async () => {
    const db = new PGlite();
    try {
      await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE FUNCTION public.is_superadmin() RETURNS boolean LANGUAGE sql AS 'SELECT false'; CREATE TABLE public.profiles(id uuid PRIMARY KEY,organization_id uuid); CREATE TABLE public.user_roles(user_id uuid,role text); CREATE TABLE public.notifications(user_id uuid,organization_id uuid,type text,title text,body text,link text,created_by uuid);");
      await db.exec(readFileSync(new URL("../../../../drizzle/migrations/0216_ofera_nomenclature.sql",import.meta.url),"utf8"));
      await db.exec("INSERT INTO public.profiles(id) VALUES('11111111-1111-4111-8111-111111111111'); INSERT INTO public.user_roles(user_id,role) VALUES('11111111-1111-4111-8111-111111111111','superadmin');");
      const apply = async (p: OferaNomenclaturePayload) => (await db.query<{result: {counts: Record<string,{read:number;added:number;modified:number;deactivated:number}>;changes:{parameters:{categoryId:number;code:string;kind:string}[]}}}>("SELECT public.ofera_nomenclature_apply($1::jsonb) result",[JSON.stringify(p)])).rows[0]?.result;
      const first = await apply(payload());
      expect(first?.counts.categories).toEqual({read:3,added:3,modified:0,deactivated:0});
      expect((await db.query<{n:number}>("SELECT count(*)::int n FROM public.notifications")).rows[0]?.n).toBe(1);
      const before = await db.query("SELECT * FROM public.ofera_cities ORDER BY id");
      const second = await apply(payload());
      expect(second?.counts.categories).toEqual({read:3,added:0,modified:0,deactivated:0});
      expect(second?.counts.cities).toEqual({read:2,added:0,modified:0,deactivated:0});
      expect((await db.query("SELECT * FROM public.ofera_cities ORDER BY id")).rows).toEqual(before.rows);
      expect((await db.query<{n:number}>("SELECT count(*)::int n FROM public.notifications")).rows[0]?.n).toBe(1);
      const next = payload(); next.categories.pop(); next.cities.pop(); next.zones.pop();
      const changed = next.categories.find((c)=>c.id===94); if (!changed) throw new Error("fixture");
      changed.parameters=[{...parameter,options:{"101":"Parter nou"}},{code:"new_field",label:"Nou",type:"number",required:false,options:null}];
      const third = await apply(next);
      expect(third?.counts.categories.deactivated).toBe(1); expect(third?.counts.cities.deactivated).toBe(1); expect(third?.counts.zones.deactivated).toBe(1);
      expect(third?.changes.parameters).toContainEqual({categoryId:94,code:"new_field",kind:"added"});
      expect(third?.changes.parameters).toContainEqual({categoryId:94,code:"c_etaj",kind:"options"});
      expect((await db.query<{n:number}>("SELECT count(*)::int n FROM public.notifications")).rows[0]?.n).toBe(2);
      for (const [table,id] of [["categories",102],["cities",2],["zones",11138]] as const) expect((await db.query<{active:boolean}>(`SELECT active FROM public.ofera_${table} WHERE id=$1`,[id])).rows[0]?.active).toBe(false);
      const invalidPayload=payload(); invalidPayload.zones=[];
      const beforeInvalid=(await db.query("SELECT * FROM public.ofera_cities ORDER BY id")).rows;
      await expect(apply(invalidPayload)).rejects.toThrow("Invalid Ofera catalogue zones");
      expect((await db.query("SELECT * FROM public.ofera_cities ORDER BY id")).rows).toEqual(beforeInvalid);
      const privileges=await db.query<{read:boolean;write:boolean}>("SELECT has_table_privilege('authenticated','public.ofera_cities','SELECT') read,has_table_privilege('authenticated','public.ofera_cities','INSERT') write");
      expect(privileges.rows[0]).toEqual({read:true,write:false});
    } finally { await db.close(); }
  });
});