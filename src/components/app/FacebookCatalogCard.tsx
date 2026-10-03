import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Copy } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { StatusPill, type StatusPillState } from "@/components/ui/status-pill";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { generateSiteFeedToken } from "@/lib/site-feed.functions";
import { getFacebookCatalogOverview } from "@/lib/facebook-catalog.functions";
import {
  EXCLUSION_REASON_LABEL,
  FACEBOOK_CATALOG_PATH,
  FACEBOOK_CATALOG_PUBLIC_ORIGIN,
  FACEBOOK_CATALOG_STATE_LABEL,
  facebookCatalogUrl,
  type FacebookCatalogState,
} from "@/lib/facebook-catalog-status";

const PILL: Record<FacebookCatalogState, StatusPillState> = {
  connected: "published",
  error: "error",
  disconnected: "inactive",
};

export function FacebookCatalogCard() {
  const queryClient = useQueryClient();
  const load = useServerFn(getFacebookCatalogOverview);
  const runGenerate = useServerFn(generateSiteFeedToken);
  const [plainUrl, setPlainUrl] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  const q = useQuery({ queryKey: ["facebook-catalog-overview"], queryFn: () => load() });

  const generate = useMutation({
    mutationFn: () => runGenerate({ data: {} }),
    onSuccess: (res) => {
      setPlainUrl(facebookCatalogUrl(res.token));
      queryClient.invalidateQueries({ queryKey: ["facebook-catalog-overview"] });
      queryClient.invalidateQueries({ queryKey: ["site-feed-status"] });
    },
    onError: (e: Error) => toastError(e),
  });

  if (q.isLoading) return <InlineLoading label="Se încarcă Catalogul Facebook…" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Adresa a fost copiată.");
    } catch {
      toast.error("Copierea nu a funcționat. Selectează manual textul.");
    }
  };

  const reasons = (Object.keys(EXCLUSION_REASON_LABEL) as (keyof typeof EXCLUSION_REASON_LABEL)[])
    .filter((r) => d.excluded[r] > 0);

  return (
    <div className="panel space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Catalog Facebook</h3>
          <p className="text-sm text-muted-foreground">
            Anunțurile tale apar în Meta Commerce Manager și pot fi folosite în reclame.
          </p>
        </div>
        <StatusPill state={PILL[d.state]} dot>
          {FACEBOOK_CATALOG_STATE_LABEL[d.state]}
        </StatusPill>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Adresa feed-ului</p>
        {plainUrl ? (
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <code className="min-w-0 flex-1 break-all rounded-md border bg-muted px-3 py-2 text-xs">
                {plainUrl}
              </code>
              <Button variant="outline" onClick={() => copy(plainUrl)}>
                <Copy className="size-4" /> Copiază
              </Button>
            </div>
            <p className="text-sm text-destructive">
              Copiază adresa acum. Tokenul nu se mai poate vedea după ce părăsești pagina.
            </p>
          </div>
        ) : d.hasToken ? (
          <div className="space-y-2">
            <code className="block break-all rounded-md border bg-muted px-3 py-2 text-xs">
              {`${FACEBOOK_CATALOG_PUBLIC_ORIGIN}${FACEBOOK_CATALOG_PATH}?token=TOKENUL_TĂU`}
            </code>
            <p className="text-sm text-muted-foreground">
              Folosește tokenul de feed al agenției (din Setări → Integrări). Valoarea lui se vede
              doar la generare.
            </p>
          </div>
        ) : (
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            Generează token
          </Button>
        )}
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Intră în catalog</dt>
          <dd className="font-medium">{d.included}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Excluse</dt>
          <dd className="font-medium">{d.excludedTotal}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ultima citire de Meta</dt>
          <dd>{d.lastReadAt ? formatDateTime(d.lastReadAt) : "Încă nu a fost citit"}</dd>
        </div>
      </dl>

      {d.excludedTotal > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {reasons.map((r) => `${EXCLUSION_REASON_LABEL[r]}: ${d.excluded[r]}`).join(" · ")}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setShowExcluded((v) => !v)}>
            {showExcluded ? "Ascunde anunțurile excluse" : "Vezi anunțurile excluse"}
          </Button>
          {showExcluded ? (
            <ul className="divide-y rounded-md border text-sm">
              {d.excludedItems.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <Link to="/app/properties/$id" params={{ id: it.id }} className="min-w-0 underline">
                    {it.reference ? `${it.reference} · ` : ""}
                    {it.title}
                  </Link>
                  <span className="text-muted-foreground">{EXCLUSION_REASON_LABEL[it.reason]}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <details className="group rounded-md border px-3 py-2 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
          Cum îl conectez la Meta
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Deschide Meta Commerce Manager.</li>
          <li>Creează un catalog de tip „Home listings”.</li>
          <li>Mergi la Surse de date → Feed de date → URL programat.</li>
          <li>Lipește adresa feed-ului de mai sus.</li>
          <li>Alege citirea zilnică și salvează.</li>
        </ol>
      </details>
    </div>
  );
}
