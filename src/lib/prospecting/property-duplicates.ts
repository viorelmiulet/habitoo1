import { foldText } from './normalize';
export type DuplicateOffer={id:string;title:string;source:string;href:string|null;city:string|null;address:string|null;lat:number|null;lng:number|null;area:number|null;floor:number|null;hashes:string[]};
export type DuplicateMatch={offer:DuplicateOffer;confidence:'medium'|'high';score:number;reasons:string[]};
export function perceptualHash(pixels:Uint8Array|Uint8ClampedArray,width:number,height:number):string|null{
  if(width<9 || height<8 || pixels.length<width*height*4)return null;
  const gray=(x:number,y:number)=>{const at=(Math.min(height-1,Math.floor(y*height/8))*width+Math.min(width-1,Math.floor(x*width/9)))*4;return (pixels[at]??0)*.299+(pixels[at+1]??0)*.587+(pixels[at+2]??0)*.114;};
  let out='';for(let y=0;y<8;y++)for(let x=0;x<8;x+=4){let n=0;for(let k=0;k<4;k++)n=(n<<1)|(gray(x+k,y)>gray(x+k+1,y)?1:0);out+=n.toString(16);}return out;
}
export function hashDistance(a:string,b:string):number{
  if(!/^[a-f0-9]{16}$/i.test(a) || !/^[a-f0-9]{16}$/i.test(b))return 64;
  let n=0;for(let i=0;i<16;i++){let v=parseInt(a[i]??'0',16)^parseInt(b[i]??'0',16);while(v){n+=v&1;v>>=1;}}return n;
}
const validHash=(h:string)=>/^[a-f0-9]{16}$/i.test(h) && h!=='0000000000000000' && h!=='ffffffffffffffff';
export function duplicateMatch(a:DuplicateOffer,b:DuplicateOffer):DuplicateMatch|null{
  if(a.id===b.id || !a.city || !b.city || foldText(a.city)!==foldText(b.city))return null;
  if(a.area!==null && b.area!==null && Math.abs(a.area-b.area)>Math.max(a.area,b.area)*.05)return null;
  if(a.floor!==null && b.floor!==null && a.floor!==b.floor)return null;
  const reasons:string[]=[];let score=0;
  const photo=a.hashes.filter(validHash).some(h=>b.hashes.filter(validHash).some(k=>hashDistance(h,k)<=6));
  if(photo){score+=55;reasons.push('Fotografii cu hash perceptual apropiat');}
  const address=!!a.address && !!b.address && foldText(a.address)===foldText(b.address);
  const coords=a.lat!==null && a.lng!==null && b.lat!==null && b.lng!==null && Math.hypot((a.lat-b.lat)*111000,(a.lng-b.lng)*111000*Math.cos(a.lat*Math.PI/180))<=30;
  if(address){score+=25;reasons.push('Aceeași adresă');}else if(coords){score+=25;reasons.push('Coordonate la cel mult 30 m');}
  if(a.area!==null && b.area!==null){score+=12;reasons.push('Suprafață cu diferență de cel mult 5%');}
  if(a.floor!==null && b.floor!==null){score+=8;reasons.push('Același etaj');}
  if(score<45 || !(photo || address || coords))return null;
  return {offer:b,score:Math.min(score,100),confidence:score>=75?'high':'medium',reasons};
}
/** Star groups: every member must match the anchor; no transitive automatic merges. */
export function groupPossibleDuplicates(offers:DuplicateOffer[]){return offers.flatMap((anchor,i)=>{const members=offers.slice(i+1).flatMap(o=>{const match=duplicateMatch(anchor,o);return match?[match]:[];});return members.length?[{anchor,members}]:[];});}