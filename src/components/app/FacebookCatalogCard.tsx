import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { StatusPill, type StatusPillState } from "@/components/ui/status-pill";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { PortalLogo } from "@/components/app/PortalLogo";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  generateFacebookCatalogToken,
  getFacebookCatalogOverview,
  setFacebookCatalogAgentPermission,
} from "@/lib/facebook-catalog.functions";
import { bulkSetFacebookCatalog } from "@/lib/facebook-catalog-listings.functions";
import {
  EXCLUSION_REASON_LABEL,
  FACEBOOK_CATALOG_STATE_LABEL,
  type FacebookCatalogState,
} from "@/lib/facebook-catalog-status";

const PILL: Record<FacebookCatalogState, StatusPillState> = {
  connected: "published",
  error: "error",
  disconnected: "inactive",
};

export function FacebookCatalogCard({ portalList = false }: { portalList?: boolean }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getFacebookCatalogOverview);
  const runGenerate = useServerFn(generateFacebookCatalogToken);
  const saveAgentPermission = useServerFn(setFacebookCatalogAgentPermission);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const runBulk = useServerFn(bulkSetFacebookCatalog);
  const [bulkMode, setBulkMode] = useState<"add_eligible" | "remove_all" | null>(null);
  const bulk = useMutation({
    mutationFn: (mode: "add_eligible" | "remove_all") => runBulk({ data: { mode } }),
    onSuccess: (res, mode) => {
      toast.success(
        mode === "add_eligible"
          ? `${res.changed} anunțuri adăugate în catalog.`
          : `${res.changed} anunțuri scoase din catalog.`,
      );
      queryClient.invalidateQueries({ queryKey: ["facebook-catalog-overview"] });
      queryClient.invalidateQueries({ queryKey: ["property-facebook-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["property-promotion"] });
    },
    onError: (e: Error) => toastError(e),
  });
  const [showExcluded, setShowExcluded] = useState(false);

  const agentPermission = useMutation({
    mutationFn: (enabled: boolean) => saveAgentPermission({ data: { enabled } }),
    onSuccess: () => {
      toast.success("Permisiunea agenților a fost salvată.");
      queryClient.invalidateQueries({ queryKey: ["facebook-catalog-overview"] });
      queryClient.invalidateQueries({ queryKey: ["property-facebook-catalog"] });
    },
    onError: (e: Error) => toastError(e),
  });

  const q = useQuery({ queryKey: ["facebook-catalog-overview"], queryFn: () => load() });

  const generate = useMutation({
    mutationFn: () => runGenerate(),
    onSuccess: (res) => {
      toast.success(res.regenerated ? "Adresa a fost regenerată." : "Adresa feedului a fost generată.");
      queryClient.invalidateQueries({ queryKey: ["facebook-catalog-overview"] });
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
    <div className={portalList ? "min-w-0 max-w-full space-y-5" : "panel min-w-0 max-w-full space-y-5 p-5"}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {portalList ? <PortalLogo portalId="facebook_catalog" name="Catalog Facebook" size={40} /> : null}
          <div className="min-w-0">
            <h3 className={portalList ? "truncate text-[17px] leading-6 font-bold" : "truncate font-medium"}>Catalog Facebook</h3>
            <p className="break-words text-sm text-muted-foreground">
              Anunțurile tale apar în Meta Commerce Manager și pot fi folosite în reclame.
            </p>
          </div>
        </div>
        <StatusPill state={PILL[d.state]} dot>
          {FACEBOOK_CATALOG_STATE_LABEL[d.state]}
        </StatusPill>
      </div>

      {portalList ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 rounded-lg border p-4">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="facebook-catalog-agents-enabled" className="text-sm">
              Agenții pot adăuga anunțuri în Catalog Facebook
            </Label>
            <p className="text-xs text-muted-foreground">
              Oprit: doar managerul agenției bifează anunțuri pentru catalog. Pornit: fiecare agent o poate face pentru anunțurile lui.
            </p>
          </div>
          <Switch
            id="facebook-catalog-agents-enabled"
            checked={d.agentsCanManage}
            disabled={agentPermission.isPending}
            onCheckedChange={(enabled) => agentPermission.mutate(enabled)}
          />
        </div>
      ) : null}

      <div className="min-w-0 max-w-full space-y-2">
        <p className="text-sm font-medium">Adresa feed-ului</p>
        {d.feedUrl ? (
          <div className="space-y-2">
            <div className="flex min-w-0 max-w-full flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                value={d.feedUrl}
                aria-label="Adresa feedului Catalog Facebook"
                className="w-full min-w-0 max-w-full flex-1 truncate font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button variant="outline" onClick={() => copy(d.feedUrl!)}>
                <Copy className="size-4" /> Copiază
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={generate.isPending}
            >
              <RefreshCw className="size-4" /> Regenerează adresa
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {d.hasLegacySiteToken ? (
              <p className="text-sm text-muted-foreground">
                Generează o adresă dedicată Catalogului Facebook. Feedul pentru site rămâne neschimbat.
              </p>
            ) : null}
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
              Generează adresa feedului
            </Button>
          </div>
        )}
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">În catalog</dt>
          <dd className="font-medium">{d.included} anunțuri în catalog</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Excluse</dt>
          <dd className="font-medium">{d.excludedTotal} activate, dar excluse</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ultima citire de Meta</dt>
          <dd>{d.lastReadAt ? formatDateTime(d.lastReadAt) : "Încă nu a fost citit"}</dd>
        </div>
      </dl>

      <div className="flex min-w-0 flex-wrap gap-2">
        <Button className="h-auto min-h-9 max-w-full whitespace-normal text-left" variant="outline" size="sm" disabled={bulk.isPending} onClick={() => setBulkMode("add_eligible")}>
          Adaugă toate anunțurile eligibile
        </Button>
        <Button className="h-auto min-h-9 max-w-full whitespace-normal text-left" variant="outline" size="sm" disabled={bulk.isPending} onClick={() => setBulkMode("remove_all")}>
          Scoate toate anunțurile
        </Button>
      </div>

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

      <details open={portalList || undefined} className="group rounded-md border px-3 py-2 text-sm">
        {portalList ? (
          <p className="font-medium">Cum îl conectez la Meta</p>
        ) : (
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
            Cum îl conectez la Meta
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
        )}
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Deschide Meta Commerce Manager.</li>
          <li>Creează un catalog de tip „Home listings”.</li>
          <li>Mergi la Surse de date → Feed de date → URL programat.</li>
          <li>Lipește adresa feed-ului de mai sus.</li>
          <li>Alege citirea zilnică și salvează.</li>
        </ol>
        {portalList ? (
          <div className="mt-3 space-y-3 border-t pt-3">
            <p className="text-muted-foreground">
              Doar anunțurile bifate pentru Catalog Facebook, în fila Publicare a anunțului, apar în catalog.
              Un anunț fără preț, coordonate, poze sau oraș este exclus.
            </p>
            <Button asChild variant="outline" size="sm">
              <a href="https://www.facebook.com/commerce_manager" target="_blank" rel="noreferrer">
                Deschide Meta Commerce Manager <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
        ) : null}
      </details>
      <ConfirmDialog
        open={bulkMode !== null}
        onOpenChange={(o) => (o ? null : setBulkMode(null))}
        title={bulkMode === "remove_all" ? "Scoți toate anunțurile din catalog?" : "Adaugi toate anunțurile eligibile?"}
        description={
          bulkMode === "remove_all"
            ? "Niciun anunț nu va mai apărea în Catalogul Facebook la următoarea citire."
            : "Se activează doar anunțurile publicate care au preț, coordonate, poze și oraș."
        }
        confirmLabel={bulkMode === "remove_all" ? "Scoate toate" : "Adaugă"}
        destructive={bulkMode === "remove_all"}
        onConfirm={async () => {
          if (bulkMode) await bulk.mutateAsync(bulkMode);
          setBulkMode(null);
        }}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Regenerezi adresa feedului?"
        description="Adresa veche nu va mai funcționa; trebuie să o actualizezi în Meta."
        confirmLabel="Regenerează"
        destructive
        onConfirm={async () => {
          await generate.mutateAsync();
        }}
      />
    </div>
  );
}
