/**
 * Secțiunea „Calibrare & Precizie" de pe pagina analizei ACP (Stage 7).
 *
 * Arată calitatea datelor folosite, prospețimea comparabilelor și modul în care
 * calibrarea pe date reale a agenției influențează estimarea. Valoarea
 * deterministă (baseline) rămâne mereu vizibilă separat de cea calibrată.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, Loader2, RefreshCw } from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ACP_QUALITY_LEVEL_LABELS } from "@/lib/acp/precision";
import type { AcpAnalysisView } from "@/lib/acp/analyses.functions";
import {
  getAcpCalibration,
  runAcpCalibration,
  updateAcpCalibrationSettings,
} from "@/lib/acp/calibration.functions";

const QUALITY_TONE = {
  high: "success",
  medium: "warning",
  low: "neutral",
} as const;

const CALIBRATION_STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  ok: { label: "Calibrare validă", tone: "success" },
  insufficient_data: { label: "Date insuficiente pentru calibrare", tone: "warning" },
  unreliable: { label: "Calibrare nefiabilă — nu se aplică", tone: "warning" },
  not_configured: { label: "Fără calibrare activă", tone: "neutral" },
};

function Row({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <p className="text-sm font-semibold text-foreground text-right">{value}</p>
    </div>
  );
}

export function AcpPrecisionCard({ analysis }: { analysis: AcpAnalysisView }) {
  const queryClient = useQueryClient();
  const fetchCalibration = useServerFn(getAcpCalibration);
  const runCalibration = useServerFn(runAcpCalibration);
  const updateSettings = useServerFn(updateAcpCalibrationSettings);

  const calibrationQuery = useQuery({
    queryKey: ["acp-calibration"],
    queryFn: () => fetchCalibration({ data: {} as never }),
  });

  const runMutation = useMutation({
    mutationFn: (_: void) => runCalibration({ data: { confirm: true } }),
    onSuccess: (result) => {
      toast.success(
        result.applied
          ? `Calibrare v${result.version} aplicată pe ${result.result.sampleSize} observații reale.`
          : `Calibrare v${result.version} calculată, dar nu se aplică: ${
              CALIBRATION_STATUS[result.result.status]?.label ?? result.result.status
            }.`,
        { duration: 4000 },
      );
      void queryClient.invalidateQueries({ queryKey: ["acp-calibration"] });
    },
    onError: (error: unknown) => toastError(error),
  });

  const settingsMutation = useMutation({
    mutationFn: (enabled: boolean) => updateSettings({ data: { enabled } }),
    onSuccess: () => {
      toast.success("Setările de calibrare au fost salvate.", { duration: 2500 });
      void queryClient.invalidateQueries({ queryKey: ["acp-calibration"] });
    },
    onError: (error: unknown) => toastError(error),
  });

  const quality = analysis.quality;
  const advanced = analysis.advanced;
  const state = calibrationQuery.data;

  const freshnessAvg = (() => {
    const used = analysis.comparables.filter((c) => c.isSelected && c.freshness);
    if (used.length === 0) return null;
    return Math.round(used.reduce((sum, c) => sum + (c.freshness?.score ?? 0), 0) / used.length);
  })();

  // Stage 10: limitarea reală de date de piață. Când nicio ofertă externă nu a
  // intrat în analiză, precizia descrie doar portofoliul propriu/colaborările.
  const hasExternalComparables = analysis.comparables.some(
    (c) => c.isSelected && c.sourceType === "portal",
  );


  return (
    <SectionCard
      title="Calibrare & Precizie"
      description="Calitatea datelor folosite și efectul calibrării pe istoricul real al agenției."
      icon={Gauge}
      action={
        state?.canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => settingsMutation.mutate(!(state.settings.enabled ?? false))}
              disabled={settingsMutation.isPending}
            >
              {state.settings.enabled ? "Dezactivează calibrarea" : "Activează calibrarea"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Recalibrează
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-6">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">Calitatea datelor</h4>
            {quality ? (
              <StatusBadge tone={QUALITY_TONE[quality.level]}>
                {ACP_QUALITY_LEVEL_LABELS[quality.level]} · {Math.round(quality.score)}/100
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Indisponibil pentru această versiune</StatusBadge>
            )}
          </div>
          {quality ? (
            <>
              <div className="grid gap-x-6 sm:grid-cols-2">
                {quality.factors.map((factor) => (
                  <Row
                    key={factor.key}
                    label={factor.label}
                    hint={factor.note}
                    value={`${Math.round(factor.score)}/100`}
                  />
                ))}
              </div>
              {quality.reasons.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {quality.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Scorul de calitate se calculează la următoarea recalculare a analizei.
            </p>
          )}
          {freshnessAvg !== null ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Prospețimea medie a comparabilelor folosite: {freshnessAvg}/100.
            </p>
          ) : null}
          {!hasExternalComparables ? (
            <p className="mt-2 rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
              Analiza folosește doar oferte din portofoliul propriu și din colaborări: nu există
              încă anunțuri din surse externe de piață. Indicatorii de precizie descriu aceste date,
              nu întreaga piață, deci nu sunt validați statistic pe volum larg.
            </p>
          ) : null}
        </div>


        <div>
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">Estimare calibrată</h4>
            <StatusBadge
              tone={CALIBRATION_STATUS[advanced?.calibrationStatus ?? "not_configured"]!.tone}
            >
              {CALIBRATION_STATUS[advanced?.calibrationStatus ?? "not_configured"]!.label}
            </StatusBadge>
          </div>
          {advanced ? (
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Row
                label="Valoare deterministă (baseline)"
                value={formatMoney(advanced.baselineValue ?? null, "EUR")}
                hint="Rezultatul motorului, neinfluențat de calibrare."
              />
              <Row
                label="Valoare calibrată"
                value={formatMoney(advanced.calibratedValue ?? null, "EUR")}
                hint={advanced.reason}
              />
              <Row
                label="Factor aplicat"
                value={advanced.applied ? `× ${advanced.factor}` : "nu se aplică"}
                hint={
                  advanced.source === "segment"
                    ? `Segment: ${advanced.segmentKey ?? "—"}`
                    : advanced.source === "global"
                      ? "Factor global al agenției"
                      : null
                }
              />
              <Row
                label="Observații reale folosite"
                value={String(advanced.sampleSize ?? 0)}
                hint={
                  advanced.calibratedAt
                    ? `Calibrare v${advanced.calibrationVersion} din ${formatDateTime(advanced.calibratedAt)}`
                    : null
                }
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Această versiune a fost calculată înainte de introducerea calibrării. Recalculează
              analiza pentru a vedea comparația baseline / calibrat.
            </p>
          )}
        </div>

        {state ? (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            <p>
              Calibrarea agenției este{" "}
              <strong>{state.settings.enabled ? "activă" : "dezactivată"}</strong>, prag minim{" "}
              {state.settings.minSampleSize} observații. Disponibile acum:{" "}
              {state.observationsAvailable} observații reale
              {state.latest
                ? ` · ultima calibrare v${state.latest.version}: ${
                    CALIBRATION_STATUS[state.latest.status]?.label ?? state.latest.status
                  }`
                : " · nicio calibrare rulată încă"}
              .
            </p>
            {state.observationsAvailable < state.settings.minSampleSize ? (
              <p className="mt-1">
                Sub prag, calibrarea nu se aplică: estimările rămân strict deterministe.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
