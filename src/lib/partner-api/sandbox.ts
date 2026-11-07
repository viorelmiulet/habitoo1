import type { PartnerAgent, PartnerListing } from "./schema";
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { mapPartnerListing } from "./schema";
export const SANDBOX_AGENCY_ID = "a7b50000-0000-4000-8000-000000000001";
export const sandboxId = (n: number) => `a7b50000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const sandboxAgents: PartnerAgent[] = [2,3].map((n,i)=>({id:sandboxId(n),agency_id:SANDBOX_AGENCY_ID,name:`Agent Demo ${i+1}`,first_name:"Agent",last_name:`Demo ${i+1}`,email:`agent${i+1}@example.invalid`,phone:"0000000000",photo_url:null,position:"Agent Demo"}));
export function sandboxListings(imageUrls: { apartment:string; house:string; land:string }, now = new Date().toISOString()): PartnerListing[] {
  const types = ["apartment","studio","house","land","commercial","apartment","studio","villa","land","office","apartment","house"];
  return types.map((type,i)=>{
    const rent=i%3===1,currency=i%2?"RON":"EUR";
    const row = {id:sandboxId(100+i),organization_id:SANDBOX_AGENCY_ID,assigned_to:sandboxAgents[i%2].id,reference:`TEST-${String(i+1).padStart(3,"0")}`,title:`[Test] ${type} — exemplu ${i+1}`,description:"Anunț fictiv pentru testarea integrării Partner API. Nu reprezintă o ofertă reală.",property_type:type,category:null,status:"active",publish_status:"published",deleted_at:null,transaction_kind:rent?"rent":"sale",for_sale:!rent,for_rent:rent,price:rent?500+i*50:80000+i*10000,currency,sale_price:rent?null:80000+i*10000,sale_currency:currency,rent_price:rent?500+i*50:null,rent_currency:currency,rooms:type==="studio"?1:3,bedrooms:type==="studio"?1:2,bathrooms:1,usable_area:40+i*10,land_area:type==="land"?500+i*100:null,build_year:2020,floor:1,floors_total:4,location_precise:i%2===0,lat:44.43+i/1000,lng:26.1+i/1000,street:"Strada Fictivă Demo",street_number:String(i+1),city:"București",county:"București",district:"Centru",features:[],utilities:[],tags:[],created_at:now,updated_at:now} as unknown as PropertyRow;
    const listing=mapPartnerListing(row,[]);
    return {...listing,images:[{url:type==="land"?imageUrls.land:["house","villa"].includes(type)?imageUrls.house:imageUrls.apartment,position:0,is_cover:true}],updated_at:now};
  });
}