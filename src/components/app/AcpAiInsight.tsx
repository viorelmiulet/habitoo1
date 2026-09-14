import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Info, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { generateAcpAiAnalysis, listAcpAiInsights } from "@/lib/acp/ai.functions";
import type { AcpAiInsight as AcpAiInsightData } from "@/lib/acp/ai/schema";
import type { AcpAnalysisView } from "@/lib/acp/analyses.functions";

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line">{body}</p>
    </div>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-relaxed">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InsightBody({ insight }: { insight: AcpAiInsightData }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <Block title="Rezumat executiv" body={insight.executive_summary} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Block title="Explicația evaluării" body={insight.valuation_explanation} />
        <Block title="Contextul pieței" body={insight.market_context} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Block title="Analiza comparabilelor" body={insight.comparable_analysis} />
        <Block title="Poziționare recomandată" body={insight.recommended_positioning} />
      </div>

      <Block title="Explicația scorului de încredere" body={insight.confidence_explanation} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Bullets title="Factori determinanți" items={insight.key_drivers} />
        <Bullets title="Riscuri și limitări" items={insight.risks_and_limitations} />
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <Block title="Pe scurt, pentru client" body={insight.client_friendly_summary} />
      </div>
    </div>
  );
}

/**
 * Secțiunea „Analiză AI”. Interpretează exclusiv cifrele motorului ACP pentru
 * versiunea și snapshot-ul analizei; valorile calculate rămân autoritative și
 * sunt afișate separat, marcate „Calcul ACP”.
 */
export function AcpAiInsight({
  analysis,
  onGenerated,
}: {
  analysis: AcpAnalysisView;
  onGenerated: () => void;
}) {
  const generate = useServerFn(generateAcpAiAnalysis);
  const listHistory = useServerFn(listAcpAiInsights);
  const [showHistory, setShowHistory] = useState(false);
  const insight = analysis.ai?.insight ?? null;

  const history = useQuery({
    queryKey: ["acp-ai-history", analysis.id],
    queryFn: () => listHistory({ data: { analysisId: analysis.id } }),
    enabled: showHistory,
  });

  const mutation = useMutation({
    mutationFn: () => generate({ data: { analysisId: analysis.id } }),
    onSuccess: (result) => {
      if (result.status === "ok") {
        toast.success("Analiză AI generată", { duration: 2500 });
        void history.refetch();
        onGenerated();
        return;
      }
      toast.error(result.message, { duration: 5000 });
    },
    onError: toastError,
  });

  const previous = history.data ?? [];

  return (
    <SectionCard
      title="Analiză AI"
      description="Interpretare generată pe baza cifrelor motorului ACP, fără să le modifice."
      icon={Sparkles}
      action={
        analysis.aiConfigured ? (
          <div className="flex flex-wrap items-center gap-2">
            {insight ? (
              <Button variant="ghost" onClick={() => setShowHistory((value) => !value)}>
                <History className="size-4" />
                {showHistory ? "Ascunde istoricul" : "Istoric"}
              </Button>
            ) : null}
            <Button
              variant={insight ? "outline" : "default"}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(undefined)}
            >
              {insight ? (
                <RefreshCw className={mutation.isPending ? "size-4 animate-spin" : "size-4"} />
              ) : (
                <Sparkles className="size-4" />
              )}
              {mutation.isPending
                ? "Se generează…"
                : insight
                  ? "Regenerează"
                  : "Generează analiza AI"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!analysis.aiConfigured ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p>
            Analiza AI indisponibilă — configurează providerul. Toate cifrele și comparabilele de
            mai jos rămân disponibile, fiind calculate de motorul determinist.
          </p>
        </div>
      ) : !insight ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p>
            Încă nu există o interpretare pentru această analiză. Apasă „Generează analiza AI” pentru
            un comentariu bazat strict pe rezultatele motorului.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="info">Generat de AI</StatusBadge>
            {analysis.ai?.model ? (
              <StatusBadge tone="neutral">{analysis.ai.model}</StatusBadge>
            ) : null}
            <StatusBadge tone="neutral">
              versiunea ACP {analysis.ai?.analysisVersion ?? analysis.version}
            </StatusBadge>
            {analysis.ai?.generatedAt ? (
              <span className="text-xs text-muted-foreground">
                generat {formatDateTime(analysis.ai.generatedAt)}
              </span>
            ) : null}
            {analysis.ai?.snapshotAt ? (
              <span className="text-xs text-muted-foreground">
                · snapshot {formatDateTime(analysis.ai.snapshotAt)}
              </span>
            ) : null}
          </div>

          <InsightBody insight={insight} />

          {showHistory ? (
            <div className="rounded-xl border border-border p-4">
              <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Interpretări anterioare
              </h4>
              {history.isPending ? (
                <p className="mt-2 text-sm text-muted-foreground">Se încarcă istoricul…</p>
              ) : previous.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nu există alte interpretări salvate pentru această analiză.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {previous.map((entry) => (
                    <li key={entry.id ?? entry.generatedAt} className="rounded-lg bg-muted/40 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>versiunea ACP {entry.analysisVersion ?? "—"}</span>
                        {entry.model ? <span>· {entry.model}</span> : null}
                        {entry.generatedAt ? (
                          <span>· {formatDateTime(entry.generatedAt)}</span>
                        ) : null}
                        {entry.legacy ? <span>· schemă anterioară</span> : null}
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed">
                        {entry.insight.executive_summary}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            AI-ul oferă interpretare și explicații. Valorile ACP sunt calculate determinist, pe baza
            snapshot-ului versiunii, și rămân autoritative.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
