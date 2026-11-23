import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/app/StatusBadge";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { applyLeadRequestChanges, analyzeLeadConversation } from "@/lib/ai/lead-assist/lead-assist.functions";
import { LEAD_INTENT_LABELS, type LeadIntent, type ProposedChange } from "@/lib/ai/lead-assist/schema";

export type LeadAiBadgeInfo = { intent: string | null; request_created: boolean; draft: string | null; proposed: number; score: number | null; scoreReason: string | null };

/** Insignele din lista de lead-uri: ultima analiză reușită per lead. */
export function useLeadAiBadges(leadIds: string[]) {
  const { isEnabled, isLoading } = useAiFeatures();
  return useQuery({
    queryKey: ["lead-ai-badges", leadIds.slice().sort().join(",")],
    enabled: leadIds.length > 0 && !isLoading && isEnabled("ai_lead_assist"),
    queryFn: async () => {
      const map = new Map<string, LeadAiBadgeInfo>();
      for (let i = 0; i < leadIds.length; i += 200) {
        const { data } = await supabase.from("lead_ai_insights")
          .select("lead_id,intent,request_created,draft,proposed_changes,created_at,score,score_reason")
          .in("lead_id", leadIds.slice(i, i + 200)).eq("status", "done").order("updated_at", { ascending: false });
        for (const r of data ?? []) {
          if (!map.has(r.lead_id)) map.set(r.lead_id, { intent: r.intent, request_created: r.request_created, draft: r.draft, proposed: Array.isArray(r.proposed_changes) ? r.proposed_changes.length : 0, score: r.score, scoreReason: r.score_reason });
        }
      }
      return map;
    },
  });
}

export function LeadAiBadges({ info }: { info: LeadAiBadgeInfo | undefined }) {
  const { isEnabled, isLoading } = useAiFeatures();
  if (!info || isLoading || !isEnabled("ai_lead_assist")) return null;
  return (
    <>
      {info.request_created || info.proposed ? <StatusBadge tone="info">AI: cerere extrasă</StatusBadge> : null}
      {info.draft ? <StatusBadge tone="success">AI: răspuns pregătit</StatusBadge> : null}
      {info.score !== null ? <span title={info.scoreReason ?? ""}><StatusBadge tone={info.score > 70 ? "success" : "neutral"}>Scor AI {info.score}/100</StatusBadge></span> : null}
      {info.intent && info.intent !== "other" ? <StatusBadge tone="neutral">{LEAD_INTENT_LABELS[info.intent as LeadIntent]}</StatusBadge> : null}
    </>
  );
}

