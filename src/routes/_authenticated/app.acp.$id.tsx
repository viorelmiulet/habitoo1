import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Building2,
  Calculator,
  ChevronDown,
  ImageOff,
  Info,
  Layers,
  RefreshCw,
  Target,
  TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { CardGridSkeleton } from "@/components/app/LoadingState";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { appHead } from "@/components/app/app-head";
import { formatMoney, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getAcpAnalysis,
  rerunAcpAnalysis,
  setAcpComparableOverride,
  type AcpAnalysisView,
  type AcpComparableView,
} from "@/lib/acp/analyses.functions";
import { AcpAiInsight } from "@/components/app/AcpAiInsight";
import { MarketIntelligenceCard } from "@/components/app/MarketIntelligenceCard";
import { AcpVersionsCard } from "@/components/app/AcpVersionsCard";
import { AcpReportCard } from "@/components/app/AcpReportCard";

import { ACP_SCORE_LABELS, ACP_SCORE_WEIGHTS, ACP_THRESHOLDS, ACP_TIER_LABELS } from "@/lib/acp/config";

export const Route = createFileRoute("/_authenticated/app/acp/$id")({
  head: () => appHead("Habitoo CRM — detaliu analiză comparativă"),
  component: AcpDetailPage,
});

const STATUS: Record<string, { label: string; tone: "success" | "neutral" | "warning" }> = {
  draft: { label: "Ciornă", tone: "neutral" },
  running: { label: "În calcul", tone: "warning" },
  completed: { label: "Finalizată", tone: "success" },
  archived: { label: "Arhivată", tone: "neutral" },
};

