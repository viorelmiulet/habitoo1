/**
 * Etapa 6 ACP: fluxul comercial ACP direct din pagina proprietății.
 *
 * Cardul nu recalculează nimic la deschidere: afișează ultima versiune și
 * snapshot-ul ei. Prețul recomandat se aplică numai la confirmarea explicită
 * a utilizatorului.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GitCompare,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MarketIntelligenceCard } from "@/components/app/MarketIntelligenceCard";
import {
  createAcpAnalysis,
  recalculateAcpAsNewVersion,
} from "@/lib/acp/analyses.functions";
import { acpReportUrl, generateAcpReport } from "@/lib/acp/reports.functions";
import { applyAcpRecommendedPrice, getPropertyAcpWorkflow } from "@/lib/acp/workflow.functions";
import {
  ACP_WORKFLOW_STATUS_LABELS,
  ACP_WORKFLOW_STATUS_TONES,
  acpPriceDeltaLabel,
} from "@/lib/acp/workflow";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function PropertyAcpCard({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const fetchWorkflow = useServerFn(getPropertyAcpWorkflow);
  const startAnalysis = useServerFn(createAcpAnalysis);
  const recalculate = useServerFn(recalculateAcpAsNewVersion);
  const generateReport = useServerFn(generateAcpReport);
  const reportUrl = useServerFn(acpReportUrl);
  const applyPrice = useServerFn(applyAcpRecommendedPrice);
  const [applyOpen, setApplyOpen] = useState(false);

  const workflowQuery = useQuery({
    queryKey: ["property-acp", propertyId],
    queryFn: () => fetchWorkflow({ data: { propertyId } }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["property-acp", propertyId] });
    void queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    void queryClient.invalidateQueries({ queryKey: ["acp-analyses"] });
  };

  const startMutation = useMutation({
    mutationFn: () => startAnalysis({ data: { propertyId, sources: { own_properties: true } } }),
    onSuccess: () => {
      toast.success("Analiză ACP pornită", { duration: 2500 });
      invalidate();
    },
    onError: toastError,
  });

  const recalcMutation = useMutation({
    mutationFn: (analysisId: string) => recalculate({ data: { analysisId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`Versiunea ${result.version} a fost creată`, { duration: 2500 });
      else toast.error(result.errorMessage ?? "Recalcularea nu a reușit", { duration: 4000 });
      invalidate();
    },
    onError: toastError,
  });

  const reportMutation = useMutation({
    mutationFn: (analysisId: string) => generateReport({ data: { analysisId } }),
    onSuccess: () => {
      toast.success("Raport generat", { duration: 2500 });
      invalidate();
    },
    onError: toastError,
  });

  const openReportMutation = useMutation({
    mutationFn: (reportId: string) => reportUrl({ data: { reportId } }),
    onSuccess: (result) => {
      if (result?.url) window.open(result.url, "_blank", "noopener");
      else toast.error("Raportul nu are încă un fișier disponibil.", { duration: 3500 });
    },
    onError: toastError,
  });

  const applyMutation = useMutation({
    mutationFn: (analysisId: string) => applyPrice({ data: { analysisId, confirm: true } }),
    onSuccess: (result) => {
      toast.success(`Preț actualizat la ${formatMoney(result.newPrice, result.currency)}`, {
        duration: 3000,
      });
      invalidate();
    },
    onError: toastError,
  });

  const data = workflowQuery.data;
  const busy =
    startMutation.isPending ||
    recalcMutation.isPending ||
    reportMutation.isPending ||
    applyMutation.isPending;

  if (workflowQuery.isLoading) {
    return (
      <SectionCard title="Analiză comparativă de piață (ACP)" icon={BarChart3}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Se încarcă starea ACP…
        </p>
      </SectionCard>
    );
  }

  if (!data) {
    return (
      <SectionCard title="Analiză comparativă de piață (ACP)" icon={BarChart3}>
        <p className="text-sm text-muted-foreground">Starea ACP nu a putut fi încărcată.</p>
      </SectionCard>
    );
  }

  const analysis = data.analysis;
  const status = data.status;
  const price = data.price;
  const deltaLabel = acpPriceDeltaLabel(price);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Analiză comparativă de piață (ACP)"
        description="Evaluare deterministă, versionată, pornită din această proprietate."
        icon={BarChart3}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={ACP_WORKFLOW_STATUS_TONES[status]} dot>
            {ACP_WORKFLOW_STATUS_LABELS[status]}
          </StatusBadge>
          {analysis ? (
            <>
              <StatusBadge tone="neutral">versiunea {analysis.version}</StatusBadge>
              {analysis.versionsCount > 1 ? (
                <StatusBadge tone="neutral">{analysis.versionsCount} versiuni</StatusBadge>
              ) : null}
              {analysis.lastRunAt ? (
                <span className="text-xs text-muted-foreground">
                  ultima analiză {formatDateTime(analysis.lastRunAt)}
                </span>
              ) : null}
            </>
          ) : null}
        </div>

        {analysis?.errorMessage ? (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            {analysis.errorMessage}
          </p>
        ) : null}

        {analysis && analysis.sources.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Surse folosite: {analysis.sources.join(", ")}
            {analysis.snapshotAt ? ` · snapshot ${formatDateTime(analysis.snapshotAt)}` : ""}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {!analysis ? (
            <Button disabled={busy} onClick={() => startMutation.mutate()}>
              {startMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <BarChart3 className="size-4" aria-hidden />
              )}
              Pornește ACP
            </Button>
          ) : (
            <>
              <Button asChild variant="outline">
                <Link to="/app/acp/$id" params={{ id: analysis.id }}>
                  <ExternalLink className="size-4" aria-hidden /> Vezi analiza
                </Link>
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => recalcMutation.mutate(analysis.id)}
              >
                <RefreshCw
                  className={cn("size-4", recalcMutation.isPending && "animate-spin")}
                  aria-hidden
                />
                Recalculează ACP cu date actuale
              </Button>
              {analysis.versionsCount > 1 ? (
                <Button asChild variant="ghost">
                  <Link to="/app/acp/$id" params={{ id: analysis.id }}>
                    <GitCompare className="size-4" aria-hidden /> Compară versiunile
                  </Link>
                </Button>
              ) : null}
            </>
          )}
        </div>

        {status === "insufficient_data" ? (
          <p className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Nu există suficiente comparabile pentru o estimare. Adaugă proprietăți similare sau
            configurează surse de piață, apoi recalculează.
          </p>
        ) : null}

        {analysis && status === "completed" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Valoare estimată · Calcul ACP"
              value={formatMoney(analysis.estimatedValue, data.property.currency)}
              hint={
                analysis.estimatedMin && analysis.estimatedMax
                  ? `${formatMoney(analysis.estimatedMin, data.property.currency)} – ${formatMoney(analysis.estimatedMax, data.property.currency)}`
                  : undefined
              }
            />
            <Metric
              label="Preț recomandat · Calcul ACP"
              value={formatMoney(analysis.recommendedListingPrice, data.property.currency)}
              hint="include marja de negociere"
            />
            <Metric
              label="Median / medie €/mp"
              value={
                analysis.medianPricePerSqm
                  ? `${formatMoney(analysis.medianPricePerSqm, data.property.currency)}/mp`
                  : "—"
              }
              hint={
                analysis.averagePricePerSqm
                  ? `medie ${formatMoney(analysis.averagePricePerSqm, data.property.currency)}/mp`
                  : undefined
              }
            />
            <Metric
              label="Comparabile · încredere"
              value={`${analysis.comparablesUsed}/${analysis.comparablesCount}`}
              hint={
                analysis.confidenceScore !== null
                  ? `încredere ${analysis.confidenceScore}/100`
                  : undefined
              }
            />
          </div>
        ) : null}
      </SectionCard>

      {analysis && status === "completed" ? (
        <SectionCard
          title="Preț proprietate și recomandarea ACP"
          description="Prețul proprietății nu se modifică automat. Aplicarea recomandării este o acțiune explicită."
          icon={TrendingUp}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric
              label="Preț proprietate"
              value={formatMoney(price.currentPrice, price.currency)}
            />
            <Metric
              label="Preț recomandat ACP"
              value={formatMoney(price.recommendedPrice, price.currency)}
              hint={deltaLabel ? `diferență ${deltaLabel}` : undefined}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {price.recommendedPrice !== null ? (
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(String(price.recommendedPrice))
                    .then(() => toast.success("Recomandarea de preț a fost copiată", { duration: 2000 }))
                    .catch(() => toast.error("Nu am putut copia recomandarea", { duration: 3000 }));
                }}
              >
                <Copy className="size-4" aria-hidden /> Copiază recomandarea de preț
              </Button>
            ) : null}
            {price.canApply ? (
              <Button disabled={busy} onClick={() => setApplyOpen(true)}>
                {applyMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Aplică prețul recomandat
              </Button>
            ) : null}
          </div>

          <ConfirmDialog
            open={applyOpen}
            onOpenChange={setApplyOpen}
            title="Aplici prețul recomandat ACP?"
            confirmLabel="Aplică prețul"
            description={
              <>
                Prețul proprietății se schimbă din{" "}
                <strong>{formatMoney(price.currentPrice, price.currency)}</strong> în{" "}
                <strong>{formatMoney(price.recommendedPrice, price.currency)}</strong>
                {deltaLabel ? <> (diferență {deltaLabel})</> : null}. Acțiunea este înregistrată în
                istoricul proprietății.
              </>
            }
            onConfirm={() => applyMutation.mutateAsync(analysis.id)}
          />
        </SectionCard>
      ) : null}

      {analysis && status === "completed" ? (
        <SectionCard
          title="Raport pentru client"
          description="Raportul rămâne legat de versiunea ACP pentru care a fost generat."
          icon={FileText}
        >
          {data.report ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={data.report.status === "ready" ? "success" : "warning"}>
                versiunea ACP {data.report.analysisVersion}
              </StatusBadge>
              {data.report.generatedAt ? (
                <span className="text-xs text-muted-foreground">
                  generat {formatDateTime(data.report.generatedAt)}
                </span>
              ) : null}
              {data.report.hasFile ? (
                <Button
                  variant="outline"
                  disabled={openReportMutation.isPending}
                  onClick={() => openReportMutation.mutate(data.report!.id)}
                >
                  <Download className="size-4" aria-hidden /> Deschide raportul
                </Button>
              ) : null}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => reportMutation.mutate(analysis.id)}
              >
                <FileText className="size-4" aria-hidden /> Generează raport nou
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Nu există încă un raport pentru versiunea {analysis.version}.
              </p>
              <Button disabled={busy} onClick={() => reportMutation.mutate(analysis.id)}>
                {reportMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FileText className="size-4" aria-hidden />
                )}
                Generează raport client
              </Button>
            </div>
          )}
        </SectionCard>
      ) : null}

      {analysis?.ai?.summary ? (
        <SectionCard
          title="Interpretare AI"
          description="Text generat automat. Valorile ACP sunt calculate determinist și rămân autoritative."
          icon={Sparkles}
        >
          <p className="text-sm whitespace-pre-line">{analysis.ai.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {analysis.ai.model ? `model ${analysis.ai.model}` : "model necunoscut"}
            {analysis.ai.generatedAt ? ` · ${formatDateTime(analysis.ai.generatedAt)}` : ""}
          </p>
          <Button asChild variant="ghost" className="mt-2 px-0">
            <Link to="/app/acp/$id" params={{ id: analysis.id }}>
              Vezi justificarea prețului în analiză
            </Link>
          </Button>
        </SectionCard>
      ) : null}

      {analysis ? <MarketIntelligenceCard analysisId={analysis.id} /> : null}
    </div>
  );
}
