/**
 * Superadmin: interogarea live a portalurilor pentru comparabile ACP.
 *
 * Nimic nu se colectează în fundal: o sursă este întrebată doar în momentul
 * rulării unei analize, și doar dacă este activată aici. Butonul „Testează
 * sursa” rulează o singură interogare și arată rezultatul normalizat, fără să
 * salveze nimic.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Radio, Rows3 } from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { InlineLoading } from "@/components/app/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import {
  listMarketQuerySources,
  setMarketQuerySource,
  testMarketQuerySource,
  type MarketQueryTestResult,
} from "@/lib/acp/market-query/sources.functions";

const QUERY_KEY = ["superadmin", "market-query-sources"] as const;

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}

export function MarketQuerySourcesCard() {
  const queryClient = useQueryClient();
  const loadSources = useServerFn(listMarketQuerySources);
  const saveSource = useServerFn(setMarketQuerySource);
  const testSource = useServerFn(testMarketQuerySource);

  const [city, setCity] = useState("");
  const [lastTest, setLastTest] = useState<{ key: string; result: MarketQueryTestResult } | null>(
    null,
  );

  const sources = useQuery({ queryKey: QUERY_KEY, queryFn: () => loadSources({}) });

  const update = useMutation({
    mutationFn: (input: {
      key: string;
      enabled?: boolean;
      timeoutMs?: number;
      radiusKm?: number;
      priceBandPercent?: number;
    }) => saveSource({ data: input }),
    onSuccess: () => {
      toast.success("Setările sursei au fost salvate.");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => toastError(error),
  });

  const test = useMutation({
    mutationFn: (key: string) =>
      testSource({ data: { key, city: city.trim() === "" ? null : city.trim() } }),
    onSuccess: (result, key) => {
      setLastTest({ key, result });
      toast.success(`${result.outcomeLabel}: ${result.comparables.length} comparabile.`);
    },
    onError: (error) => toastError(error),
  });

  return (
    <SectionCard
      title="Interogare live a portalurilor"
      description="Sursele activate sunt întrebate în momentul rulării unei analize ACP. Nimic nu se colectează în fundal și nimic nu se salvează în afara analizei."
      icon={Radio}
    >
      {sources.isLoading ? (
        <InlineLoading label="Se încarcă sursele…" />
      ) : (sources.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nu există încă surse configurate. Modulul este livrat fără nicio sursă activată.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="max-w-xs">
            <Label htmlFor="market-query-city" className="text-xs">
              Localitate pentru test
            </Label>
            <Input
              id="market-query-city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="ex. Cluj-Napoca"
            />
          </div>

          {(sources.data ?? []).map((source) => (
            <div key={source.key} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{source.label}</p>
                  <p className="text-xs text-muted-foreground">{source.baseUrl}</p>
                </div>
                <div className="flex items-center gap-3">
                  {source.hasAdapter ? null : <Badge variant="outline">Fără adaptor</Badge>}
                  <Switch
                    checked={source.enabled}
                    disabled={update.isPending}
                    onCheckedChange={(enabled) => update.mutate({ key: source.key, enabled })}
                    aria-label="Sursă activată"
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Timp maxim (ms)</Label>
                  <Input
                    type="number"
                    defaultValue={source.timeoutMs}
                    min={500}
                    max={20000}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value !== source.timeoutMs) {
                        update.mutate({ key: source.key, timeoutMs: Math.round(value) });
                      }
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Rază (km)</Label>
                  <Input
                    type="number"
                    defaultValue={source.radiusKm}
                    min={0.5}
                    max={200}
                    step={0.5}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value !== source.radiusKm) {
                        update.mutate({ key: source.key, radiusKm: value });
                      }
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Bandă de preț (%)</Label>
                  <Input
                    type="number"
                    defaultValue={source.priceBandPercent}
                    min={5}
                    max={200}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value !== source.priceBandPercent) {
                        update.mutate({ key: source.key, priceBandPercent: Math.round(value) });
                      }
                    }}
                  />
                </div>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Răspuns: {source.answeredCount} · Fără rezultate: {source.emptyCount} · Expirat:{" "}
                {source.timeoutCount} · Eroare: {source.errorCount} · Ultima interogare:{" "}
                {dateLabel(source.lastQueryAt)}
                {source.lastOutcomeLabel ? ` (${source.lastOutcomeLabel})` : ""}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={test.isPending}
                  onClick={() => test.mutate(source.key)}
                >
                  <Rows3 className="size-4" aria-hidden /> Testează sursa
                </Button>
              </div>

              {lastTest?.key === source.key ? (
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  <p className="font-medium">{lastTest.result.outcomeLabel}</p>
                  {lastTest.result.outcome.detail ? (
                    <p className="text-muted-foreground">{lastTest.result.outcome.detail}</p>
                  ) : null}
                  <ul className="mt-2 space-y-1">
                    {lastTest.result.comparables.slice(0, 10).map((c, index) => (
                      <li key={index} className="text-muted-foreground">
                        {c.price} {c.currency ?? ""} · {c.area} mp · {c.rooms ?? "—"} camere ·{" "}
                        {c.locality ?? "—"}
                        {c.zone ? `, ${c.zone}` : ""}
                      </li>
                    ))}
                  </ul>

                  {lastTest.result.marketContext ? (
                    <div className="mt-3 border-t border-border pt-2">
                      <p className="font-medium">{lastTest.result.marketContext.title}</p>
                      <ul className="mt-1 space-y-0.5">
                        {lastTest.result.marketContext.lines.map((line) => (
                          <li key={line.label} className="text-muted-foreground">
                            {line.label}: {line.value}
                          </li>
                        ))}
                      </ul>
                      {lastTest.result.marketContext.note ? (
                        <p className="mt-1 text-muted-foreground">
                          {lastTest.result.marketContext.note}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {lastTest.result.requestedUrls.length > 0 ? (
                    <div className="mt-3 border-t border-border pt-2">
                      <p className="font-medium">Adrese cerute</p>
                      <ul className="mt-1 space-y-0.5">
                        {lastTest.result.requestedUrls.map((requested) => (
                          <li key={requested} className="break-all text-muted-foreground">
                            {requested}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <p className="mt-2 text-muted-foreground">Rezultatul testului nu este salvat.</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
