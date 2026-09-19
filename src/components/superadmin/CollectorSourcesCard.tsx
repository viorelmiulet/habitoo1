/**
 * Superadmin: sursele colectorului de anunțuri.
 *
 * Nimic nu se colectează automat: fiecare sursă pornește doar după ce este
 * activată aici. Butonul „Rulează acum” pornește o singură parcurgere.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Radar } from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { InlineLoading } from "@/components/app/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import {
  listCollectorSources,
  runCollectorSourceNow,
  setCollectorSourceEnabled,
} from "@/lib/collector/collector.functions";

const QUERY_KEY = ["superadmin", "collector-sources"] as const;

const RUN_STATUS_LABEL: Record<string, string> = {
  running: "În curs",
  done: "Finalizată",
  stopped: "Oprită",
  failed: "Eșuată",
};

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}

export function CollectorSourcesCard() {
  const queryClient = useQueryClient();
  const loadSources = useServerFn(listCollectorSources);
  const toggleSource = useServerFn(setCollectorSourceEnabled);
  const runNow = useServerFn(runCollectorSourceNow);

  const sources = useQuery({ queryKey: QUERY_KEY, queryFn: () => loadSources({}) });

  const toggle = useMutation({
    mutationFn: (input: { key: string; enabled: boolean }) => toggleSource({ data: input }),
    onSuccess: (result) => {
      toast.success(result.enabled ? "Sursa a fost activată." : "Sursa a fost oprită.");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => toastError(error),
  });

  const run = useMutation({
    mutationFn: (key: string) => runNow({ data: { key } }),
    onSuccess: (result) => {
      toast.success(
        `Rulare ${RUN_STATUS_LABEL[result.status] ?? result.status}: ${result.pagesFetched} pagini, ${result.itemsFound} anunțuri găsite, ${result.itemsNew} noi, ${result.itemsUpdated} actualizate.`,
      );
      if (result.stopLabel) toast.info(result.stopLabel);
      if (result.errors.length > 0) toast.error(result.errors.slice(0, 3).join(" · "));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => toastError(error),
  });

  return (
    <SectionCard
      title="Colector de anunțuri"
      icon={Radar}
      description="Sursele sunt oprite implicit. O sursă este parcursă doar după ce o activezi, cu pauza și limitele cerute de site-ul respectiv."
    >
      {sources.isLoading ? (
        <InlineLoading />
      ) : (sources.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nu există încă surse configurate. Motorul de colectare este gata, sursele se adaugă
          separat.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {(sources.data ?? []).map((source) => (
            <li key={source.key} className="flex flex-wrap items-start gap-3 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{source.label}</p>
                  <Badge variant={source.enabled ? "default" : "secondary"}>
                    {source.enabled ? "Activată" : "Oprită"}
                  </Badge>
                  {source.hasAdapter ? null : (
                    <Badge variant="outline">Fără adaptor de citire</Badge>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{source.baseUrl}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pauză {Math.round(source.crawlDelayMs / 1000)}s · maxim {source.maxPagesPerRun}{" "}
                  pagini pe rulare · {source.itemsActive} anunțuri urmărite
                </p>
                {source.lastRun ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ultima rulare {dateLabel(source.lastRun.startedAt)} ·{" "}
                    {RUN_STATUS_LABEL[source.lastRun.status] ?? source.lastRun.status} ·{" "}
                    {source.lastRun.pagesFetched} pagini · {source.lastRun.itemsNew} noi ·{" "}
                    {source.lastRun.itemsUpdated} actualizate
                    {source.lastRun.stopLabel ? ` · ${source.lastRun.stopLabel}` : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Nu a rulat încă.</p>
                )}
                {source.lastRun && source.lastRun.errors.length > 0 ? (
                  <p className="mt-1 text-xs text-destructive">
                    {source.lastRun.errors.slice(0, 2).join(" · ")}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={source.enabled}
                  disabled={toggle.isPending}
                  aria-label={`Activează ${source.label}`}
                  onCheckedChange={(checked) =>
                    toggle.mutate({ key: source.key, enabled: checked })
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!source.enabled || run.isPending}
                  onClick={() => run.mutate(source.key)}
                >
                  <Play className="mr-1.5 size-3.5" />
                  Rulează acum
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
