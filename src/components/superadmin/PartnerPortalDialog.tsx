import {useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {savePartnerPortal,partnerPortalSchema} from "@/lib/partner-api/admin.functions";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Checkbox} from "@/components/ui/checkbox";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import type {z} from "zod";
export type PartnerForm=z.infer<typeof partnerPortalSchema>;
export function PartnerPortalDialog({initial,onClose,onSaved}:{initial:PartnerForm|null;onClose:()=>void;onSaved:()=>void}){
  const save=useServerFn(savePartnerPortal);
  const [form,setForm]=useState<PartnerForm>(initial??{slug:"",display_name:"",website:"",logo_path:null,xml_enabled:false,show_public:false,active:true,integration_mode:"api",rate_limit_per_minute:120});
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError("");let path:string|null=null;
    try {const input=partnerPortalSchema.parse(form);
      if(file){if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>2097152)throw new Error("Alege PNG, JPG sau WebP, maximum 2 MB.");const image=await createImageBitmap(file);image.close();path=`${input.slug}/${crypto.randomUUID()}.${file.type==="image/jpeg"?"jpg":file.type==="image/webp"?"webp":"png"}`;const r=await supabase.storage.from("feed-portal-logos").upload(path,file,{contentType:file.type});if(r.error)throw new Error("Logo-ul nu a putut fi încărcat.");}
      await save({data:{...input,logo_path:path??input.logo_path,editing:Boolean(initial)}});onSaved();onClose();
    }catch(e){if(path)await supabase.storage.from("feed-portal-logos").remove([path]);setError(e instanceof Error?e.message:"Salvarea a eșuat.");}finally{setBusy(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{initial?"Editează portalul":"Adaugă portal API"}</DialogTitle></DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      <Label htmlFor="partner-name">Nume</Label><Input id="partner-name" required maxLength={100} value={form.display_name} onChange={e=>setForm({...form,display_name:e.target.value})}/>
      <Label htmlFor="partner-slug">Identificator</Label><Input id="partner-slug" required readOnly={Boolean(initial)} value={form.slug} pattern="[a-z][a-z0-9-]{1,39}" maxLength={40} onChange={e=>setForm({...form,slug:e.target.value})}/>
      <Label htmlFor="partner-site">Site</Label><Input id="partner-site" type="url" required value={form.website} onChange={e=>setForm({...form,website:e.target.value})}/>
      <Label htmlFor="partner-logo">Logo</Label><Input id="partner-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setFile(e.target.files?.[0]??null)}/>
      <Label htmlFor="partner-mode">Mod de integrare</Label><Select value={form.integration_mode} onValueChange={v=>{if(v==="feed"||v==="api"||v==="both")setForm({...form,integration_mode:v});}}><SelectTrigger id="partner-mode"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="feed">Feed</SelectItem><SelectItem value="api">API</SelectItem><SelectItem value="both">Feed + API</SelectItem></SelectContent></Select>
      <Label htmlFor="partner-limit">Cereri pe minut / cheie</Label><Input id="partner-limit" type="number" min={1} max={100000} required value={form.rate_limit_per_minute} onChange={e=>setForm({...form,rate_limit_per_minute:Number(e.target.value)})}/>
      <Label className="flex items-center gap-2"><Checkbox checked={form.active} onCheckedChange={v=>setForm({...form,active:v===true})}/>Activ</Label>
      <Label className="flex items-center gap-2"><Checkbox checked={form.xml_enabled} onCheckedChange={v=>setForm({...form,xml_enabled:v===true})}/>XML Kyero</Label>
      <Label className="flex items-center gap-2"><Checkbox checked={form.show_public} onCheckedChange={v=>setForm({...form,show_public:v===true})}/>Afișează public</Label>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Renunță</Button><Button type="submit" disabled={busy}>{busy?"Se salvează…":"Salvează"}</Button></div>
    </form></DialogContent></Dialog>;
}