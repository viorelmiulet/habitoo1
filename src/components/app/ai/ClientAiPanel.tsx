import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mic, Square, Sparkles, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActivityDialog } from "@/components/app/ActivityDialog";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { useCurrentUser } from "@/hooks/use-session";
import { summarizeContact, analyzeDictatedCall, loadCallRequests, confirmCallRequest } from "@/lib/ai/client-assist/client-assist.functions";
import { recordCall, withEphemeralAudio, type CallRecorder } from "@/lib/ai/client-assist/recording";
import type { AnalyzedCall, ClientEntity } from "@/lib/ai/client-assist/schema";

type ActivityDraft = { kind: "call" | "followup"; title: string; description: string; status: "done" | "planned"; startsAt?: Date };
export function ClientAiPanel({ entity }: { entity: ClientEntity }) {
  const { isEnabled, isLoading } = useAiFeatures();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const enabled = !isLoading && isEnabled("ai_crm");
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const summarize = useServerFn(summarizeContact);
  const analyze = useServerFn(analyzeDictatedCall);
  const loadRequests = useServerFn(loadCallRequests);
  const confirmRequest = useServerFn(confirmCallRequest);
  const [summary, setSummary] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AnalyzedCall | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [requestId, setRequestId] = useState("new");
  const [activity, setActivity] = useState<ActivityDraft | null>(null);
  const [followupDate, setFollowupDate] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recordStarting, setRecordStarting] = useState(false);
  const [activityUsed, setActivityUsed] = useState(false);
  const [followupUsed, setFollowupUsed] = useState(false);
  const [requestUsed, setRequestUsed] = useState(false);
  const recorder = useRef<CallRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const requestLock = useRef(false);
  const recordLock = useRef(false);
  const { data: requests = [] } = useQuery({ queryKey: ["call-requests", entity.kind, entity.id], queryFn: () => loadRequests({ data: entity }), enabled: enabled && proposal !== null, retry: false });
  useEffect(() => { if (entity.kind === "lead" && requests[0]) setRequestId(requests[0].id); }, [requests, entity.kind]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); void recorder.current?.cancel(); recorder.current = null; }; }, []);
  useEffect(() => {
    if (enabled) return;
    if (timer.current) clearTimeout(timer.current);
    void recorder.current?.cancel(); recorder.current = null;
    setRecording(false); setProposal(null); setSummary(null); setActivity(null);
  }, [enabled]);
  const refresh = () => {
    for (const key of [["contact", entity.id], ["lead-detail", entity.id], ["leads"], ["requests"], ["activities"], ["call-requests", entity.kind, entity.id]]) void qc.invalidateQueries({ queryKey: key });
  };
  const summaryMutation = useMutation({ mutationFn: () => summarize({ data: { id: entity.id } }), onSuccess: result => { if (!enabledRef.current) return; if (result.ok) setSummary(result.value); else toast.error(result.message); }, onError: () => toast.error("Rezumatul nu a putut fi realizat.") });
  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!proposal || requestLock.current) return null;
      requestLock.current = true;
      try { return await confirmRequest({ data: { entity, requestId: requestId === "new" ? null : requestId, source: proposal.transcript, request: Object.fromEntries(proposal.changes.map(c => [c.field, c.value])), fields: selected } }); }
      finally { requestLock.current = false; }
    },
    onSuccess: result => { if (!result) return; if (!result.ok) { toast.error(result.message); return; } setRequestUsed(true); refresh(); toast.success("Cererea a fost confirmată și salvată."); },
    onError: () => toast.error("Cererea nu a fost salvată."),
  });
  const cancelRecording = async () => {
    if (timer.current) clearTimeout(timer.current);
    const current = recorder.current; recorder.current = null;
    await current?.cancel(); setRecording(false);
  };
  const finishRecording = async () => {
    const current = recorder.current;
    if (!current) return;
    recorder.current = null;
    if (timer.current) clearTimeout(timer.current);
    setRecording(false); setBusy(true);
    try {
      let audio: Blob | null = await current.stop();
      try {
        const result = await withEphemeralAudio(audio, value => analyze({ data: { entity, audio: value } }));
        if (!mounted.current || !enabledRef.current) return;
        if (result.ok) { setProposal(result.value); setSelected([]); setActivityUsed(false); setFollowupUsed(false); setRequestUsed(false); setFollowupDate(result.value.followup?.date ?? ""); }
        else toast.error(result.message);
      } finally { audio = null; }
    } catch (error) { if (mounted.current) toast.error(error instanceof Error ? error.message : "Înregistrarea nu a putut fi analizată."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const startRecording = async () => {
    if (recorder.current || recordLock.current) return;
    recordLock.current = true;
    setRecordStarting(true);
    try {
      const current = await recordCall();
      if (!mounted.current || !enabledRef.current) { await current.cancel(); return; }
      recorder.current = current; setRecording(true);
      timer.current = setTimeout(() => { void finishRecording(); }, 120000);
    } catch { toast.error("Microfonul nu este disponibil. Verifică permisiunea de înregistrare."); }
    finally { recordLock.current = false; if (mounted.current) setRecordStarting(false); }
  };
  if (!enabled) return null;
  return <section aria-label="Client AI" className="space-y-4 border-y border-border py-4">
    <div className="flex flex-wrap items-center gap-2">
      <Sparkles className="size-4 text-primary" aria-hidden /><h2 className="text-sm font-semibold">Habitoo AI</h2>
      {entity.kind === "contact" && <Button size="sm" variant="outline" disabled={summaryMutation.isPending} onClick={() => summaryMutation.mutate()}>{summary ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}{summaryMutation.isPending ? "Se pregătește…" : summary ? "Reîmprospătează rezumatul" : "Rezumatul clientului"}</Button>}
      <Button size="sm" title="Notiță dictată — maximum 2 minute" variant={recording ? "destructive" : "outline"} disabled={busy || recordStarting} onClick={() => { void (recording ? finishRecording() : startRecording()); }}>{recording ? <Square className="size-4" /> : <Mic className="size-4" />}{busy ? "Se transcrie…" : recording ? "Oprește și transcrie" : "Dictează notița de apel"}</Button>
      {recording && <Button size="icon" variant="ghost" title="Anulează înregistrarea" aria-label="Anulează înregistrarea" onClick={() => { void cancelRecording(); }}><X className="size-4" /></Button>}
    </div>
    {summary && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{summary}</p>}
    {proposal && <div className="space-y-4">
      <div className="space-y-2"><Label>Transcript</Label><Textarea aria-label="Transcript" readOnly value={proposal.transcript} rows={4} /></div>
      {proposal.activity && !activityUsed && <div className="space-y-2"><h3 className="text-sm font-semibold">Activitate propusă</h3><p className="break-words text-sm">{proposal.activity}</p><div className="flex gap-2"><Button size="sm" onClick={() => setActivity({ kind: "call", title: proposal.activity ?? "Apel", description: proposal.transcript, status: "done" })}>Revizuiește activitatea</Button><Button size="sm" variant="ghost" onClick={() => setActivityUsed(true)}>Ignoră</Button></div></div>}
      {proposal.followup && !followupUsed && <div className="space-y-2"><h3 className="text-sm font-semibold">Follow-up propus</h3><p className="break-words text-sm">{proposal.followup.excerpt}</p><Input type="date" aria-label="Data follow-up" value={followupDate} onChange={e => setFollowupDate(e.target.value)} /><div className="flex gap-2"><Button size="sm" disabled={!followupDate} onClick={() => setActivity({ kind: "followup", title: proposal.followup?.excerpt ?? "Follow-up", description: proposal.followup?.excerpt ?? "", status: "planned", startsAt: new Date(`${followupDate}T09:00:00`) })}>Revizuiește follow-up</Button><Button size="sm" variant="ghost" onClick={() => setFollowupUsed(true)}>Ignoră</Button></div></div>}
      {proposal.changes.length > 0 && !requestUsed && <div className="space-y-3"><h3 className="text-sm font-semibold">Modificări de cerere</h3><Select value={requestId} onValueChange={setRequestId}><SelectTrigger aria-label="Cererea de completat"><SelectValue /></SelectTrigger><SelectContent>{!(entity.kind === "lead" && requests.length) && <SelectItem value="new">Cerere nouă</SelectItem>}{requests.map(r => <SelectItem key={r.id} value={r.id}>{r.title || "Cerere existentă"}</SelectItem>)}</SelectContent></Select>
        {proposal.changes.map(change => <label key={change.field} className="flex items-start gap-2 text-sm"><Checkbox checked={selected.includes(change.field)} onCheckedChange={checked => setSelected(s => checked ? [...s, change.field] : s.filter(f => f !== change.field))} /><span className="min-w-0 break-words">{change.text}<span className="mt-1 block text-xs text-muted-foreground">„{change.evidence}”</span></span></label>)}
        <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!selected.length || requestMutation.isPending} onClick={() => requestMutation.mutate()}>Confirmă și salvează cererea</Button><Button size="sm" variant="ghost" onClick={() => setRequestUsed(true)}>Ignoră cererea</Button></div>
      </div>}
      <Button variant="ghost" size="sm" onClick={() => setProposal(null)}>Închide propunerile</Button>
    </div>}
    {activity && <ActivityDialog open onOpenChange={open => { if (!open) setActivity(null); }} orgId={proposal?.organizationId} userId={user?.userId} defaults={{ ...activity, ...(entity.kind === "contact" ? { contactId: entity.id } : { leadId: entity.id }) }} onCreated={() => { if (activity.kind === "call") setActivityUsed(true); else setFollowupUsed(true); refresh(); }} />}
  </section>;
}