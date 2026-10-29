import { describe,it,expect } from "vitest";
import { mapPropertyToZup, type ZupRow } from "./mapper";
import { downloadZupCatalogue, parseZupLocations, type ZupCatalogue, type ZupCharacteristic } from "./nomenclature";
const field = (filter_key:string,filter_type="number",is_required=false,options:unknown[]=[]):ZupCharacteristic => ({filter_key,filter_name:filter_key,filter_type,is_required,options,validation_rules:[],conditional_options:[],depends_on_filter:null,is_dependent:false});
const fields = [field("pret","number",true),field("moneda","select",true,["EUR","RON"]),field("suprafata_utila","number",true),field("etaj","select",false,[{value:0,label:"Parter"},{value:12,label:"12"}]),field("compartimentare","select",false,[{value:"d",label:"Decomandat"}]),field("dotari","multiselect",false,[{value:"balcon",label:"Balcon"}]),field("comision","boolean",true)];
const names = ["Apartamente 2 camere de vânzare","Apartamente 3 camere de vânzare","Apartamente 2 camere de închiriat","Apartamente 3 camere de închiriat","Case de vânzare","Terenuri de vânzare","Spații comerciale de vânzare"];
const catalogue: ZupCatalogue = {categories:[{id:10,name:"Imobiliare",parent_id:null,leaf:false,characteristics:[]},...names.map((name,index) => ({id:20+index,name,parent_id:10,leaf:true,characteristics:fields}))],locations:[{id:1,county:"București",locality:"Municipiul București"},{id:2,county:"Ilfov",locality:"Chiajna"},{id:3,county:"Iași",locality:"Iași"}]};
const row:ZupRow = {id:"p",title:"Titlu",description:"Descriere",property_type:"apartment",rooms:2,for_sale:true,for_rent:false,city:"Bucuresti",county:"Bucuresti",sale_price:79000,sale_currency:"EUR",usable_surface:58,commission:"0%",floor_label:"Parter",layout:"Decomandat",features:["Balcon","inexistent"]};
const options = {catalogue,images:[{url:"https://example.test/main",path:"main.jpg"},{url:"https://example.test/second",mime:"image/png"},{url:"https://example.test/webp",path:"file.webp"}],contact:{fullName:"Popescu Ion",phone:"0700000000"}};
const map = (p:Partial<ZupRow>={},cat=catalogue) => mapPropertyToZup({...row,...p},{...options,catalogue:cat});
describe("ZUP pure mapping",() => {
  it.each([[2,true,20],[3,true,21],[2,false,22],[3,false,23]])("apartment %s sale %s selects final category %s",(rooms,sale,category) => {
    const r = map({rooms,for_sale:sale,for_rent:!sale,rent_price:500,rent_currency:"EUR"}); expect(r.ok).toBe(true); expect(r.bodies[0]?.category_id).toBe(category);
  });
  it.each([["house",24],["land",25],["commercial",26]])("maps %s to %s",(type,category) => {expect(map({property_type:String(type)}).bodies[0]?.category_id).toBe(category);});
  it("builds two separate transactions with transaction prices",() => {const r=map({for_rent:true,rent_price:500,rent_currency:"RON"});expect(r.bodies.map(b=>b.category_id)).toEqual([20,22]);expect(r.bodies.map(b=>b.characteristics.pret)).toEqual([79000,500]);expect(r.bodies[1]?.characteristics.moneda).toBe("RON");});
  it("rejects nonfinal and ambiguous categories",() => {
    expect(map({}, {...catalogue,categories:catalogue.categories.map(c=>({...c,leaf:false}))}).ok).toBe(false);
    expect(map({}, {...catalogue,categories:[...catalogue.categories,{...catalogue.categories[1],id:100,name:names[0] ?? "",parent_id:10,leaf:true,characteristics:fields}]}).bodies).toHaveLength(0);
  });
  it("uses only declared keys and verified options",() => {const r=map();expect(r.bodies[0]?.characteristics).toEqual({pret:79000,moneda:"EUR",suprafata_utila:58,etaj:0,compartimentare:"d",dotari:["balcon"],comision:true});expect(map({layout:"Circular"}).bodies[0]?.characteristics).not.toHaveProperty("compartimentare");});
  it("does not infer conditional/range values",() => {const cat={...catalogue,categories:catalogue.categories.map(c=>({...c,characteristics:fields.map(f=>f.filter_key==="compartimentare"?{...f,is_dependent:true,depends_on_filter:"etaj"}:f)}))};expect(map({},cat).bodies[0]?.characteristics).not.toHaveProperty("compartimentare");});
  it.each(["Iași","Iasi"])("resolves exact original locality for %s",city=>{expect(map({city,county:"Iasi"}).bodies[0]?.locality).toBe("Iași");});
  it("uses Bucharest sector only when it is a locality",()=>{
    expect(map({district:"Sector 6"}).bodies[0]?.locality).toBe("Municipiul București");
    const cat={...catalogue,locations:[...catalogue.locations,{id:4,county:"București",locality:"Sectorul 6"}]};expect(map({district:"Sector 6"},cat).bodies[0]?.locality).toBe("Sectorul 6");
  });
  it("unknown locality and missing required characteristic block",()=>{expect(map({city:"Necunoscuta",county:"Ilfov"}).ok).toBe(false);expect(map({usable_surface:null,surface:null}).ok).toBe(false);expect(map({commission:null}).ok).toBe(false);});
  it("filters photos to JPEG/PNG in original order",()=>{expect(map().bodies[0]?.photos_urls).toEqual(["https://example.test/main","https://example.test/second"]);expect(mapPropertyToZup(row,{...options,images:[{url:"https://example.test/file.webp"}]}).ok).toBe(false);});
  it("missing phone or price blocks",()=>{expect(map({sale_price:0}).ok).toBe(false);expect(mapPropertyToZup(row,{...options,contact:{fullName:"Popescu Ion",phone:""}}).ok).toBe(false);});
  it("unknown required characteristic blocks, optional is omitted",()=>{const cat={...catalogue,categories:catalogue.categories.map(c=>({...c,characteristics:[...fields,field("necunoscut","text",true)]}))};expect(map({},cat).ok).toBe(false);expect(map({},cat).bodies[0]?.characteristics).not.toHaveProperty("necunoscut");});
});
describe("ZUP download validation",()=>{
  const remote:Record<string,unknown> = {categories:{data:[{id:10,name:"Imobiliare",parent_id:null},{id:20,name:names[0],parent_id:10}]},"categories/10":{data:[{id:10,name:"Imobiliare",parent_id:null}]},"categories/20":{data:[{id:20,name:names[0],parent_id:10}]},"categories/20/characteristics":{data:fields},"categories/20/characteristics/required":{data:fields.filter(f=>f.is_required)},locations:{success:true,data:[{id:1,judet:"Iași",localitate:"Iași"}]}};
  it("downloads all details and required fields before returning a stable snapshot",async()=>{const get=async(p:string)=>remote[p];const a=await downloadZupCatalogue(get);const b=await downloadZupCatalogue(get);expect(a.snapshot).toEqual(b.snapshot);expect(a.snapshot.categories.map(c=>c.leaf)).toEqual([false,true]);expect(a.raw).toHaveProperty("locations");});
  it("invalid response aborts before persistence",async()=>{let writes=0;try{const d=await downloadZupCatalogue(async p=>p==="locations"?{success:true,data:[{id:1}]}:remote[p]);if(d)writes++;}catch{}expect(writes).toBe(0);});
  it("rejects ambiguous IDs and unsuccessful locations",()=>{expect(()=>parseZupLocations({success:false,data:[]})).toThrow();});
});