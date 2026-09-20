import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Clock3, Database, FileSearch, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionCard } from "@/components/app/SectionCard";
import { InlineLoading } from "@/components/app/LoadingState";
import { ApifySourceDialog, type ApifyJobPayload } from "./ApifySourceDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  getApifyOverview,
  runApifySource,
  type ApifyRunView,
} from "@/lib/market/apify/apify.functions";

const QUERY_KEY = ["superadmin", "apify-jobs"] as const;

function usd(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(value < 1 ? 4 : 2)} USD`;
}
function dateLabel(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}
const STATUS_LABEL: Record<string, string> = {
  running: "În curs",
  completed: "Finalizat",
  failed: "Eșuat",
  refused: "Refuzat",
};

function RunState({ status }: { status: string }) {
  const failed = status === "failed" || status === "refused";
  const Icon = failed ? AlertTriangle : status === "running" ? Clock3 : CheckCircle2;
  return (
    <Badge variant={failed ? "destructive" : status === "running" ? "secondary" : "outline"}>
      <Icon className="mr-1 size-3" />
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function ApifyEmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <FileSearch className="size-6 text-muted-foreground" />
      </span>
      <div>
        <p className="font-medium">Niciun job</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pornește prima colectare dintr-o sursă predefinită.
        </p>
      </div>
      <Button className="min-h-11" onClick={onNew}>
        <Plus className="size-4" />
        Job nou
      </Button>
    </div>
  );
}

function RunDetails({ run }: { run: ApifyRunView }) {
  const criteria = run.criteria;
  const progress =
    run.status === "running"
      ? "Jobul rulează la sursă."
      : `${run.received} rezultate citite, ${run.created + run.updated + run.unchanged + run.merged} procesate.`;
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{run.sourceLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">{run.criteriaSummary}</p>
        </div>
        <RunState status={run.status} />
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Pornit</dt>
          <dd className="mt-1 text-sm font-medium">{dateLabel(run.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Finalizat</dt>
          <dd className="mt-1 text-sm font-medium">{dateLabel(run.finishedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Limită</dt>
          <dd className="mt-1 text-sm font-medium">{run.maxItems} rezultate</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cost</dt>
          <dd className="mt-1 text-sm font-medium">
            {usd(run.costUsd)} real · {usd(run.estimatedCostUsd)} estimat
          </dd>
        </div>
      </dl>
      <div className="space-y-2">
        <p className="text-sm font-medium">Progres</p>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full bg-primary transition-all",
              run.status === "running" ? "w-2/3 animate-pulse" : "w-full",
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground">{progress}</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Parametri</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(criteria).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3 border-b border-border py-2">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="text-right font-medium">
                {value === null || value === "" ? "—" : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Rezultate</p>
        <p className="text-sm text-muted-foreground">
          {run.received} citite · {run.created} noi · {run.updated} actualizate · {run.unchanged}{" "}
          neschimbate · {run.merged} unite · {run.discarded} respinse
        </p>
      </div>
      {run.errors.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium text-destructive">Erori pe elemente</p>
          <ul className="space-y-2">
            {run.errors.map((error, index) => (
              <li
                key={`${error.reference}-${index}`}
                className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
              >
                <span className="font-medium">{error.reference}</span> · {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {run.firstItemJson ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Primul rezultat brut</summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
            {run.firstItemJson}
          </pre>
        </details>
      ) : (
        <p className="text-sm text-muted-foreground">Primul rezultat brut nu este disponibil.</p>
      )}
    </div>
  );
}

export function ApifySourcesCard() {
  const queryClient = useQueryClient();
  const loadOverview = useServerFn(getApifyOverview);
  const startRun = useServerFn(runApifySource);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const overview = useQuery({ queryKey: QUERY_KEY, queryFn: () => loadOverview({}) });
  const runs = overview.data?.runs ?? [];
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0] ?? null;
  useEffect(() => {
    if (!selectedId && runs[0]) setSelectedId(runs[0].id);
  }, [runs, selectedId]);

  const run = useMutation({
    mutationFn: (payload: ApifyJobPayload) => startRun({ data: payload }),
    onSuccess: (result) => {
      toast.success(`Job finalizat: ${result.received} rezultate, cost ${usd(result.costUsd)}.`);
      setSelectedId(result.runId);
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => toastError(error),
  });

  return (
    <SectionCard
      title="Joburi Apify"
      icon={Database}
      description="Colectările se pornesc numai manual. Rezultatele folosesc aceleași reguli de import, deduplicare și istoric."
    >
      {overview.isLoading ? (
        <InlineLoading />
      ) : (
        <>
          {overview.data && !overview.data.tokenConfigured ? (
            <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Conexiunea Apify nu este configurată; joburile nu pot porni.
            </p>
          ) : null}
          <div className="mb-4 flex justify-end">
            <Button className="min-h-11" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Job nou
            </Button>
          </div>
          {runs.length === 0 ? (
            <Panel>
              <ApifyEmptyState onNew={() => setDialogOpen(true)} />
            </Panel>
          ) : (
            <div className="grid min-h-[34rem] overflow-hidden rounded-panel border border-border lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.5fr)]">
              <div className="border-b border-border bg-muted/20 lg:border-b-0 lg:border-r">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold">Rulări</p>
                  <p className="text-xs text-muted-foreground">{runs.length} joburi recente</p>
                </div>
                <div className="max-h-[32rem] overflow-y-auto p-2">
                  {runs.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        "mb-1 min-h-11 w-full rounded-md border border-transparent p-3 text-left transition-colors hover:bg-accent",
                        selected?.id === item.id && "border-border bg-surface",
                      )}
                      aria-current={selected?.id === item.id ? "true" : undefined}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium">{item.sourceLabel}</p>
                        <RunState status={item.status} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.criteriaSummary}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{item.received} rezultate</span>
                        <span>{usd(item.costUsd)}</span>
                        <span>{dateLabel(item.startedAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>{selected ? <RunDetails run={selected} /> : null}</div>
            </div>
          )}
          <ApifySourceDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            organizations={overview.data?.organizations ?? []}
            saving={run.isPending}
            isSuperadmin
            onRun={(payload) => run.mutate(payload)}
          />
        </>
      )}
    </SectionCard>
  );
}
