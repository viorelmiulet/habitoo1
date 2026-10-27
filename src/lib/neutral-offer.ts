import { formatMoney } from './format';
export const NEUTRAL_OFFER_ORIGIN = 'https://www.habitoo.ro';
export function neutralOfferReason(p: {status:string;deleted_at?:string|null}) { return p.status==='active'&&!p.deleted_at?null:'Proprietatea nu e activă, linkul nu se deschide'; }
export function neutralOfferUrl(code:string) { return `${NEUTRAL_OFFER_ORIGIN}/o/${code}`; }
export function collaboratorMessage(p:{title:string;price:number|null;currency:string;city:string|null;district:string|null;collab_commission_percent:number|null},link:string,name='') {
 return `Bună${name?`, ${name}`:''}!\n\nÎți trimit oferta pentru clientul tău:\n${p.title}\n${p.price===null?'Preț la cerere':formatMoney(p.price,p.currency)}\n${[p.district,p.city].filter(Boolean).join(', ')}\n\n${link}${p.collab_commission_percent!==null?`\n\nComision de colaborare: ${p.collab_commission_percent}%`:''}`;
}
export type NeutralOffer={reference:string;title:string;description:string;price:number|null;currency:string;transactionKind:string;propertyType:string;rooms:number|null;bathrooms:number|null;surface:number|null;usableSurface:number|null;landSurface:number|null;floor:number|null;buildYear:number|null;city:string|null;district:string|null;features:string[];utilities:string[];images:{index:number;width:number|null;height:number|null}[]};