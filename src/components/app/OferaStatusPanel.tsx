import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { enqueuePortalPublishJobs } from "@/lib/portals.functions";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { oferaExpired, OFERA_UNCONFIRMED } from "@/lib/portals/ofera/publish";
export function OferaStatusPanel({ propertyId, organizationId, canManage, busy, promoted }: { propertyId: string; organizationId?: string; canManage: boolean; busy: boolean; promoted: boolean }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const enqueue = useServerFn(enqueuePortalPublishJobs);
  const key = ["ofera-listing-states", propertyId, organizationId];
  const states = useQuery({ queryKey: key, queryFn: async () => {
    let q = supabase.from("ofera_listings").select("transaction,status,valid_until,last_message,last_log_track_id").eq("property_id", propertyId);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q;
    if (error) throw new Error("Starea Ofera nu a putut fi citită.");
    return data;
  }, refetchInterval: busy ? 2000 : 15000 });
  const run = async (intent?: "activate" | "resend") => {
    if (sending || busy) return;
    setSending(true);
    try {
      const out = await enqueue({ data: { propertyId, ...(organizationId ? { organizationId } : {}), selections: [{ portalId: "ofera", enabled: true, promoted, ...(intent ? { oferaIntent: intent } : {}) }], syncExisting: true } });
      const r = out.results.find(r => r.portalId === "ofera");
      if (r?.queued) { toast.success("Ofera: acțiunea a fost pusă în coadă."); await qc.invalidateQueries({ queryKey: ["portal-publish-jobs"] }); } else toast.error(r?.message ?? "Acțiunea Ofera nu a putut fi pornită.");
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Acțiunea Ofera nu a reușit."); } finally { setSending(false); }
  };
  return <div className="pointer-events-auto mt-2 space-y-2 text-xs">
    {states.error ? <p role="alert" className="text-destructive">{states.error.message}</p> : null}
    {(states.data ?? []).filter(s => s.status !== "deleted").map(s => <div key={s.transaction} className="space-y-1">
      <p className="font-medium">{s.transaction === "sale" ? "Vânzare" : "Închiriere"}</p>
      {s.valid_until ? <p>{oferaExpired(s) ? "Expirat la Ofera — republică pentru reactivare" : `Valabil până la ${s.valid_until.split("-").reverse().join(".")}`}</p> : null}
      {s.last_message && s.status !== "active" ? <p className="text-destructive">{s.last_message}</p> : null}
      {s.last_log_track_id ? <p className="text-muted-foreground">Referință Ofera: {s.last_log_track_id}</p> : null}
      {s.status === "pending_activation" && canManage ? <Button type="button" size="sm" variant="outline" disabled={sending || busy} onClick={() => void run("activate")}>Activează la Ofera</Button> : null}
      {s.status === "unconfirmed" && canManage ? <><p>{OFERA_UNCONFIRMED}</p><Button type="button" size="sm" variant="outline" disabled={sending || busy} onClick={() => setConfirm(true)}>Retrimite</Button></> : null}
      {oferaExpired(s) && s.status !== "unconfirmed" && canManage ? <Button type="button" size="sm" variant="outline" disabled={sending || busy} onClick={() => void run()}>Republică la Ofera</Button> : null}
    </div>)}
    <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Retrimiți anunțul la Ofera?</AlertDialogTitle><AlertDialogDescription>Verifică întâi pe Ofera.ro dacă anunțul a fost creat. Retrimiterea poate crea un duplicat.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Anulează</AlertDialogCancel><AlertDialogAction onClick={() => void run("resend")}>Am verificat — retrimite</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}