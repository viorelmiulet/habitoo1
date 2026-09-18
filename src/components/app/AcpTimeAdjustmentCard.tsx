import { CalendarClock, Info } from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { buildAcpTimeAdjustmentView } from "@/lib/acp/time-adjustment-view";
import type { AcpAnalysisView } from "@/lib/acp/analyses.functions";

/**
 * Ajustarea în timp a comparabilelor, afișată în ecranul analizei.
 *
 * Pentru analizele calculate cu motorul v1 componenta nu afișează nimic: acele
 * analize arată exact ca înainte.
 */
export function AcpTimeAdjustmentCard({ analysis }: { analysis: AcpAnalysisView }) {
  const view = buildAcpTimeAdjustmentView({
    engineVersion: analysis.engineVersion,
    summary: analysis.timeAdjustment,
  });
  if (!view) return null;

  return (
    <SectionCard
      title="Ajustarea în timp a comparabilelor"
      description="Prețurile comparabilelor sunt aduse la trimestrul analizei cu indicele trimestrial al prețurilor locuințelor, citit din baza de date."
      icon={CalendarClock}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="neutral">Trimestrul analizei {view.analysisQuarter}</StatusBadge>
        {view.indexAvailable ? (
          <StatusBadge tone={view.appliedCount > 0 ? "success" : "warning"}>
            {view.appliedCount} ajustate · {view.skippedCount} neajustate
          </StatusBadge>
        ) : (
          <StatusBadge tone="warning">Indice indisponibil</StatusBadge>
        )}
        {view.clampedTo ? (
          <StatusBadge tone="info">Ajustare oprită la {view.clampedTo}</StatusBadge>
        ) : null}
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        {view.indexLine ? (
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Indice</dt>
            <dd className="mt-0.5">{view.indexLine}</dd>
          </div>
        ) : null}
        {view.newestQuarter ? (
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
              Publicat până la
            </dt>
            <dd className="mt-0.5">{view.newestQuarter}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{view.nationalCaveat}</span>
        </p>
        {view.clampLine ? <p>{view.clampLine}</p> : null}
        <p>{view.countsLine}</p>
        <p>{view.note}</p>
      </div>
    </SectionCard>
  );
}
