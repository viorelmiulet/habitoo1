import { useRef } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { ArrowLeft,ArrowRight,Star,Trash2,Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { compressImage,MEDIA_BUCKET,uploadToBucket } from '@/lib/storage';
import { developmentPhotos } from '@/lib/developments';
import { toast } from '@/components/ui/sonner';
export function DevelopmentGallery({id,orgId,editable}:{id:string;orgId:string;editable:boolean}) {
 const input=useRef<HTMLInputElement>(null);const qc=useQueryClient();
 const {data:photos=[]}=useQuery({queryKey:['development-photos',id],queryFn:()=>developmentPhotos(id)});
 const mutate=useMutation({mutationFn:async(action:{files?:File[];order?:string[];remove?:string})=>{
 if(action.files) for(const [index,file] of action.files.entries()) {
 const {blob,width,height}=await compressImage(file);const path=`${orgId}/developments/${id}/${crypto.randomUUID()}.jpg`;
 await uploadToBucket(MEDIA_BUCKET,path,blob,'image/jpeg');
 const {error}=await supabase.from('development_images').insert({development_id:id,organization_id:orgId,url:path,storage_path:path,width,height,position:photos.length+index,is_primary:photos.length===0&&index===0});
 if(error){await supabase.storage.from(MEDIA_BUCKET).remove([path]);throw error;}
 }
 if(action.order){const {error}=await supabase.rpc('reorder_development_images',{_id:id,_images:action.order});if(error)throw error;}
 if(action.remove){const image=photos.find(p=>p.id===action.remove);if(!image)return;const {error}=await supabase.from('development_images').delete().eq('id',image.id);if(error)throw error;await supabase.storage.from(MEDIA_BUCKET).remove([image.storage_path]);const ids=photos.filter(p=>p.id!==image.id).map(p=>p.id);const reordered=await supabase.rpc('reorder_development_images',{_id:id,_images:ids});if(reordered.error)throw reordered.error;}
 },onSuccess:()=>{void qc.invalidateQueries({queryKey:['development-photos']});void qc.invalidateQueries({queryKey:['developments-covers']});},onError:()=>toast.error('Fotografiile nu au putut fi actualizate.')});
 function move(index:number,delta:number){const order=photos.map(p=>p.id);const target=index+delta;if(target<0||target>=order.length)return;[order[index],order[target]]=[order[target],order[index]];mutate.mutate({order});}
 return <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-display text-lg">Fotografii <span className="font-mono text-sm">{photos.length}</span></h2>{editable?<Button type="button" variant="outline" disabled={mutate.isPending} onClick={()=>input.current?.click()}><Upload/>Încarcă fotografii</Button>:null}</div><input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{mutate.mutate({files:Array.from(e.target.files??[])});e.target.value='';}}/><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{photos.map((p,index)=><article key={p.id} className="overflow-hidden rounded-lg border border-border bg-card"><div className="relative aspect-[4/3]">{p.src?<img src={p.src} alt={`Fotografie ${index+1}`} className="h-full w-full object-cover"/>:null}<span className="absolute left-2 top-2 rounded bg-card px-2 text-xs font-mono">{index+1}{p.is_primary?' · COPERTĂ':''}</span></div>{editable?<div className="flex justify-between p-1">{[[ArrowLeft,'Mută înainte',()=>move(index,-1),index===0],[Star,'Alege coperta',()=>mutate.mutate({order:[p.id,...photos.filter(x=>x.id!==p.id).map(x=>x.id)]}),p.is_primary],[ArrowRight,'Mută după',()=>move(index,1),index===photos.length-1],[Trash2,'Șterge fotografia',()=>mutate.mutate({remove:p.id}),false]].map(([Icon,label,action,disabled])=>{const C=Icon as typeof Star;return <Button key={String(label)} type="button" size="icon" variant="ghost" title={String(label)} aria-label={String(label)} disabled={mutate.isPending||Boolean(disabled)} onClick={action as ()=>void}><C className="size-4"/></Button>;})}</div>:null}</article>)}</div>{photos.length===0?<p className="text-sm text-muted-foreground">Nicio fotografie.</p>:null}</section>;
}
