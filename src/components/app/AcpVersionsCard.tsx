import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GitCompareArrows, History, RefreshCw } from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney } from "@/lib/format";
import { acpEngineVersionLabel } from "@/lib/acp/time-adjustment-view";
import {
  compareAcpVersions,
  listAcpVersions,
  recalculateAcpAsNewVersion,
} from "@/lib/acp/analyses.functions";
import type { AcpNumericDiff, AcpVersionComparison } from "@/lib/acp/versioning";

function DiffValue({
  diff,
  currency,
  suffix,
  plain,
}: {
  diff: AcpNumericDiff;
  currency: string;
  suffix?: string;
  plain?: boolean;
}) {
  const fmt = (value: number | null) =>
    value === null ? "—" : plain ? `${value}${suffix ?? ""}` : `${formatMoney(value, currency)}${suffix ?? ""}`;
  const tone =
    diff.absolute === null || diff.absolute === 0
      ? "text-muted-foreground"
      : diff.absolute > 0
        ? "text-success"
        : "text-destructive";
  return (
    <div className="flex flex-wrap items-baseline justify-end gap-x-2 text-sm">
      <span className="text-muted-foreground">{fmt(diff.a)}</span>
      <span className="text-muted-foreground">→</span>
      <span className="font-medium">{fmt(diff.b)}</span>
      {diff.absolute !== null && diff.absolute !== 0 ? (
        <span className={cn("text-xs font-medium", tone)}>
          {diff.absolute > 0 ? "+" : ""}
          {plain ? diff.absolute : formatMoney(diff.absolute, currency)}
          {diff.percent !== null ? ` (${diff.percent > 0 ? "+" : ""}${diff.percent}%)` : ""}
        </span>
      ) : null}
    </div>
  );
}

