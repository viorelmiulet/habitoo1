import { formatMoney } from "./format";
import { offerShareUrl } from "./share";
export type OfferChannel = "whatsapp" | "email" | "sms" | "copy";
export const OFFER_CHANNEL_LABELS: Record<OfferChannel,string> = { whatsapp:"WhatsApp",email:"Email",sms:"SMS",copy:"Copiază linkul" };
export const OFFER_INACTIVE_REASON = "Proprietatea nu e activă, linkul nu se deschide";
export function offerSendReason(p: { status: string; publish_status: string | null; deleted_at?: string | null }): string | null {
 if(p.deleted_at || p.status !== "active") return OFFER_INACTIVE_REASON;
 return p.publish_status === "published" ? null : "Oferta nu este disponibilă public, linkul nu se deschide";
}
export function offerPhone(value:string): string {
 let digits=value.replace(/[^0-9]/g,"");
 if(digits.startsWith("00")) digits=digits.slice(2);
 if(/^0\d{9}$/.test(digits)) digits=`40${digits.slice(1)}`;
 return /^\d{8,15}$/.test(digits) ? digits : "";
}
export function offerMessage(p:{id:string;title:string;price:number|null;currency:string;transaction_kind:string;city:string|null;district:string|null},agent:string,agency:string,client="") {
 return `Bună${client ? `, ${client}` : ""}!\n\nÎți trimit această ofertă:\n${p.title}\n${p.price===null ? "Preț la cerere" : formatMoney(p.price,p.currency)}${p.transaction_kind==='rent' ? ' / lună' : ''}\n${[p.district,p.city].filter(Boolean).join(', ')}\n\n${offerShareUrl(p.id)}\n\n${agent}\n${agency}`;
}
export function offerChannelUrl(channel:OfferChannel,phone:string,message:string,ios=false) {
 const number=offerPhone(phone);
 if(!number) return null;
 if(channel==='whatsapp') return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
 if(channel==='sms') return `sms:+${number}${ios?'&':'?'}body=${encodeURIComponent(message)}`;
 return null;
}
