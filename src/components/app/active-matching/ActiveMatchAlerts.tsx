import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, EyeOff, Mail, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/app/StatusBadge";
import { getMatchAlertDraft, setMatchAlertStatus, type AlertDraftDto } from "@/lib/active-matching/active-matching.functions";
import { mailtoUrl, whatsappUrl, type AlertStatus } from "@/lib/active-matching/plan";
import { matchTone } from "@/lib/matching";

type AlertRow = {
  id: string; request_id: string; property_id: string; score: number; reasons: string[]; misses: string[];
  trigger: string; status: AlertStatus; created_at: string; notified_at: string | null;
  property: { title: string; city: string | null } | null;
  request: { title: string } | null;
  contact: { first_name: string; last_name: string } | null;
};

export const STATUS_LABEL: Record<AlertStatus, string> = { new: "Nou", sent: "Trimis", ignored: "Ignorat" };

export function useMatchAlerts(filter: { status: AlertStatus | "all"; requestId?: string }) {
  return useQuery({
    queryKey: ["active-match-alerts", filter],
    queryFn: async () => {
      let q = supabase.from("active_match_alerts")
        .select("id,request_id,property_id,score,reasons,misses,trigger,status,created_at,notified_at,property:properties(title,city),request:requests(title),contact:contacts(first_name,last_name)")
        .order("created_at", { ascending: false }).limit(100);
      if (filter.status !== "all") q = q.eq("status", filter.status);
      if (filter.requestId) q = q.eq("request_id", filter.requestId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AlertRow[];
    },
  });
}

function DraftPanel({ alertId, onDone }: { alertId: string; onDone: () => void }) {
  const getDraft = useServerFn(getMatchAlertDraft);
  const setStatus = useServerFn(setMatchAlertStatus);
  const [text, setText] = useState<string | null>(null);
  const [meta, setMeta] = useState<AlertDraftDto | null>(null);
  const load = useMutation({
    mutationFn: (regenerate: boolean) => getDraft({ data: { alertId, regenerate } }),
    onSuccess: (r) => {
      if (!r.ok) return void toast.error(r.message ?? "Ciorna nu este disponibilă.");
      setMeta(r);
      setText(r.text ?? "");
      if (r.notice) toast.message(r.notice);
    },
  });
  const sent = useMutation({
    mutationFn: () => setStatus({ data: { alertId, status: "sent" } }),
    onSuccess: (r) => (r.ok ? (toast.success("Marcat ca trimis. Activitatea a fost adăugată în istoricul clientului."), onDone()) : toast.error(r.message ?? "Eroare")),
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load.mutate(false); }, [alertId]);
  if (!meta || text === null) return <p className="mt-2 text-sm text-muted-foreground">Se pregătește mesajul…</p>;
  const wa = whatsappUrl(meta.phone, text);
  const mail = mailtoUrl(meta.email, meta.subject ?? "", text);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {meta.isAi ? <><Sparkles className="h-3.5 w-3.5" /> Ciornă AI — verifică înainte de trimitere</> : "Mesaj simplu (fără AI)"}
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-label="Mesaj către client" />
      <div className="flex flex-wrap gap-2">
        {wa ? <Button asChild size="sm" variant="outline"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-4 w-4" />WhatsApp</a></Button> : null}
        {mail ? <Button asChild size="sm" variant="outline"><a href={mail}><Mail className="mr-1 h-4 w-4" />Email</a></Button> : null}
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copiat."))}><Copy className="mr-1 h-4 w-4" />Copiază</Button>
        <Button size="sm" variant="outline" disabled={load.isPending} onClick={() => load.mutate(true)}><RefreshCw className="mr-1 h-4 w-4" />Regenerează</Button>
        <Button size="sm" disabled={sent.isPending} onClick={() => sent.mutate()}><Check className="mr-1 h-4 w-4" />Am trimis</Button>
      </div>
    </div>
  );
}

export function ActiveMatchAlertList({ status, requestId }: { status: AlertStatus | "all"; requestId?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useMatchAlerts({ status, requestId });
  const [open, setOpen] = useState<string | null>(null);
  const setStatus = useServerFn(setMatchAlertStatus);
  const refresh = () => qc.invalidateQueries({ queryKey: ["active-match-alerts"] });
  const ignore = useMutation({ mutationFn: (id: string) => setStatus({ data: { alertId: id, status: "ignored" } }), onSuccess: refresh });
  if (isLoading) return <p className="text-sm text-muted-foreground">Se încarcă…</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">Nicio potrivire nouă.</p>;
  return (
    <ul className="space-y-3">
      {data.map((a) => {
        const client = a.contact ? `${a.contact.first_name} ${a.contact.last_name}`.trim() : a.request?.title ?? "Client";
        return (
          <li key={a.id} className="rounded-xl border bg-card p-4" data-testid="active-match-alert">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={matchTone(a.score)}>{`Potrivire ${a.score}%`}</StatusBadge>
              <StatusBadge tone={a.status === "new" ? "info" : "neutral"}>{STATUS_LABEL[a.status]}</StatusBadge>
              {a.trigger === "price_drop" ? <StatusBadge tone="warning">Preț scăzut</StatusBadge> : null}
              {!a.notified_at ? <span className="text-xs text-muted-foreground">fără notificare (limita zilnică)</span> : null}
            </div>
            <p className="mt-2 font-medium">
              <Link to="/app/properties/$id" params={{ id: a.property_id }} className="hover:underline">{a.property?.title ?? "Proprietate"}</Link>
              {" pentru "}
              <Link to="/app/requests/$id" params={{ id: a.request_id }} className="hover:underline">{client}</Link>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {a.reasons.length ? `Îndeplinite: ${a.reasons.join(", ")}.` : null} {a.misses.length ? `Lipsă: ${a.misses.join(", ")}.` : null}
            </p>
            {open === a.id ? (
              <DraftPanel alertId={a.id} onDone={() => { setOpen(null); refresh(); }} />
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setOpen(a.id)}>Pregătește mesajul</Button>
                {a.status === "new" ? <Button size="sm" variant="ghost" onClick={() => ignore.mutate(a.id)}><EyeOff className="mr-1 h-4 w-4" />Ignoră</Button> : null}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
