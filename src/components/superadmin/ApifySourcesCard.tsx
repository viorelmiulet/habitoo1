/**
 * Superadmin: sursele Apify pentru bazinul de date de piață.
 *
 * Colectarea rulează la Apify, pe contul clientului. Aici doar pornim manual o
 * rulare: nu există programare, cron sau execuție automată. Costul estimat și
 * costul real raportat de Apify sunt mereu vizibile lângă buton.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, Pencil, Play, Plus } from "lucide-react";
import { useState } from "react";
import { SectionCard } from "@/components/app/SectionCard";
import { InlineLoading } from "@/components/app/LoadingState";
import { ApifySourceDialog } from "./ApifySourceDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import {
  getApifyOverview,
  runApifySource,
  saveApifySource,
  setApifySourceEnabled,
  type ApifySourceView,
} from "@/lib/market/apify/apify.functions";
import type { ApifySourcePayload } from "@/lib/market/apify/source-form";

const QUERY_KEY = ["superadmin", "apify-sources"] as const;


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
  completed: "Finalizată",
  failed: "Eșuată",
  refused: "Refuzată",
};

export function ApifySourcesCard() {
  const queryClient = useQueryClient();
  const loadOverview = useServerFn(getApifyOverview);
  const toggleSource = useServerFn(setApifySourceEnabled);
  const startRun = useServerFn(runApifySource);
  const persistSource = useServerFn(saveApifySource);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApifySourceView | null>(null);

  const overview = useQuery({ queryKey: QUERY_KEY, queryFn: () => loadOverview({}) });

  const saveSource = useMutation({
    mutationFn: (payload: ApifySourcePayload) => persistSource({ data: payload }),
    onSuccess: () => {
      toast.success("Sursa a fost salvată.");
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => toastError(error),
  });


  const save = useMutation({
    mutationFn: (input: { key: string; enabled?: boolean; maxItems?: number }) =>
      toggleSource({ data: input }),
    onSuccess: () => {
      toast.success("Sursa a fost actualizată.");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => toastError(error),
  });

  const run = useMutation({
    mutationFn: (key: string) => startRun({ data: { key } }),
    onSuccess: (result) => {
      toast.success(
        `Rulare ${STATUS_LABEL[result.status] ?? result.status}: ${result.received} rezultate citite, ${result.created} noi, ${result.updated} actualizate, ${result.unchanged} neschimbate, ${result.discarded} respinse. Cost: ${usd(result.costUsd)}.`,
      );
      if (result.errors.length > 0) {
        toast.error(result.errors.slice(0, 3).map((e) => e.message).join(" · "));
      }
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => toastError(error),
  });

  const sources = overview.data?.sources ?? [];
  const organizations = overview.data?.organizations ?? [];
  const orgName = (id: string | null) =>
    id === null ? null : (organizations.find((org) => org.id === id)?.name ?? null);

  return (
    <SectionCard
      title="Surse Apify (bazin de date de piață)"
      icon={Database}
      description="Colectarea rulează la Apify, pe contul tău. Rulările se pornesc manual de aici; nu există programare automată. Rezultatele intră în bazinul de piață existent, cu deduplicare și istoric de preț."
    >
      {overview.isLoading ? (
        <InlineLoading />
      ) : (
        <>
          {overview.data && !overview.data.tokenConfigured ? (
            <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              Tokenul Apify nu este configurat. Adaugă-l în Setări proiect → Secrets, ca
              APIFY_TOKEN. Până atunci rulările sunt refuzate.
            </p>
          ) : null}

          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nu există încă surse configurate. O sursă nouă este doar configurație: actorul,
              inputul lui și maparea câmpurilor.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {sources.map((source) => (
                <li key={source.key} className="py-3 first:pt-0">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{source.label}</p>
                        <Badge variant={source.enabled ? "default" : "secondary"}>
                          {source.enabled ? "Activată" : "Oprită"}
                        </Badge>
                        {source.targets.includes("market_pool") ? (
                          <Badge variant="outline">Bazin de piață</Badge>
                        ) : null}
                        {source.targets.includes("prospects") ? (
                          <Badge variant="outline">
                            Prospecți
                            {orgName(source.prospectOrganizationId)
                              ? ` · ${orgName(source.prospectOrganizationId)}`
                              : " · fără agenție"}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        Actor {source.actorId} · sursă în bazin {source.marketSourceId} ·{" "}
                        {source.poolListings} oferte
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cost estimat pe rulare {usd(source.estimatedCostUsd)} · cheltuit luna asta{" "}
                        {usd(source.spendThisMonthUsd)} · total {usd(source.spendTotalUsd)}
                        {source.costNote ? ` · ${source.costNote}` : ""}
                      </p>
                      {source.lastRun ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Ultima rulare {dateLabel(source.lastRun.startedAt)} ·{" "}
                          {STATUS_LABEL[source.lastRun.status] ?? source.lastRun.status} ·{" "}
                          {source.lastRun.received} citite · {source.lastRun.created} noi ·{" "}
                          {source.lastRun.updated} actualizate · {source.lastRun.merged} unite între
                          portaluri · {source.lastRun.discarded} respinse · cost real{" "}
                          {usd(source.lastRun.costUsd)}
                          {source.targets.includes("prospects")
                            ? ` · prospecți: ${source.lastRun.prospectsCreated} noi, ${source.lastRun.prospectsUpdated} actualizați, ${source.lastRun.prospectsSkipped} ignorați`
                            : ""}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">Nu a rulat încă.</p>
                      )}
                      {source.lastRun && source.lastRun.discardReasons.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Motive respingere:{" "}
                          {source.lastRun.discardReasons
                            .map((reason) => `${reason.reason} (${reason.count})`)
                            .join(" · ")}
                        </p>
                      ) : null}
                      {source.lastRun && source.lastRun.errors.length > 0 ? (
                        <p className="mt-1 text-xs text-destructive">
                          {source.lastRun.errors.slice(0, 2).map((e) => e.message).join(" · ")}
                        </p>
                      ) : null}
                      {source.lastRun?.firstItemJson ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            Primul rezultat brut al ultimei rulări
                          </summary>
                          <pre className="mt-1 max-h-60 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed">
                            {source.lastRun.firstItemJson}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Maxim rezultate
                        <Input
                          className="h-8 w-24"
                          type="number"
                          min={1}
                          max={10000}
                          defaultValue={source.maxItems}
                          disabled={save.isPending}
                          onBlur={(event) => {
                            const value = Number(event.currentTarget.value);
                            if (!Number.isFinite(value) || value === source.maxItems) return;
                            save.mutate({ key: source.key, maxItems: Math.round(value) });
                          }}
                        />
                      </label>
                      <Switch
                        checked={source.enabled}
                        disabled={save.isPending}
                        aria-label={`Activează ${source.label}`}
                        onCheckedChange={(checked) =>
                          save.mutate({ key: source.key, enabled: checked })
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SectionCard>
  );
}