function Kpi({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className={cn("mt-1 font-semibold", strong ? "text-xl text-primary" : "text-lg")}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function tierTone(tier: string) {
  if (tier === "direct") return "success" as const;
  if (tier === "secondary") return "info" as const;
  return "neutral" as const;
}

function ComparableRow({
  comparable,
  currency,
  onOverride,
  pending,
}: {
  comparable: AcpComparableView;
  currency: string;
  onOverride: (override: "include" | "exclude" | "auto") => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const s = comparable.subject;
  return (
    <li className={cn("px-5 py-4", !comparable.isSelected && "bg-muted/30")}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
          {comparable.imageUrl ? (
            <img
              src={comparable.imageUrl}
              alt={comparable.title}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <ImageOff className="size-5" aria-hidden />
              <span className="text-[10px]">fără foto</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-medium">{comparable.title}</p>
            <StatusBadge tone={tierTone(comparable.tier)}>
              {ACP_TIER_LABELS[comparable.tier] ?? comparable.tier}
            </StatusBadge>
            {comparable.isOutlier ? <StatusBadge tone="warning">Atipic</StatusBadge> : null}
            {comparable.manualOverride ? (
              <StatusBadge tone="info">
                {comparable.manualOverride === "include" ? "Inclus manual" : "Exclus manual"}
              </StatusBadge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {comparable.sourceName}
            {comparable.locationLabel ? ` · ${comparable.locationLabel}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[
              s.rooms ? `${s.rooms} camere` : null,
              s.usableArea ? `${s.usableArea} mp` : null,
              s.floor !== null && s.floor !== undefined ? `etaj ${s.floor}` : null,
              s.constructionYear ? `${s.constructionYear}` : null,
              s.condition || null,
            ]
              .filter(Boolean)
              .join(" · ") || "Date parțiale"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{comparable.selectionReason}</p>
        </div>

        <div className="w-40 shrink-0 text-right">
          <p className="text-sm font-semibold">
            {formatMoney(comparable.adjustedPrice ?? s.price, s.currency ?? currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            preț listat {formatMoney(s.price, s.currency ?? currency)}
          </p>
          {comparable.adjustedPricePerSqm ? (
            <p className="text-xs text-muted-foreground">
              {formatMoney(comparable.adjustedPricePerSqm, s.currency ?? currency)}/mp ajustat
            </p>
          ) : null}
        </div>

        <div className="w-24 shrink-0 text-right">
          <p className="text-lg font-semibold">{comparable.similarityScore}</p>
          <p className="text-[11px] text-muted-foreground">scor / 100</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          Detalii scor și ajustări
        </Button>
        {comparable.isSelected ? (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => onOverride("exclude")}>
            Exclude
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => onOverride("include")}>
            Include
          </Button>
        )}
        {comparable.manualOverride ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onOverride("auto")}>
            Revino la automat
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 grid gap-4 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Scoruri</p>
            <ul className="mt-2 space-y-1 text-xs">
              {Object.entries(ACP_SCORE_WEIGHTS).map(([key, weight]) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {ACP_SCORE_LABELS[key as keyof typeof ACP_SCORE_LABELS]} ({weight}%)
                  </span>
                  <span className="font-medium">{comparable.components[key] ?? "—"}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Ajustări</p>
            {comparable.adjustments.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Nicio ajustare: caracteristicile sunt echivalente sau datele lipsesc.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs">
                {comparable.adjustments.map((a) => (
                  <li key={a.factor} className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-muted-foreground">
                      <span className="font-medium text-foreground">{a.label}</span> — {a.basis}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-medium",
                        a.amount >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {a.amount >= 0 ? "+" : ""}
                      {formatMoney(a.amount, comparable.subject.currency ?? currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {comparable.adjustmentAmount !== null ? (
              <p className="mt-2 text-xs font-medium">
                Total ajustări: {comparable.adjustmentAmount >= 0 ? "+" : ""}
                {formatMoney(comparable.adjustmentAmount, comparable.subject.currency ?? currency)}
                {comparable.adjustmentPercent !== null
                  ? ` (${comparable.adjustmentPercent}%)`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Grafic simplu, fără dependențe: preț ajustat pe mp pentru comparabilele folosite. */
function PriceChart({ analysis }: { analysis: AcpAnalysisView }) {
  const used = analysis.comparables.filter((c) => c.isSelected && c.adjustedPricePerSqm);
  const values = used.map((c) => c.adjustedPricePerSqm!);
  if (values.length === 0) return null;
  const max = Math.max(...values, analysis.target.pricePerSqm ?? 0);
  const median = analysis.statistics?.medianPricePerSqm ?? null;
  const currency = analysis.target.subject.currency ?? "EUR";
  return (
    <div className="space-y-2">
      {used.map((c) => {
        const value = c.adjustedPricePerSqm!;
        return (
          <div key={c.id} className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate text-xs text-muted-foreground">{c.title}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs font-medium">
              {formatMoney(value, currency)}
            </span>
          </div>
        );
      })}
      {median ? (
        <p className="pt-1 text-xs text-muted-foreground">
          Mediana comparabilelor: {formatMoney(median, currency)}/mp
          {analysis.target.pricePerSqm
            ? ` · prețul actual al proprietății: ${formatMoney(analysis.target.pricePerSqm, currency)}/mp`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

function AcpDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchAnalysis = useServerFn(getAcpAnalysis);
  const rerun = useServerFn(rerunAcpAnalysis);
  const setOverride = useServerFn(setAcpComparableOverride);

  const { data: analysis, isLoading } = useQuery({
    queryKey: ["acp-analysis", id],
    queryFn: () => fetchAnalysis({ data: { analysisId: id } }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["acp-analysis", id] });
    void queryClient.invalidateQueries({ queryKey: ["acp-analyses"] });
  };

  const rerunMutation = useMutation({
    mutationFn: () => rerun({ data: { analysisId: id } }),
    onSuccess: () => {
      toast.success("Analiză recalculată", { duration: 2500 });
      invalidate();
    },
    onError: toastError,
  });

  const overrideMutation = useMutation({
    mutationFn: (input: { comparableKey: string; override: "include" | "exclude" | "auto" }) =>
      setOverride({ data: { analysisId: id, ...input } }),
    onSuccess: () => {
      toast.success("Comparabil actualizat", { duration: 2500 });
      invalidate();
    },
    onError: (error: unknown) => toastError(error),
  });

  const currency = analysis?.target.subject.currency ?? "EUR";
  const selectedCount = useMemo(
    () => (analysis?.comparables ?? []).filter((c) => c.isSelected).length,
    [analysis],
  );

  if (isLoading) return <CardGridSkeleton />;
  if (!analysis) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Analiza nu a fost găsită"
        description="Este posibil să fi fost ștearsă sau să aparțină altei agenții."
      />
    );
  }

  const status = STATUS[analysis.status] ?? { label: analysis.status, tone: "neutral" as const };
  const s = analysis.target.subject;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`ACP · versiunea ${analysis.version}`}
        title={analysis.title}
        description={
          analysis.lastRunAt
            ? `Ultima rulare: ${formatDateTime(analysis.lastRunAt)}. Toate scorurile sunt deterministe și reproductibile.`
            : "Analiza nu a fost încă rulată."
        }
        backTo="/app/acp"
        backLabel="Analize salvate"
        meta={
          <>
            <StatusBadge tone={status.tone} dot>
              {status.label}
            </StatusBadge>
            <StatusBadge tone="neutral">{selectedCount} comparabile folosite</StatusBadge>
            {analysis.confidence ? (
              <StatusBadge tone={analysis.confidence.score >= 60 ? "success" : "warning"}>
                Încredere {analysis.confidence.score}/100
              </StatusBadge>
            ) : null}
          </>
        }
        actions={
          <Button
            variant="outline"
            disabled={rerunMutation.isPending}
            onClick={() => rerunMutation.mutate(undefined)}
          >
            <RefreshCw className={cn("size-4", rerunMutation.isPending && "animate-spin")} />
            {rerunMutation.isPending ? "Se recalculează…" : "Recalculează"}
          </Button>
        }
      />

      {analysis.errorMessage ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p>{analysis.errorMessage}</p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Valoare estimată · Calcul ACP"
          value={formatMoney(analysis.estimate?.estimatedValue, currency)}
          hint={
            analysis.estimate?.estimatedMin && analysis.estimate?.estimatedMax
              ? `interval ${formatMoney(analysis.estimate.estimatedMin, currency)} – ${formatMoney(analysis.estimate.estimatedMax, currency)}`
              : "interval indisponibil"
          }
          strong
        />
        <Kpi
          label="Preț recomandat · Calcul ACP"
          value={formatMoney(analysis.estimate?.recommendedListingPrice, currency)}
          hint="include marja de negociere"
        />
        <Kpi
          label="Median preț / mp · Calcul ACP"
          value={
            analysis.statistics?.medianPricePerSqm
              ? `${formatMoney(analysis.statistics.medianPricePerSqm, currency)}/mp`
              : "—"
          }
          hint={
            analysis.statistics?.averagePricePerSqm
              ? `medie ${formatMoney(analysis.statistics.averagePricePerSqm, currency)}/mp`
              : undefined
          }
        />
        <Kpi
          label="Încredere"
          value={analysis.confidence ? `${analysis.confidence.score}/100` : "—"}
          hint={
            analysis.confidence
              ? `cantitate ${analysis.confidence.quantity} · calitate ${analysis.confidence.quality} · dispersie ${analysis.confidence.dispersion}`
              : undefined
          }
        />
      </div>

      <MarketIntelligenceCard analysisId={analysis.id} />

      <AcpAiInsight analysis={analysis} onGenerated={invalidate} />

      <AcpVersionsCard analysisId={analysis.id} />

      <AcpReportCard analysisId={analysis.id} />


      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Proprietatea analizată"
          description={
            analysis.target.capturedAt
              ? `Snapshot din ${formatDateTime(analysis.target.capturedAt)}.`
              : undefined
          }
          icon={Target}
          className="xl:col-span-1"
        >
          <p className="text-sm font-medium">{analysis.target.title}</p>
          {analysis.target.locationLabel ? (
            <p className="text-xs text-muted-foreground">{analysis.target.locationLabel}</p>
          ) : null}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {[
              ["Camere", s.rooms ?? "—"],
              ["Suprafață utilă", s.usableArea ? `${s.usableArea} mp` : "—"],
              ["Etaj", s.floor ?? "—"],
              ["An construcție", s.constructionYear ?? "—"],
              ["Stare", s.condition || "—"],
              ["Preț actual", formatMoney(s.price, currency)],
              [
                "Preț / mp actual",
                analysis.target.pricePerSqm
                  ? `${formatMoney(analysis.target.pricePerSqm, currency)}/mp`
                  : "—",
              ],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {label}
                </dt>
                <dd className="mt-0.5 font-medium">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard
          title="Distribuția prețurilor ajustate"
          description="Fiecare bară este un comparabil folosit, corectat la caracteristicile proprietății tale."
          icon={BarChart3}
          className="xl:col-span-2"
        >
          {selectedCount === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nu există comparabile folosite. Include manual comparabile sau adaugă surse noi.
            </p>
          ) : (
            <PriceChart analysis={analysis} />
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Comparabile"
        description="Ordonate după scorul de similaritate. Poți include sau exclude manual orice comparabil — analiza se recalculează."
        icon={Building2}
        flush
      >
        {analysis.comparables.length === 0 ? (
          <div className="p-5">
            <p className="text-sm text-muted-foreground">
              Nu s-a găsit niciun candidat în sursele selectate. Verifică dacă există proprietăți
              similare în același oraș și cu același tip de tranzacție.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {analysis.comparables.map((c) => (
              <ComparableRow
                key={c.id}
                comparable={c}
                currency={currency}
                pending={overrideMutation.isPending}
                onOverride={(override) =>
                  overrideMutation.mutate({ comparableKey: c.key, override })
                }
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Surse folosite" icon={Layers}>
          {analysis.sourceStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nicio sursă înregistrată.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {analysis.sourceStats.map((s2) => (
                <li key={`${s2.sourceType}-${s2.sourceName}`} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{s2.sourceName}</span>
                  <span className="font-medium">
                    {s2.itemsUsed} folosite din {s2.itemsFound}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Cum s-a calculat"
          description="Fără AI: ponderi fixe, ajustări explicabile și statistică robustă."
          icon={Calculator}
        >
          <ol className="space-y-2 text-sm">
            {analysis.explanation.map((line, index) => (
              <li key={index} className="flex gap-2">
                <span className="text-muted-foreground">{index + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Info className="size-3.5" aria-hidden /> Ponderi și praguri
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
              {Object.entries(ACP_SCORE_WEIGHTS).map(([key, weight]) => (
                <li key={key} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    {ACP_SCORE_LABELS[key as keyof typeof ACP_SCORE_LABELS]}
                  </span>
                  <span className="font-medium">{weight}%</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Peste {ACP_THRESHOLDS.direct} puncte: comparabil direct. Între{" "}
              {ACP_THRESHOLDS.secondary} și {ACP_THRESHOLDS.direct}: secundar. Sub{" "}
              {ACP_THRESHOLDS.secondary}: exclus automat.
            </p>
            {analysis.confidence?.notes.length ? (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {analysis.confidence.notes.map((note, index) => (
                  <li key={index}>· {note}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
