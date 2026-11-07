import {useState} from "react";
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {RotateCcw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from "@/components/ui/alert-dialog";
import {toast} from "@/components/ui/sonner";
import {partnerSandboxActivity,resetPartnerSandbox} from "@/lib/partner-api/sandbox.functions";
export function PartnerSandboxPanel({portal,enabled}:{portal:string;enabled:boolean}){
  const [confirm,setConfirm]=useState(false),qc=useQueryClient();
  const read=useServerFn(partnerSandboxActivity),reset=useServerFn(resetPartnerSandbox);
  const activity=useQuery({queryKey:["partner-sandbox-activity",portal],queryFn:()=>read({data:{portal}})});
  const mutation=useMutation({mutationFn:()=>reset({data:{portal}}),onSuccess:()=>{setConfirm(false);qc.invalidateQueries({queryKey:["partner-sandbox-activity",portal]});toast.success("Datele demo au fost resetate.");},onError:()=>toast.error("Resetarea datelor demo a eșuat.")});
  return <section className="mt-4 border-t pt-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Mediu de test · Demo</h3><Button size="sm" variant="outline" disabled={!enabled||mutation.isPending} onClick={()=>setConfirm(true)}><RotateCcw/>Resetează datele demo</Button></div>
    {activity.isError?<p role="alert" className="text-xs text-destructive">Activitatea nu poate fi încărcată.</p>:activity.isPending?<p className="text-xs text-muted-foreground">Se încarcă…</p>:activity.data.length?<ul className="space-y-2">{activity.data.map(row=><li key={row.id} className="text-xs"><div className="break-all font-mono">{row.method} {row.path} · {row.status}</div><time className="text-muted-foreground">{new Date(row.created_at).toLocaleString("ro-RO")}</time></li>)}</ul>:<p className="text-xs text-muted-foreground">Nicio cerere de test încă.</p>}
    <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Resetezi datele demo?</AlertDialogTitle><AlertDialogDescription>Se restaurează cele 12 anunțuri și cei 2 agenți demo pentru acest portal. Lead-urile, mesajele și statisticile de test se șterg; datele reale rămân neschimbate.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending}>Renunță</AlertDialogCancel><AlertDialogAction disabled={mutation.isPending} onClick={e=>{e.preventDefault();mutation.mutate();}}>Resetează</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}