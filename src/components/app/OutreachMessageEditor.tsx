import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { getOutreachCampaign, saveOutreachCampaign, sendOutreachTest } from "@/lib/outreach.functions";
import { outreachMergeFields, renderCampaign, validateCampaign, type CampaignInput } from "@/lib/outreach-message";

const empty: CampaignInput = { name: "", subject: "", body_text: "", sender_name: "Habitoo", footer_text: "", status: "draft" };

export function OutreachMessageEditor({ listId }: { listId: string }) {
  const load = useServerFn(getOutreachCampaign);
  const save = useServerFn(saveOutreachCampaign);
  const sendTest = useServerFn(sendOutreachTest);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["outreach-campaign", listId], queryFn: () => load({ data: { listId } }) });
  const [form, setForm] = useState<CampaignInput>(empty);
  const [testOpen, setTestOpen] = useState(false);
  const [to, setTo] = useState("");
  useEffect(() => { const c = query.data?.campaign; if (c) setForm({ name: c.name, subject: c.subject, body_text: c.body_text, sender_name: c.sender_name, footer_text: c.footer_text, status: c.status }); }, [query.data?.campaign]);
  const validation = validateCampaign(form);
  const recipient = query.data?.recipient;
  const preview = useMemo(() => recipient ? renderCampaign(form, recipient) : null, [form, recipient]);
  const saveM = useMutation({ mutationFn: () => save({ data: { listId, id: query.data?.campaign?.id ?? null, campaign: form } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["outreach-campaign", listId] }) });
  const testM = useMutation({ mutationFn: async () => { const r = await sendTest({ data: { campaignId: query.data!.campaign!.id, to } }); if (!r.ok) throw new Error(r.error); return r; } });
  if (query.isLoading) return <InlineLoading />;
  if (query.error) return <QueryError error={query.error} onRetry={() => query.refetch()} />;
  const set = (k: keyof CampaignInput) => (e: { target: { value: string } }) => { saveM.reset(); setForm(f => ({ ...f, [k]: e.target.value })); };
  const savedId = query.data?.campaign?.id;
  return <div className="grid gap-6 lg:grid-cols-2">
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (validation.ok) saveM.mutate(); }}>
      <div className="space-y-1.5"><Label htmlFor="oc-name">Numele campaniei</Label><Input id="oc-name" maxLength={160} value={form.name} onChange={set("name")} /></div>
      <div className="space-y-1.5"><Label htmlFor="oc-subject">Subiect</Label><Input id="oc-subject" maxLength={200} value={form.subject} onChange={set("subject")} /></div>
      <div className="space-y-1.5"><Label htmlFor="oc-body">Mesaj (text simplu)</Label><Textarea id="oc-body" rows={12} maxLength={20000} value={form.body_text} onChange={set("body_text")} />
        <p className="text-xs text-muted-foreground">Câmpuri disponibile: {outreachMergeFields.map(f => `{{${f}}}`).join(", ")}</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="oc-sender">Nume expeditor</Label><Input id="oc-sender" maxLength={80} value={form.sender_name} onChange={set("sender_name")} /></div>
        <div className="space-y-1.5"><Label>Stare</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v === "ready" ? "ready" : "draft" }))}><SelectTrigger aria-label="Stare"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Ciornă</SelectItem><SelectItem value="ready">Gata</SelectItem></SelectContent></Select></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="oc-footer">Text de subsol</Label><Textarea id="oc-footer" rows={3} maxLength={2000} value={form.footer_text} onChange={set("footer_text")} />
        <p className="text-xs text-muted-foreground">Sub acest text se adaugă automat „Dezabonare: {"{{unsubscribe_url}}"}”.</p></div>
      {!validation.ok ? <p role="alert" className="text-sm text-destructive">{validation.error}</p> : null}
      {saveM.error ? <p role="alert" className="text-sm text-destructive">{saveM.error.message}</p> : saveM.isSuccess ? <p className="text-sm text-muted-foreground">Mesajul a fost salvat.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!validation.ok || saveM.isPending}><Save className="size-4" />{saveM.isPending ? "Se salvează…" : "Salvează"}</Button>
        <Button type="button" variant="outline" disabled={!savedId || !recipient} onClick={() => { testM.reset(); setTestOpen(true); }}><Send className="size-4" />Trimite test</Button>
      </div>
      {!savedId ? <p className="text-xs text-muted-foreground">Salvează mesajul înainte de trimiterea de test. Testul folosește versiunea salvată.</p> : null}
    </form>
    <section aria-label="Previzualizare" className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="font-semibold">Previzualizare</h2>
      {!preview ? <p className="text-sm text-muted-foreground">Lista nu are încă destinatari.</p> : <>
        <dl className="space-y-1 text-sm"><div><dt className="inline text-muted-foreground">De la: </dt><dd className="inline break-all">{preview.from}</dd></div><div><dt className="inline text-muted-foreground">Către: </dt><dd className="inline break-all">{recipient?.email}</dd></div><div><dt className="inline text-muted-foreground">Subiect: </dt><dd className="inline font-medium">{preview.subject}</dd></div></dl>
        <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-sans text-sm">{preview.text}</pre>
      </>}
    </section>
    <Dialog open={testOpen} onOpenChange={o => { if (!testM.isPending) setTestOpen(o); }}><DialogContent>
      <DialogHeader><DialogTitle>Trimite test</DialogTitle><DialogDescription>Mesajul salvat se trimite doar la adresa de mai jos, cu datele primului destinatar. Stările destinatarilor nu se schimbă.</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); testM.mutate(); }}>
        <Label htmlFor="oc-to">Adresă de test</Label><Input id="oc-to" type="email" required maxLength={254} value={to} onChange={e => setTo(e.target.value)} />
        {testM.error ? <p role="alert" className="text-sm text-destructive">{testM.error.message}</p> : testM.isSuccess ? <p className="text-sm text-muted-foreground">Mesajul de test a fost trimis.</p> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTestOpen(false)} disabled={testM.isPending}>Închide</Button><Button type="submit" disabled={testM.isPending || !to}><Send className="size-4" />{testM.isPending ? "Se trimite…" : "Trimite"}</Button></div>
      </form>
    </DialogContent></Dialog>
  </div>;
}
