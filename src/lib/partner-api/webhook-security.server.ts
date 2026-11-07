import ipaddr from 'ipaddr.js';
import {createHmac,randomBytes} from 'node:crypto';
export class WebhookUrlError extends Error{}
export function publicAddress(address:string):boolean{
 try{const ip=ipaddr.parse(address);return ip.range()==='unicast' && !(ip.kind()==='ipv6' && !ipaddr.IPv6.parse(address).match(ipaddr.IPv6.parse('2000::'),3));}catch{return false;}
}
export function webhookUrl(raw:string):URL{
 let url:URL;try{url=new URL(raw);}catch{throw new WebhookUrlError('Adresa webhook nu este validă.');}
 const host=url.hostname.replace(/\.$/,'');
 if(url.protocol!=='https:' || (url.port && url.port!=='443') || url.username || url.password || url.hash || ipaddr.isValid(host.replace(/^\[|\]$/g,'')) || !host.includes('.') || host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))throw new WebhookUrlError('Folosiți o adresă HTTPS publică, pe portul 443, fără credențiale sau IP literal.');
 return url;
}
export async function validateWebhookUrl(raw:string,send:typeof fetch=fetch,signal?:AbortSignal){
 const url=webhookUrl(raw),controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
 try{
  const records=await Promise.all(['A','AAAA'].map(async type=>{
   const endpoint=new URL('https://cloudflare-dns.com/dns-query');endpoint.searchParams.set('name',url.hostname);endpoint.searchParams.set('type',type);
   const response=await send(endpoint,{headers:{Accept:'application/dns-json'},redirect:'manual',signal:controller.signal});
   if(!response.ok)throw new WebhookUrlError('Verificarea DNS nu este disponibilă.');
   const raw=await boundedBody(response,65536);const data=JSON.parse(raw) as {Status?:number;Answer?:{type:number;data:string}[]};
   if(data.Status!==0)throw new WebhookUrlError('Adresa webhook nu poate fi rezolvată prin DNS.');
   return (data.Answer??[]).filter(a=>a.type===1||a.type===28).map(a=>a.data);
  }));
  const ips=records.flat();if(!ips.length||ips.some(ip=>!publicAddress(ip)))throw new WebhookUrlError('Adresa webhook trebuie să rezolve exclusiv către IP-uri publice; adresele private sau rezervate nu sunt permise.');
  return url;
 }catch(e){if(e instanceof WebhookUrlError)throw e;throw new WebhookUrlError('Verificarea DNS a adresei webhook a eșuat.');}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function boundedBody(response:Response,max=65536){
 const reader=response.body?.getReader();if(!reader)return '';let size=0;const chunks:Uint8Array[]=[];
 try{while(size<max){const part=await reader.read();if(part.done)break;const chunk=part.value.subarray(0,max-size);chunks.push(chunk);size+=chunk.length;}}finally{await reader.cancel().catch(()=>{});}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(result);
}
export const newWebhookSecret=()=>randomBytes(32).toString('hex');
export const signWebhook=(secret:string,timestamp:number,body:string)=>`t=${timestamp},v1=${createHmac('sha256',Buffer.from(secret,'hex')).update(`${timestamp}.${body}`).digest('hex')}`;
export async function sendWebhook(url:string,secret:string,event:{type:string},deliveryId:string,send:typeof fetch=fetch){
 const start=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);let status:number|null=null;
 try{
  const target=await validateWebhookUrl(url,send,controller.signal),body=JSON.stringify(event),t=Math.floor(Date.now()/1000);
  const response=await send(target,{method:'POST',redirect:'manual',signal:controller.signal,headers:{'Content-Type':'application/json','User-Agent':'Habitoo-Webhooks/1.0','X-Habitoo-Event':event.type,'X-Habitoo-Delivery':deliveryId,'X-Habitoo-Signature':signWebhook(secret,t,body)},body});
  status=response.status;await boundedBody(response);
  return {ok:status>=200&&status<300,http_status:status,duration_ms:Date.now()-start,error:status>=300&&status<400?'Redirecționările nu sunt permise.':status>=200&&status<300?null:`Răspuns HTTP ${status}.`};
 }catch(e){return {ok:false,http_status:status,duration_ms:Date.now()-start,error:e instanceof WebhookUrlError?e.message:controller.signal.aborted?'Livrarea a depășit 10 secunde.':'Conexiunea webhook a eșuat.'};}finally{clearTimeout(timer);}
}
