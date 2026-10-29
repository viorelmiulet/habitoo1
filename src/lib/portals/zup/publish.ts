import { PortalError } from "../errors";
import type { ZupBody } from "./mapper";
export type ZupPhoto = { source:string; id:string|null };
export type ZupState = { transaction:"sale"|"rent"; zup_id:string|null; slug:string|null; public_url:string|null; status:string; photos:ZupPhoto[]; pending_images:string[]; attempted_at:string|null; attempted_title:string|null; attempted_price:number|null; last_error:string|null; last_checked_at?:string|null };
export type ZupDraft = { transaction:"sale"|"rent"; body:ZupBody };
export type ZupPublishDeps = { call(path:string,method:"GET"|"POST"|"PUT"|"DELETE",body?:unknown):Promise<unknown>; save(state:ZupState):Promise<void>; now?:()=>number };
export const zupStatusLabel=(s:string)=>({active:"Activ",inactive:"Inactiv",unconfirmed:"Creare neconfirmată",pending:"În procesare"} as Record<string,string>)[s.toLowerCase()] ?? s;
export const zupPortalStatus=(rows:ZupState[])=>rows.some(r=>r.status.toLowerCase()==="active")?"published":rows.some(r=>r.status==="unconfirmed")?"error":rows.every(r=>r.status.toLowerCase()==="inactive")?"withdrawn":"pending";
const rec=(v:unknown):Record<string,unknown>|null=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
const identifier=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0?String(v):typeof v==="string"&&/^\d+$/.test(v)&&Number(v)>0?v:null;
export function zupListing(body:unknown):Record<string,unknown>|null {const r=rec(body);const data=r?.data??body;return Array.isArray(data)?data.length===1?rec(data[0]):null:rec(data);}
export function zupListings(body:unknown):Record<string,unknown>[] {const raw=Array.isArray(body)?body:rec(body)?.data;if(!Array.isArray(raw)||raw.some(v=>!rec(v)))throw new PortalError("PORTAL_ERROR","zup_list_format","ZUP nu a returnat lista de anunțuri în formatul așteptat.");return raw as Record<string,unknown>[];}
export function zupPublicUrl(r:Record<string,unknown>):string|null {for(const key of ["public_url","url"]){const raw=r[key];if(typeof raw!=="string")continue;try{const u=new URL(raw);if(u.protocol==="https:"&&(u.hostname==="zup.ro"||u.hostname==="www.zup.ro"))return u.toString();}catch{}}return null;}
export function zupRemoteState(old:ZupState,body:unknown):ZupState {
  const r=zupListing(body);if(!r)throw new PortalError("PORTAL_ERROR","zup_detail_format");
  const remoteId=identifier(r.id);if(remoteId&&old.zup_id&&remoteId!==old.zup_id)throw new PortalError("PORTAL_ERROR","zup_wrong_id");
  const status=typeof r.status==="string"||typeof r.status==="number"?String(r.status):old.status;
  return {...old,zup_id:remoteId??old.zup_id,slug:typeof r.slug==="string"?r.slug:old.slug,public_url:zupPublicUrl(r)??old.public_url,status};
}
/** Associate IDs only through an exact source URL returned by ZUP, never response ordering. */
export function reconcilePhotos(state:ZupState,body:unknown):ZupState {
  const r=zupListing(body);const raw=r?.photos;
  if(!Array.isArray(raw))return state;
  const entries=raw.map(rec).filter((v):v is Record<string,unknown>=>v!==null);
  const wanted=[...state.photos.map(p=>p.source),...state.pending_images];
  const photos=state.photos.map(p=>({...p}));const pending:string[]=[];
  for(const source of wanted){const matches=entries.filter(p=>[p.source_url,p.original_url,p.url].some(v=>v===source));
    const photo=matches.length===1?matches[0]:undefined;const rawId=photo?.id;const pid=typeof rawId==="string"||typeof rawId==="number"?String(rawId):null;
    const safe=pid&&/^[A-Za-z0-9_-]+$/.test(pid)?pid:null;
    const previous=photos.find(p=>p.source===source);
    if(safe){if(previous)previous.id=safe;else photos.push({source,id:safe});}
    else if(state.pending_images.includes(source))pending.push(source);
  }
  return {...state,photos,pending_images:pending};
}
function empty(tx:"sale"|"rent"):ZupState{return {transaction:tx,zup_id:null,slug:null,public_url:null,status:"unconfirmed",photos:[],pending_images:[],attempted_at:null,attempted_title:null,attempted_price:null,last_error:null};}
const now=(d:ZupPublishDeps)=>d.now?.()??Date.now();
export async function recoverZupCreate(state:ZupState,d:ZupPublishDeps):Promise<ZupState|null> {
  if(!state.attempted_at||!state.attempted_title||state.attempted_price===null)return null;
  const started=Date.parse(state.attempted_at);const candidates=zupListings(await d.call("anunturi","GET")).filter(r=>{
    const created=typeof r.created_at==="string"?Date.parse(r.created_at):NaN;
    const price=Number(r.price??rec(r.characteristics)?.pret);
    return identifier(r.id)&&r.name===state.attempted_title&&Number.isFinite(price)&&price===state.attempted_price&&Number.isFinite(created)&&created>=started-10_000&&created<=now(d)+10_000;
  });
  if(candidates.length!==1)return null;
  const recovered=zupRemoteState(state,candidates[0]);return {...recovered,status:typeof candidates[0]?.status==="string"?String(candidates[0].status):"pending",last_error:null};
}
export async function deactivateZup(state:ZupState,d:ZupPublishDeps):Promise<ZupState> {
  if(!state.zup_id){if(state.attempted_at){const recovered=await recoverZupCreate(state,d);if(recovered)return deactivateZup(recovered,d);throw new PortalError("INVALID_REQUEST","zup_unconfirmed_withdraw","Crearea ZUP este neconfirmată. Verifică anunțul în contul ZUP înainte de retragere.");}return state;}
  await d.call(`anunturi/${state.zup_id}/command`,"POST",{command:"deactivate"});const updated={...state,status:"inactive",last_error:null};await d.save(updated);return updated;
}
export async function publishZup(drafts:ZupDraft[],stored:ZupState[],d:ZupPublishDeps):Promise<ZupState[]> {
  const result:ZupState[]=[];
  for(const draft of drafts){
    let state=stored.find(s=>s.transaction===draft.transaction)??empty(draft.transaction);
    if(!state.zup_id&&state.attempted_at){
      const recovered=await recoverZupCreate(state,d);
      if(recovered){state=recovered;await d.save(state);}
      else if(state.status==="creating"){state={...state,status:"unconfirmed",last_error:"Crearea ZUP a fost întreruptă. Verifică în contul ZUP și reîncearcă manual; nu retrimitem automat."};await d.save(state);throw new PortalError("INVALID_REQUEST","zup_interrupted_create",state.last_error??undefined);}
    }
    if(!state.zup_id){
      // Persist before sending: an interrupted queue lease cannot blindly create again.
      state={...state,status:"creating",attempted_at:new Date(now(d)).toISOString(),attempted_title:draft.body.name,attempted_price:Number(draft.body.characteristics.pret),pending_images:[...draft.body.photos_urls],last_error:null};await d.save(state);
      let response:unknown;
      try{response=await d.call("anunturi","POST",draft.body);}catch(error){
        if(error instanceof PortalError&&["TIMEOUT","NETWORK_ERROR","PORTAL_ERROR"].includes(error.code)){
          let recovered:ZupState|null=null;try{recovered=await recoverZupCreate(state,d);}catch{}
          if(recovered){state=recovered;await d.save(state);try{state=reconcilePhotos(state,await d.call(`anunturi/${recovered.zup_id}`,"GET"));await d.save(state);}catch{}result.push(state);continue;}
          state={...state,status:"unconfirmed",last_error:"Nu am putut confirma crearea la ZUP. Verifică anunțurile contului înainte să reîncerci."};await d.save(state);
          throw new PortalError("INVALID_REQUEST","zup_unconfirmed_create",state.last_error??undefined);
        }
        state={...state,status:"unconfirmed",last_error:error instanceof PortalError?error.message:"ZUP a refuzat crearea."};await d.save(state);throw error;
      }
      const r=zupListing(response);const id=identifier(r?.id);
      if(!id){state={...state,status:"unconfirmed",last_error:"ZUP nu a confirmat ID-ul anunțului. Verifică pe ZUP înainte să reîncerci."};await d.save(state);throw new PortalError("INVALID_REQUEST","zup_missing_id",state.last_error??undefined);}
      state=reconcilePhotos(zupRemoteState({...state,zup_id:id,status:"pending"},response),response);await d.save(state);
      if(state.pending_images.length){state=reconcilePhotos(state,await d.call(`anunturi/${id}`,"GET"));await d.save(state);}
    }else{
      const urls=draft.body.photos_urls;
      // Resolve prior accepted images before sending anything else; never duplicate unknown uploads.
      if(state.pending_images.length){state=reconcilePhotos(state,await d.call(`anunturi/${state.zup_id}`,"GET"));await d.save(state);}
      const removed=state.photos.filter(p=>!urls.includes(p.source));
      if(state.pending_images.some(url=>!urls.includes(url))||removed.some(p=>!p.id))throw new PortalError("VALIDATION_ERROR","zup_photo_ids_missing","ZUP nu a returnat ID-urile fotografiilor scoase. Modificarea galeriei este blocată pentru a evita dublurile; verifică fotografiile în ZUP.");
      const fresh=urls.filter(url=>!state.photos.some(p=>p.source===url)&&!state.pending_images.includes(url));
      // photos_urls at PUT is undocumented: only permit a delta after exact source→ID confirmation.
      if(fresh.length&&(state.pending_images.length||state.photos.length===0))throw new PortalError("VALIDATION_ERROR","zup_photo_semantics_unverified","ZUP nu a confirmat corespondența fotografiilor. Adăugarea este blocată până la verificarea galeriei în ZUP.");
      if(fresh.length&&state.photos.some(p=>urls.includes(p.source)))throw new PortalError("VALIDATION_ERROR","zup_photo_put_unverified","Comportamentul photos_urls la actualizarea ZUP nu a fost verificat. Adăugarea fotografiilor este blocată pentru a nu înlocui galeria existentă.");
      for(const photo of removed){await d.call(`anunturi/${state.zup_id}/photos/${photo.id}`,"DELETE");state={...state,photos:state.photos.filter(p=>p.source!==photo.source)};await d.save(state);}
      if(state.status.toLowerCase()==="inactive"){await d.call(`anunturi/${state.zup_id}/command`,"POST",{command:"activate"});state={...state,status:"pending"};await d.save(state);}
      const {photos_urls:_,...content}=draft.body;
      if(fresh.length){state={...state,pending_images:fresh};await d.save(state);}
      const response=await d.call(`anunturi/${state.zup_id}`,"PUT",{...content,...(fresh.length?{photos_urls:fresh}:{})});
      state=reconcilePhotos(zupRemoteState(state,response),response);state.last_error=null;await d.save(state);
    }
    result.push(state);
  }
  for(const stale of stored.filter(s=>!drafts.some(d=>d.transaction===s.transaction)&&s.status!=="inactive")){result.push(await deactivateZup(stale,d));}
  return result;
}