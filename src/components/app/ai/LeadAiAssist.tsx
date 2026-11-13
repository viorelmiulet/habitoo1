import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/StatusBadge";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { applyLeadRequestChanges, regenerateLeadDraft } from "@/lib/ai/lead-assist/lead-assist.functions";
import { LEAD_INTENT_LABELS, type LeadIntent, type ProposedChange } from "@/lib/ai/lead-assist/schema";

export type LeadAiBadgeInfo = { intent: string | null; request_created: boolean; draft: string | null; proposed: number };

/** Insignele din lista de lead-uri: ultima analiză reușită per lead. */
export function useLeadAiBadges(leadIds: string[]) {
  return useQuery({
    queryKey: ["lead-ai-badges", leadIds.slice().sort().join(",")],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, LeadAiBadgeInfo>();
      for (let i = 0; i < leadIds.length; i += 200) {
        const { data } = await supabase.from("lead_ai_insights")
          .select("lead_id,intent,request_created,draft,proposed_changes,created_at")
          .in("lead_id", leadIds.slice(i, i + 200)).eq("status", "done").order("created_at", { ascending: false });
        for (const r of data ?? []) {
          if (!map.has(r.lead_id)) map.set(r.lead_id, { intent: r.intent, request_created: r.request_created, draft: r.draft, proposed: Array.isArray(r.proposed_changes) ? r.proposed_changes.length : 0 });
        }
      }
      return map;
    },
  });
}

export function LeadAiBadges({ info }: { info: LeadAiBadgeInfo | undefined }) {
  if (!info) return null;
  return (
    <>
      {info.request_created || info.proposed ? <StatusBadge tone="info">AI: cerere extrasă</StatusBadge> : null}
      {info.draft ? <StatusBadge tone="success">AI: răspuns pregătit</StatusBadge> : null}
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
export function LeadAiAssist({ leadId, phone, portalReply, onUse }: { leadId: string; phone: string | null; portalReply: boolean; onUse: (text: string) => void }) {
  const qc = useQueryClient();
  const { isEnabled, isLoading } = useAiFeatures();
  const regenerateFn = useServerFn(regenerateLeadDraft);
  const applyFn = useServerFn(applyLeadRequestChanges);
  const { data: insight } = useQuery({
    queryKey: ["lead-ai-insight", leadId],
    queryFn: async () => {
      const { data } = await supabase.from("lead_ai_insights").select("*").eq("lead_id", leadId).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lead-ai-insight", leadId] });
    qc.invalidateQueries({ queryKey: ["lead-ai-badges"] });
  };
  const regenerate = useMutation({
    mutationFn: () => regenerateFn({ data: { insightId: insight!.id } }),
    onSuccess: (r) => (r.ok ? refresh() : toast.error(r.message)),
  });
  const apply = useMutation({
    mutationFn: () => applyFn({ data: { insightId: insight!.id } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("Cererea a fost actualizată.");
      refresh();
      qc.invalidateQueries({ queryKey: ["requests"] });
    },
  });
  if (isLoading || !isEnabled("ai_lead_assist") || !insight) return null;
  const changes = (Array.isArray(insight.proposed_changes) ? insight.proposed_changes : []) as unknown as ProposedChange[];
  const draft = insight.draft;
  const wa = draft && phone ? waLink(phone, draft) : null;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="lead-ai-assist">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <span className="text-sm font-semibold">Habitoo AI</span>
        {insight.intent ? <StatusBadge tone="neutral">{LEAD_INTENT_LABELS[insight.intent as LeadIntent]}</StatusBadge> : null}
        {insight.request_created ? <StatusBadge tone="info">Cerere creată din mesaj</StatusBadge> : null}
      </div>
      {changes.length && !insight.changes_applied_at ? (
        <div className="space-y-1.5">
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {changes.map((c) => <li key={c.field}>{c.text}</li>)}
          </ul>
          <Button size="sm" variant="outline" disabled={apply.isPending} onClick={() => apply.mutate()}>Actualizează cererea</Button>
        </div>
      ) : null}
      {draft ? (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap rounded-lg bg-card p-3 text-sm leading-relaxed">{draft}</p>
          <div className="flex flex-wrap gap-2">
            {portalReply ? <Button size="sm" onClick={() => onUse(draft)}>Folosește</Button> : null}
            <Button size="sm" variant="outline" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
              <RefreshCw className="size-3.5" aria-hidden /> Regenerează
            </Button>
            {!portalReply ? (
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(draft).then(() => toast.success("Text copiat."))}>
                <Copy className="size-3.5" aria-hidden /> Copiază
              </Button>
            ) : null}
            {!portalReply && wa ? (
              <Button size="sm" variant="outline" asChild>
                <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-3.5" aria-hidden /> WhatsApp</a>
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">AI-ul propune, tu decizi. Nimic nu se trimite fără acordul tău.</p>
        </div>
      ) : null}
    </div>
  );
}