function waLink(phone: string, text: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `40${digits.slice(1)}`;
  return digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

/**
 * Propunerile AI pentru ultimul mesaj primit. „Folosește” doar pune textul în
 * câmpul de răspuns; trimiterea rămâne exclusiv la „Trimite”.
 */
export function LeadAiAssist({ leadId, phone, email, hasNote, messages = [], portalReply, onUse }: {
  leadId: string; phone: string | null; email?: string | null; hasNote?: boolean;
  messages?: { id: string; body: string | null; direction: string }[];
  portalReply: boolean; onUse: (text: string) => void;
}) {
  const qc = useQueryClient();
  const { isEnabled, isLoading } = useAiFeatures();
  const analyzeFn = useServerFn(analyzeLeadConversation);
  const applyFn = useServerFn(applyLeadRequestChanges);
  const [source, setSource] = useState("lead");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const { data: insight } = useQuery({
    queryKey: ["lead-ai-insight", leadId],
    enabled: !isLoading && isEnabled("ai_lead_assist"),
    queryFn: async () => {
      const { data } = await supabase.from("lead_ai_insights").select("*").eq("lead_id", leadId).eq("status", "done").order("updated_at", { ascending: false }).order("id").limit(1).maybeSingle();
      return data ?? null;
    },
  });
  useEffect(() => { setBody(insight?.draft ?? ""); setSelected([]); }, [insight?.id, insight?.updated_at]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lead-ai-insight", leadId] });
    qc.invalidateQueries({ queryKey: ["lead-ai-badges"] });
    qc.invalidateQueries({ queryKey: ["daily-actions"] });
    qc.invalidateQueries({ queryKey: ["daily-brief"] });
  };
  const regenerate = useMutation({
    mutationFn: () => analyzeFn({ data: { leadId, source: source === "note" ? "note" : source === "lead" ? "lead" : "message", ...(source !== "lead" && source !== "note" ? { messageId: source } : {}) } }),
    onSuccess: (r) => (r.ok ? refresh() : toast.error(r.message)),
    onError: () => toast.error("Analiza nu a putut fi realizată."),
  });
  const apply = useMutation({
    mutationFn: () => { if (!insight) throw new Error("Analiza nu este disponibilă."); return applyFn({ data: { insightId: insight.id, fields: selected } }); },
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("Cererea a fost salvată.");
      refresh();
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead-detail", leadId] });
    },
    onError: () => toast.error("Cererea nu a putut fi salvată."),
  });
  if (isLoading || !isEnabled("ai_lead_assist")) return null;
  const changes = (Array.isArray(insight?.proposed_changes) ? insight.proposed_changes : []) as unknown as ProposedChange[];
  const wa = body && phone ? waLink(phone, body) : null;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="lead-ai-assist">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <span className="text-sm font-semibold">Habitoo AI</span>
        {insight?.intent ? <StatusBadge tone="neutral">{LEAD_INTENT_LABELS[insight.intent as LeadIntent]}</StatusBadge> : null}
        {insight?.request_created ? <StatusBadge tone="info">Cerere confirmată</StatusBadge> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="min-w-0 flex-1" aria-label="Sursa analizei"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="lead">Ultimul mesaj / lead</SelectItem>
            {hasNote ? <SelectItem value="note">Nota lead-ului</SelectItem> : null}
            {messages.filter(m => m.direction === "in" && m.body).map((m, index) => <SelectItem key={m.id} value={m.id}>Mesaj {index + 1}: {m.body?.slice(0, 55)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
          <Sparkles className="size-3.5" aria-hidden /> {regenerate.isPending ? "Se pregătește…" : "Răspunde cu AI"}
        </Button>
      </div>
      {insight?.score !== null && insight?.score !== undefined ? <div className="space-y-1 text-sm">
        <p className="font-semibold">Scor lead: {insight.score}/100</p><p className="text-muted-foreground">{insight.score_reason}</p>
      </div> : null}
      {changes.length && !insight?.changes_applied_at ? (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{insight?.request_id ? "Actualizează cererea" : "Cerere din conversație"}</p>
          <ul className="space-y-2 text-sm">
            {changes.filter(c => c.evidence).map((c) => <li key={c.field} className="flex items-start gap-2">
              <Checkbox id={`lead-proposal-${c.field}`} checked={selected.includes(c.field)} onCheckedChange={checked => setSelected(s => checked ? [...s, c.field] : s.filter(f => f !== c.field))} />
              <label htmlFor={`lead-proposal-${c.field}`} className="min-w-0 break-words">{c.text}<blockquote className="mt-1 text-xs text-muted-foreground">„{c.evidence}”</blockquote></label>
            </li>)}
          </ul>
          {!insight?.request_id && !changes.some(c => c.field === "kind") ? <p className="text-xs text-muted-foreground">Tipul cererii (cumpărare sau închiriere) nu este menționat în sursă.</p> : null}
          <Button size="sm" variant="outline" disabled={apply.isPending || selected.length === 0 || (!insight?.request_id && !selected.includes("kind")) || ((selected.includes("budget_min") || selected.includes("budget_max")) && !selected.includes("currency"))} onClick={() => apply.mutate()}>Confirmă și salvează cererea</Button>
        </div>
      ) : null}
      {insight?.draft ? (
        <div className="space-y-2">
          <Textarea aria-label="Răspuns ciornă" value={body} onChange={e => setBody(e.target.value)} rows={5} maxLength={1500} />
          <div className="flex flex-wrap gap-2">
            {portalReply ? <Button size="sm" onClick={() => onUse(body)}>Folosește</Button> : null}
            {!portalReply ? (
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(body).then(() => toast.success("Text copiat."))}>
                <Copy className="size-3.5" aria-hidden /> Copiază
              </Button>
            ) : null}
            {!portalReply && email ? <Button size="sm" variant="outline" asChild><a href={`mailto:${encodeURIComponent(email)}?body=${encodeURIComponent(body)}`}>Email</a></Button> : null}
            {!portalReply && wa ? (
              <Button size="sm" variant="outline" asChild>
                <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-3.5" aria-hidden /> WhatsApp</a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