function ComparisonBody({ comparison }: { comparison: AcpVersionComparison }) {
  const currency = comparison.versionB.currency ?? comparison.versionA.currency ?? "EUR";
  const rows: { label: string; diff: AcpNumericDiff; suffix?: string; plain?: boolean }[] = [
    { label: "Valoare estimată", diff: comparison.estimatedValue },
    { label: "Minim estimat", diff: comparison.estimatedMin },
    { label: "Maxim estimat", diff: comparison.estimatedMax },
    { label: "Preț recomandat", diff: comparison.recommendedListingPrice },
    { label: "Median €/mp", diff: comparison.medianPricePerSqm, suffix: "/mp" },
    { label: "Medie €/mp", diff: comparison.averagePricePerSqm, suffix: "/mp" },
    { label: "Încredere", diff: comparison.confidenceScore, plain: true, suffix: "/100" },
    { label: "Comparabile găsite", diff: comparison.comparablesCount, plain: true },
    { label: "Comparabile folosite", diff: comparison.comparablesUsed, plain: true },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {[comparison.versionA, comparison.versionB].map((v, index) => (
          <div key={v.id} className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {index === 0 ? "Versiunea A" : "Versiunea B"}
            </p>
            <p className="mt-0.5 text-sm font-semibold">Versiunea {v.version}</p>
            <p className="text-xs text-muted-foreground">{acpEngineVersionLabel(v.engineVersion)}</p>
            <p className="text-xs text-muted-foreground">
              Date piață la data de{" "}
              {v.snapshotAt ? formatDateTime(v.snapshotAt) : formatDateTime(v.createdAt)}
            </p>
            {v.createdByName ? (
              <p className="text-xs text-muted-foreground">{v.createdByName}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="px-4 py-2.5 text-muted-foreground">{row.label}</td>
                <td className="px-4 py-2.5 text-right">
                  <DiffValue
                    diff={row.diff}
                    currency={currency}
                    suffix={row.suffix}
                    plain={row.plain}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Surse și oferte (găsite / folosite / excluse)
        </h4>
        <ul className="mt-2 space-y-1.5 text-sm">
          {comparison.sources.map((s) => (
            <li
              key={`${s.sourceType}-${s.sourceName}`}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-muted-foreground">{s.sourceName}</span>
              <span className="font-medium">
                {s.itemsFound.a ?? "—"}/{s.itemsUsed.a ?? "—"}/{s.itemsExcluded.a ?? "—"} →{" "}
                {s.itemsFound.b ?? "—"}/{s.itemsUsed.b ?? "—"}/{s.itemsExcluded.b ?? "—"}
              </span>
            </li>
          ))}
          {comparison.sources.length === 0 ? (
            <li className="text-muted-foreground">Nicio sursă înregistrată.</li>
          ) : null}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Comparabile comune ({comparison.comparables.common.length})
          </h4>
          <ul className="mt-2 space-y-2 text-xs">
            {comparison.comparables.common.map((c) => (
              <li key={c.key} className="rounded-lg border border-border p-2.5">
                <p className="truncate font-medium">{c.title}</p>
                <p className="text-muted-foreground">
                  {c.changes.length === 0 ? "Fără modificări" : c.changes.join(", ")}
                </p>
              </li>
            ))}
            {comparison.comparables.common.length === 0 ? (
              <li className="text-muted-foreground">Niciunul.</li>
            ) : null}
          </ul>
        </div>
        {(
          [
            ["Adăugate", comparison.comparables.added],
            ["Eliminate", comparison.comparables.removed],
          ] as const
        ).map(([label, items]) => (
          <div key={label}>
            <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {label} ({items.length})
            </h4>
            <ul className="mt-2 space-y-2 text-xs">
              {items.map((c) => (
                <li key={c.key} className="rounded-lg border border-border p-2.5">
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="text-muted-foreground">
                    {c.sourceName} · scor {c.similarityScore}
                  </p>
                </li>
              ))}
              {items.length === 0 ? <li className="text-muted-foreground">Niciunul.</li> : null}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lista versiunilor unei analize ACP + recalculare ca versiune nouă + comparație. */
export function AcpVersionsCard({ analysisId }: { analysisId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchVersions = useServerFn(listAcpVersions);
  const recalculate = useServerFn(recalculateAcpAsNewVersion);
  const compare = useServerFn(compareAcpVersions);

  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<AcpVersionComparison | null>(null);

  const { data } = useQuery({
    queryKey: ["acp-versions", analysisId],
    queryFn: () => fetchVersions({ data: { analysisId } }),
  });

  const versions = data?.versions ?? [];
  const isHistoric = useMemo(
    () => Boolean(data && data.latestVersionId !== data.currentId),
    [data],
  );

  const recalculateMutation = useMutation({
    mutationFn: () => recalculate({ data: { analysisId } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["acp-versions"] });
      void queryClient.invalidateQueries({ queryKey: ["acp-analyses"] });
      if (result.ok) {
        toast.success(`Versiunea ${result.version} a fost creată`, { duration: 2500 });
      } else {
        toast.error(
          `Versiunea ${result.version} nu a putut fi finalizată: ${result.errorMessage ?? "date insuficiente"}. Versiunea anterioară rămâne neschimbată.`,
          { duration: 5000 },
        );
      }
      void navigate({ to: "/app/acp/$id", params: { id: result.analysisId } });
    },
    onError: toastError,
  });

  const compareMutation = useMutation({
    mutationFn: () =>
      compare({ data: { versionAId: selected[0]!, versionBId: selected[1]! } }),
    onSuccess: setComparison,
    onError: toastError,
  });

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2),
    );
  };

  return (
    <>
      <SectionCard
        title="Versiuni analiză"
        description="Fiecare versiune este un snapshot istoric: nu se recalculează automat. Recalcularea creează o versiune nouă."
        icon={History}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selected.length !== 2 || compareMutation.isPending}
              onClick={() => compareMutation.mutate(undefined)}
            >
              <GitCompareArrows className="size-4" />
              Compară versiuni
            </Button>
            <Button
              size="sm"
              disabled={recalculateMutation.isPending}
              onClick={() => recalculateMutation.mutate(undefined)}
            >
              <RefreshCw
                className={cn("size-4", recalculateMutation.isPending && "animate-spin")}
              />
              {recalculateMutation.isPending ? "Se creează…" : "Recalculează cu date actuale"}
            </Button>
          </div>
        }
        flush
      >
        {isHistoric ? (
          <div className="border-b border-border bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
            Vizualizezi un snapshot istoric. Există o versiune mai nouă a acestei analize.
          </div>
        ) : null}
        <ul className="divide-y divide-border">
          {versions.map((v) => {
            const isCurrent = v.id === data?.currentId;
            const index = selected.indexOf(v.id);
            return (
              <li
                key={v.id}
                className={cn(
                  "flex flex-wrap items-center gap-4 px-5 py-3.5",
                  isCurrent && "bg-primary/5",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(v.id)}
                  aria-pressed={index >= 0}
                  className={cn(
                    "size-6 shrink-0 rounded-md border text-[11px] font-semibold",
                    index >= 0
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {index >= 0 ? (index === 0 ? "A" : "B") : ""}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">Versiunea {v.version}</p>
                    {isCurrent ? <StatusBadge tone="info">Afișată</StatusBadge> : null}
                    <StatusBadge tone="neutral">
                      {acpEngineVersionLabel(v.engineVersion)}
                    </StatusBadge>
                    {v.errorMessage ? <StatusBadge tone="warning">Eșuată</StatusBadge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Date piață la data de{" "}
                    {v.snapshotAt ? formatDateTime(v.snapshotAt) : formatDateTime(v.createdAt)}
                    {v.createdByName ? ` · ${v.createdByName}` : ""}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground">Comparabile</p>
                    <p className="font-medium">
                      {v.comparablesUsed}/{v.comparablesCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Valoare</p>
                    <p className="font-medium">
                      {formatMoney(v.estimatedValue, v.currency ?? "EUR")}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Preț recomandat</p>
                    <p className="font-medium">
                      {formatMoney(v.recommendedListingPrice, v.currency ?? "EUR")}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Încredere</p>
                    <p className="font-medium">
                      {v.confidenceScore !== null ? `${v.confidenceScore}/100` : "—"}
                    </p>
                  </div>
                </div>
                {!isCurrent ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate({ to: "/app/acp/$id", params: { id: v.id } })}
                  >
                    Deschide
                  </Button>
                ) : null}
              </li>
            );
          })}
          {versions.length === 0 ? (
            <li className="px-5 py-4 text-sm text-muted-foreground">
              Nicio versiune înregistrată.
            </li>
          ) : null}
        </ul>
      </SectionCard>

      <Dialog open={Boolean(comparison)} onOpenChange={(open) => !open && setComparison(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comparație versiuni</DialogTitle>
            <DialogDescription>
              Toate cifrele provin din motorul determinist, exact cum au fost salvate în fiecare
              snapshot.
            </DialogDescription>
          </DialogHeader>
          {comparison ? <ComparisonBody comparison={comparison} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
