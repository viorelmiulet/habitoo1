/**
 * Secțiunea „Raport pentru client" de pe pagina analizei ACP.
 *
 * Fiecare raport este legat de o versiune ACP concretă și rămâne accesibil
 * ulterior, cu cifrele înghețate la momentul generării.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2 } from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { listAcpVersions } from "@/lib/acp/analyses.functions";
import { acpReportUrl, generateAcpReport, listAcpReports } from "@/lib/acp/reports.functions";

export function AcpReportCard({ analysisId }: { analysisId: string }) {
  const queryClient = useQueryClient();
  const fetchVersions = useServerFn(listAcpVersions);
  const listReports = useServerFn(listAcpReports);
  const [selected, setSelected] = useState<string>(analysisId);

  const versionsQuery = useQuery({
    queryKey: ["acp-versions", analysisId],
    queryFn: () => fetchVersions({ data: { analysisId } }),
  });

  useEffect(() => {
    setSelected(analysisId);
  }, [analysisId]);

  const versions = versionsQuery.data?.versions ?? [];
  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selected) ?? null,
    [versions, selected],
  );

  const generate = useServerFn(generateAcpReport);
  const openUrl = useServerFn(acpReportUrl);

  const reportsQuery = useQuery({
    queryKey: ["acp-reports", analysisId],
    queryFn: () => listReports({ data: { analysisId } }),
  });

  const generateMutation = useMutation({
    mutationFn: () => generate({ data: { analysisId: selected } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.errorMessage ?? "Raportul nu a putut fi generat.", { duration: 4000 });
        return;
      }
      toast.success("Raport generat", { duration: 2500 });
      void queryClient.invalidateQueries({ queryKey: ["acp-reports", analysisId] });
    },
    onError: toastError,
  });

  const openMutation = useMutation({
    mutationFn: (reportId: string) => openUrl({ data: { reportId } }),
    onSuccess: (result) => {
      if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
      else toast.error("Fișierul raportului nu este disponibil.");
    },
    onError: toastError,
  });

  const reports = reportsQuery.data?.reports ?? [];
  const reportsForSelected = reports.filter((r) => r.analysisId === selected);

  return (
    <SectionCard
      title="Raport pentru client"
      description="PDF profesional generat din snapshot-ul versiunii selectate. Cifrele rămân identice și peste luni."
      icon={FileText}
      action={
        <Button
          disabled={generateMutation.isPending || versionsQuery.isLoading}
          onClick={() => generateMutation.mutate(undefined)}
        >
          {generateMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileText className="size-4" />
          )}
          {generateMutation.isPending ? "Se generează…" : "Generează raport PDF"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Versiunea analizei
            </span>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Versiunea {v.version}
                  {v.id === analysisId ? " (curentă)" : ""} · {formatDateTime(v.snapshotAt ?? v.createdAt)}
                </option>
              ))}
            </select>
          </label>
          {selectedVersion ? (
            <p className="text-xs text-muted-foreground">
              Date piață la data de {formatDateTime(selectedVersion.snapshotAt ?? selectedVersion.createdAt)} ·{" "}
              {selectedVersion.comparablesUsed} comparabile folosite
            </p>
          ) : null}
        </div>

        {reportsForSelected.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nu există încă rapoarte pentru versiunea selectată.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {reportsForSelected.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    Raport nr. {report.reportNumber} · versiunea {report.analysisVersion}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Generat {formatDateTime(report.generatedAt ?? report.createdAt)} · date piață{" "}
                    {formatDateTime(report.snapshotAt)}
                  </p>
                  {report.errorMessage ? (
                    <p className="text-xs text-destructive">{report.errorMessage}</p>
                  ) : null}
                </div>
                <StatusBadge
                  tone={
                    report.status === "ready"
                      ? "success"
                      : report.status === "failed"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {report.status === "ready"
                    ? "Disponibil"
                    : report.status === "failed"
                      ? "Eșuat"
                      : "În generare"}
                </StatusBadge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!report.hasFile || openMutation.isPending}
                  onClick={() => openMutation.mutate(report.id)}
                >
                  <Download className="size-4" />
                  Deschide
                </Button>
              </li>
            ))}
          </ul>
        )}

        {reports.length > reportsForSelected.length ? (
          <p className="text-xs text-muted-foreground">
            Alte versiuni ale acestei analize au {reports.length - reportsForSelected.length} rapoarte
            generate; schimbă versiunea pentru a le deschide.
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
