import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { getOutreachCampaign, getOutreachProgress, controlOutreachCampaign, outreachSettingsSchema } from "@/lib/outreach.functions";
import { outreachStatuses, outreachStatusLabels } from "@/lib/outreach";
import { estimateDays } from "@/lib/outreach-send";

const campaignStatusLabels: Record<string, string> = { draft: "Ciornă", ready: "Gata", sending: "În trimitere", paused: "În pauză", completed: "Finalizată" };

export function OutreachSendingPanel({ listId }: { listId: string }) {
  const loadCampaign = useServerFn(getOutreachCampaign);
  const loadProgress = useServerFn(getOutreachProgress);
  const control = useServerFn(controlOutreachCampaign);
  const qc = useQueryClient();
  const cq = useQuery({ queryKey: ["outreach-campaign", listId], queryFn: () => loadCampaign({ data: { listId } }) });
  const campaignId = cq.data?.campaign?.id;
  const pq = useQuery({ queryKey: ["outreach-progress", campaignId], enabled: Boolean(campaignId), queryFn: () => loadProgress({ data: { campaignId: campaignId! } }), refetchInterval: 15_000 });
  const p = pq.data;
  const [form, setForm] = useState({ daily_limit: "100", window_start: "09:00", window_end: "17:00", weekdays_only: true, delay_seconds: "20" });
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (p) setForm({ daily_limit: String(p.daily_limit), window_start: p.window_start, window_end: p.window_end, weekdays_only: p.weekdays_only, delay_seconds: String(p.delay_seconds) }); }, [p?.daily_limit, p?.window_start, p?.window_end, p?.weekdays_only, p?.delay_seconds]);
  const settings = outreachSettingsSchema.safeParse({ ...form, daily_limit: Number(form.daily_limit), delay_seconds: Number(form.delay_seconds) });
  const m = useMutation({
    mutationFn: (action: "start" | "pause" | "resume" | "settings") => control({ data: { campaignId: campaignId!, action, ...(action === "settings" && settings.success ? { settings: settings.data } : {}) } }),
    onSuccess: () => { setConfirm(false); qc.invalidateQueries({ queryKey: ["outreach-progress"] }); qc.invalidateQueries({ queryKey: ["outreach-campaign", listId] }); qc.invalidateQueries({ queryKey: ["outreach"] }); },
  });
  if (cq.isLoading || pq.isLoading) return <InlineLoading />;
  if (cq.error || pq.error) return <QueryError error={cq.error ?? pq.error} onRetry={() => { cq.refetch(); pq.refetch(); }} />;
  if (!campaignId || !p) return <p className="text-sm text-muted-foreground">Salvează mai întâi mesajul campaniei în fila „Mesaj”.</p>;
  const pending = p.counts.pending ?? 0;
  const editable = p.status === "draft" || p.status === "ready" || p.status === "paused";
  const days = settings.success ? estimateDays(pending, settings.data.daily_limit, settings.data.window_start, settings.data.window_end, settings.data.delay_seconds) : 0;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { m.reset(); setForm(f => ({ ...f, [k]: e.target.value })); };
  return <div className="grid gap-6 lg:grid-cols-2">
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-label="Setări trimitere">
      <h2 className="font-semibold">Setări</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="os-limit">Limită zilnică (max. 1500)</Label><Input id="os-limit" type="number" min={1} max={1500} disabled={!editable} value={form.daily_limit} onChange={set("daily_limit")} /></div>
        <div className="space-y-1.5"><Label htmlFor="os-delay">Pauză între mesaje (secunde)</Label><Input id="os-delay" type="number" min={5} max={3600} disabled={!editable} value={form.delay_seconds} onChange={set("delay_seconds")} /></div>
        <div className="space-y-1.5"><Label htmlFor="os-start">Început interval (ora României)</Label><Input id="os-start" type="time" disabled={!editable} value={form.window_start} onChange={set("window_start")} /></div>
        <div className="space-y-1.5"><Label htmlFor="os-end">Sfârșit interval</Label><Input id="os-end" type="time" disabled={!editable} value={form.window_end} onChange={set("window_end")} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch id="os-weekdays" disabled={!editable} checked={form.weekdays_only} onCheckedChange={v => setForm(f => ({ ...f, weekdays_only: v }))} /><Label htmlFor="os-weekdays">Doar în zilele lucrătoare</Label></div>
      {!settings.success ? <p role="alert" className="text-sm text-destructive">{settings.error.issues[0]?.message}</p> : null}
      <Button variant="outline" disabled={!editable || !settings.success || m.isPending} onClick={() => m.mutate("settings")}><Save className="size-4" />Salvează setările</Button>
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {p.status === "ready" ? <Button disabled={m.isPending || pending === 0} onClick={() => { m.reset(); setConfirm(true); }}><Send className="size-4" />Pornește trimiterea</Button> : null}
        {p.status === "sending" ? <Button variant="outline" disabled={m.isPending} onClick={() => m.mutate("pause")}><Pause className="size-4" />Pauză</Button> : null}
        {p.status === "paused" ? <Button disabled={m.isPending} onClick={() => m.mutate("resume")}><Play className="size-4" />Reia</Button> : null}
        {p.status === "draft" ? <p className="text-sm text-muted-foreground">Marchează mesajul „Gata” în fila „Mesaj” pentru a putea porni trimiterea.</p> : null}
      </div>
      {m.error && !confirm ? <p role="alert" className="text-sm text-destructive">{m.error.message}</p> : null}
    </section>
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-label="Progres">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Progres</h2><span className="rounded-md bg-muted px-2 py-1 text-xs">{campaignStatusLabels[p.status] ?? p.status}</span></div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{outreachStatuses.map(s => <div key={s} className="rounded-md bg-muted p-3"><dt className="text-xs text-muted-foreground">{outreachStatusLabels[s]}</dt><dd className="text-lg font-semibold">{p.counts[s] ?? 0}</dd></div>)}</dl>
      <dl className="space-y-1 text-sm">
        <div><dt className="inline text-muted-foreground">Trimise azi (inclusiv eșuate): </dt><dd className="inline font-medium">{p.sent_today} / {p.daily_limit}</dd></div>
        <div><dt className="inline text-muted-foreground">Ultima trimitere: </dt><dd className="inline">{p.last_sent_at ? new Date(p.last_sent_at).toLocaleString("ro-RO") : "—"}</dd></div>
        <div><dt className="inline text-muted-foreground">Ultima eroare: </dt><dd className="inline break-words">{p.last_error || "—"}</dd></div>
        {p.paused_reason && p.status === "paused" ? <div><dt className="inline text-muted-foreground">Motiv pauză: </dt><dd className="inline break-words text-destructive">{p.paused_reason}</dd></div> : null}
      </dl>
    </section>
    <Dialog open={confirm} onOpenChange={o => { if (!m.isPending) setConfirm(o); }}><DialogContent>
      <DialogHeader><DialogTitle>Pornești trimiterea?</DialogTitle><DialogDescription>Mesajele pleacă de pe contact@habitoo.ro, în intervalul {form.window_start}–{form.window_end}{form.weekdays_only ? ", doar în zilele lucrătoare" : ""}.</DialogDescription></DialogHeader>
      <dl className="space-y-1 text-sm"><div><dt className="inline text-muted-foreground">Destinatari: </dt><dd className="inline font-medium">{pending}</dd></div><div><dt className="inline text-muted-foreground">Limită zilnică: </dt><dd className="inline font-medium">{p.daily_limit}</dd></div><div><dt className="inline text-muted-foreground">Durată estimată: </dt><dd className="inline font-medium">{estimateDays(pending, p.daily_limit, p.window_start, p.window_end, p.delay_seconds)} zile de trimitere</dd></div></dl>
      {settings.success && days !== estimateDays(pending, p.daily_limit, p.window_start, p.window_end, p.delay_seconds) ? <p className="text-xs text-muted-foreground">Setările nesalvate nu se aplică. Salvează-le înainte de pornire.</p> : null}
      {m.error ? <p role="alert" className="text-sm text-destructive">{m.error.message}</p> : null}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={m.isPending} onClick={() => setConfirm(false)}>Renunță</Button><Button disabled={m.isPending} onClick={() => m.mutate("start")}><Send className="size-4" />{m.isPending ? "Se pornește…" : "Pornește"}</Button></div>
    </DialogContent></Dialog>
  </div>;
}
