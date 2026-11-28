import type { PartnerAgent, PartnerDevelopment, PartnerListing } from "./schema";
import type { DevelopmentRow } from "@/lib/site-feed/developments";
import { mapPartnerDevelopment } from "./developments";
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { mapPartnerListing } from "./schema";
export { SANDBOX_AGENCY_ID } from "./sandbox-identity";
import { SANDBOX_AGENCY_ID } from "./sandbox-identity";
export const sandboxId = (n: number) => `a7b50000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const sandboxAgents: PartnerAgent[] = [2,3].map((n,i)=>({id:sandboxId(n),agency_id:SANDBOX_AGENCY_ID,name:`Agent Demo ${i+1}`,first_name:"Agent",last_name:`Demo ${i+1}`,email:`agent${i+1}@example.invalid`,phone:"0000000000",photo_url:null,position:"Agent Demo"}));
const SANDBOX_TYPES = ["apartment","studio","house","land","commercial","apartment","studio","villa","land","office","apartment","house"];
function sandboxRow(type: string, i: number, now: string): PropertyRow {
  const rent=i%3===1,currency=i%2?"RON":"EUR";
  const row = {id:sandboxId(100+i),organization_id:SANDBOX_AGENCY_ID,assigned_to:sandboxAgents[i%2].id,reference:`TEST-${String(i+1).padStart(3,"0")}`,title:`[Test] ${type} — exemplu ${i+1}`,description:"Anunț fictiv pentru testarea integrării Partner API. Nu reprezintă o ofertă reală.",property_type:type,category:null,status:"active",publish_status:"published",deleted_at:null,transaction_kind:rent?"rent":"sale",for_sale:!rent,for_rent:rent,price:rent?500+i*50:80000+i*10000,currency,sale_price:rent?null:80000+i*10000,sale_currency:currency,rent_price:rent?500+i*50:null,rent_currency:currency,rooms:type==="studio"?1:3,bedrooms:type==="studio"?1:2,bathrooms:1,usable_area:40+i*10,land_area:type==="land"?500+i*100:null,build_year:2020,floor:1,floors_total:4,location_precise:i%2===0,lat:44.43+i/1000,lng:26.1+i/1000,street:"Strada Fictivă Demo",street_number:String(i+1),city:"București",county:"București",district:"Centru",features:[],utilities:[],tags:[],created_at:now,updated_at:now} as unknown as PropertyRow;
    return row;
}
export function sandboxListings(imageUrls: { apartment:string; house:string; land:string }, now = new Date().toISOString()): PartnerListing[] {
  return SANDBOX_TYPES.map((type,i)=>{
    const row=sandboxRow(type,i,now);
    const listing=mapPartnerListing(row,[]);
    return {...listing,images:[{url:type==="land"?imageUrls.land:["house","villa"].includes(type)?imageUrls.house:imageUrls.apartment,position:0,is_cover:true}],updated_at:now};
  });
}
/** Fictitious sandbox development: three sale EUR units of the twelve templates. */
export const SANDBOX_DEVELOPMENT_ID = sandboxId(200);
export const SANDBOX_DEVELOPMENT_UNITS = [0, 4, 6].map(i => sandboxId(100 + i));
export function sandboxDevelopment(imageUrl: string, now = new Date().toISOString()): PartnerDevelopment {
  const units = [0, 4, 6].map(i => ({ ...sandboxRow(SANDBOX_TYPES[i] ?? "apartment", i, now), development_id: SANDBOX_DEVELOPMENT_ID }) as PropertyRow);
  const d = { id: SANDBOX_DEVELOPMENT_ID, organization_id: SANDBOX_AGENCY_ID, assigned_to: sandboxAgents[0]?.id ?? null, name: "[Test] Ansamblul Demo Habitoo", developer_name: "Dezvoltator Demo — FICTIV",
    description: "Ansamblu fictiv pentru testarea integrării Partner API. Nu reprezintă o ofertă reală.", county: "București", city: "București", district: "Centru",
    street: "Strada Fictivă Demo", street_number: "100", lat: 44.435, lng: 26.105, location_precise: false, construction_stage: "in_constructie", delivery_date: "2027-12-31",
    buildings_count: 2, floors_count: 8, total_units: 120, amenities: ["parcare_subterana", "loc_de_joaca"], price_from: null, price_to: null, currency: "EUR",
    area_from: 40, area_to: 140, estate_type: "flats", status: "active", deleted_at: null, created_at: now, updated_at: now } as unknown as DevelopmentRow;
  return { ...mapPartnerDevelopment(d, units, []), images: [{ url: imageUrl, position: 0, is_cover: true }], updated_at: now };
}
