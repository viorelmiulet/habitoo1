/**
 * Superadmin: starea indicelui trimestrial de preț al locuințelor (Eurostat).
 *
 * Doar strat de date: indicele nu este încă folosit în analizele ACP.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { InlineLoading } from "@/components/app/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { marketIndexSeriesLabel, periodLabel } from "@/lib/market/indices/eurostat";
import {
  getMarketPriceIndexOverview,
  syncMarketPriceIndicesNow,
} from "@/lib/market/indices/indices.functions";

const RUN_STATUS_LABEL: Record<string, string> = {
  running: "În curs",
  completed: "Finalizată",
  skipped: "Deja la zi",
  failed: "Eșuată",
};

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}

export function MarketPriceIndexCard() {
  const queryClient = useQueryClient();
  const loadOverview = useServerFn(getMarketPriceIndexOverview);
  const syncNow = useServerFn(syncMarketPriceIndicesNow);

  const overview = useQuery({
    queryKey: ["market-price-indices"],
    queryFn: () => loadOverview({}),
  });

  const sync = useMutation({
    mutationFn: () => syncNow({ data: { force: true } }),
    onSuccess: (result) => {
      const { created, updated, unchanged, invalid, received } = result.counts;
      toast.success(
        `Sincronizare ${RUN_STATUS_LABEL[result.status] ?? result.status}: ${received} valori primite, ${created} noi, ${updated} revizuite, ${unchanged} neschimbate, ${invalid} invalide.`,
      );
      if (result.errors.length > 0) toast.error(result.errors.join(" · "));
      void queryClient.invalidateQueries({ queryKey: ["market-price-indices"] });
    },
    onError: (error) => toastError(error),
  });

  const lastRun = overview.data?.runs[0] ?? null;

  return (
    <SectionCard
      title="Indice de preț al locuințelor (Eurostat)"
      description="Serie trimestrială națională pentru România. Se sincronizează săptămânal automat; indicele nu este încă folosit în analizele ACP."
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
          Sincronizează acum
        </Button>
      }
    >
      {overview.isLoading ? (
        <InlineLoading label="Se încarcă starea indicelui…" />
      ) : overview.data ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Set de date <code>{overview.data.dataset}</code>, unitate{" "}
            <code>{overview.data.unit}</code> (indice, 2015=100), regiune <code>RO</code>.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Serie</th>
                  <th className="py-2 pr-4">Perioadă acoperită</th>
                  <th className="py-2 pr-4">Cel mai nou trimestru</th>
                  <th className="py-2 pr-4">Valori</th>
                  <th className="py-2">Publicat de Eurostat</th>
                </tr>
              </thead>
              <tbody>
                {overview.data.series.map((row) => (
                  <tr key={row.series} className="border-t border-border">
                    <td className="py-2 pr-4 font-medium">{marketIndexSeriesLabel(row.series)}</td>
                    <td className="py-2 pr-4">
                      {row.first && row.last
                        ? `${periodLabel(row.first)} → ${periodLabel(row.last)}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">{row.last ? periodLabel(row.last) : "—"}</td>
                    <td className="py-2 pr-4">{row.rows}</td>
                    <td className="py-2">{dateLabel(row.publishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Ultima rulare:</span>
              {lastRun ? (
                <>
                  <Badge variant={lastRun.status === "failed" ? "destructive" : "secondary"}>
                    {RUN_STATUS_LABEL[lastRun.status] ?? lastRun.status}
                  </Badge>
                  <span>{dateLabel(lastRun.startedAt)}</span>
                  <span className="text-muted-foreground">
                    {lastRun.counts.received} primite · {lastRun.counts.created} noi ·{" "}
                    {lastRun.counts.updated} revizuite · {lastRun.counts.unchanged} neschimbate ·{" "}
                    {lastRun.counts.invalid} invalide
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">nicio rulare încă</span>
              )}
            </div>
            {lastRun && lastRun.errors.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-destructive">
                {lastRun.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
