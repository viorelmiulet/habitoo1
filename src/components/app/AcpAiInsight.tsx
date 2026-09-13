import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Info, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { generateAcpAiAnalysis } from "@/lib/acp/ai.functions";
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

/**
 * Interpretarea AI a analizei. Cifrele rămân afișate separat, marcate
 * „Calcul ACP”; aici apare exclusiv textul generat de model.
 */
export function AcpAiInsight({
  analysis,
  onGenerated,
}: {
  analysis: AcpAnalysisView;
  onGenerated: () => void;
}) {
  const generate = useServerFn(generateAcpAiAnalysis);
  const insight = analysis.ai?.insight ?? null;

  const mutation = useMutation({
    mutationFn: () => generate({ data: { analysisId: analysis.id } }),
    onSuccess: (result) => {
      if (result.status === "ok") {
        toast.success("Interpretare AI generată", { duration: 2500 });
        onGenerated();
        return;
      }
      toast.error(result.message, { duration: 5000 });
    },
    onError: toastError,
  });

  return (
    <SectionCard
      title="Interpretare AI"
      description="Model care interpretează exclusiv cifrele motorului ACP, fără să le modifice."
      icon={Sparkles}
      action={
        analysis.aiConfigured ? (
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
            {analysis.ai?.generatedAt ? (
              <span className="text-xs text-muted-foreground">
                {formatDateTime(analysis.ai.generatedAt)}
              </span>
            ) : null}
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <Block title="Rezumat executiv" body={insight.executive_summary} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Block title="Evaluarea pieței" body={insight.market_assessment} />
            <Block title="Analiza comparabilelor" body={insight.comparable_analysis} />
          </div>

          <Block
            title="Explicația prețului recomandat"
            body={insight.price_recommendation_explanation}
          />

          <div className="grid gap-5 lg:grid-cols-3">
            <Bullets title="Observații-cheie" items={insight.key_observations} />
            <Bullets title="Factori de risc" items={insight.risk_factors} />
            <Bullets title="Calitatea datelor" items={insight.data_quality_notes} />
          </div>

          <p className="text-xs text-muted-foreground">
            Interpretare orientativă, nu consultanță juridică sau financiară. Cifrele afișate ca
            „Calcul ACP” provin exclusiv din motorul determinist.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
