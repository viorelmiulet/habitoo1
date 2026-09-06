/**
 * Selecția de portaluri PER PROPRIETATE, afișată compact în lista de proprietăți.
 *
 * Separă explicit cele patru concepte:
 *  - SELECTAT     = utilizatorul vrea publicarea (portal_publications.enabled);
 *  - PUBLICAT     = oferta există pe portal (portal_listings.status);
 *  - NECONFIGURAT = agenția nu are conexiune activă la portal;
 *  - ÎN CURÂND    = integrarea nu este disponibilă în registry.
 *
 * Nu introduce logică nouă de publicare: refolosește server functions existente.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, Check, Clock, Loader2, Send, Undo2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toastError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  getPropertiesPortalMatrix,
  publishPropertyToSelectedPortals,
  runPortalListingAction,
  setPropertyPortalSelection,
  type PropertyPortalCell,
} from "@/lib/portals.functions";

const STATE_META: Record<
  PropertyPortalCell["state"],
  { label: string; classes: string; dot: string }
> = {
  published: {
    label: "Publicat",
    classes: "border-success/40 bg-success/10 text-success-foreground",
    dot: "bg-success",
  },
  selected: {
    label: "Selectat pentru publicare",
    classes: "border-primary/40 bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  syncing: {
    label: "În sincronizare",
    classes: "border-warning/40 bg-warning/10 text-warning-foreground",
    dot: "bg-warning",
  },
  error: {
    label: "Eroare",
    classes: "border-destructive/40 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  withdrawn: {
    label: "Retras",
    classes: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  not_selected: {
    label: "Nepublicat",
    classes: "border-border bg-transparent text-muted-foreground",
    dot: "bg-transparent ring-1 ring-muted-foreground",
  },
  not_configured: {
    label: "Portal neconfigurat",
    classes: "border-border bg-transparent text-muted-foreground",
    dot: "bg-transparent ring-1 ring-muted-foreground",
  },
  coming_soon: {
    label: "În curând",
    classes: "border-dashed border-border bg-transparent text-muted-foreground",
    dot: "bg-transparent ring-1 ring-border",
  },
};

/** Datele de portal pentru proprietățile din pagina curentă, într-un singur apel. */
export function usePropertyPortals(propertyIds: string[]) {
  const load = useServerFn(getPropertiesPortalMatrix);
  const key = useMemo(() => [...propertyIds].sort().join(","), [propertyIds]);
  const query = useQuery({
    queryKey: ["property-portals-matrix", key],
    enabled: propertyIds.length > 0,
    queryFn: () => load({ data: { propertyIds } }),
    staleTime: 30_000,
  });
  return {
    canManage: query.data?.canManage ?? false,
    cellsOf: (propertyId: string): PropertyPortalCell[] => query.data?.properties[propertyId] ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

type PendingWithdraw = { propertyId: string; portalId: string; portalName: string };

export function PropertyPortalsCell({
  propertyId,
  cells,
  canManage,
  compact = false,
}: {
  propertyId: string;
  cells: PropertyPortalCell[];
  canManage: boolean;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const toggleFn = useServerFn(setPropertyPortalSelection);
  const publishFn = useServerFn(publishPropertyToSelectedPortals);
  const actionFn = useServerFn(runPortalListingAction);
  const [pendingWithdraw, setPendingWithdraw] = useState<PendingWithdraw | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["property-portals-matrix"] });
    queryClient.invalidateQueries({ queryKey: ["property-portals", propertyId] });
  };

  const toggle = useMutation({
    mutationFn: (input: { portalId: string; portalName: string; enabled: boolean }) =>
      toggleFn({ data: { propertyId, portalId: input.portalId, enabled: input.enabled } }).then((res) => ({
        res,
        input,
      })),
    onSuccess: ({ res, input }) => {
      refresh();
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      if (res.needsWithdraw) {
        setPendingWithdraw({ propertyId, portalId: input.portalId, portalName: input.portalName });
        toast.message(`${input.portalName}: oferta rămâne publicată până la retragere.`);
        return;
      }
      toast.success(
        input.enabled
          ? `${input.portalName} selectat pentru publicare.`
          : `${input.portalName} deselectat.`,
      );
    },
    onError: (e: Error) => toastError(e),
  });

  const publish = useMutation({
    mutationFn: () => publishFn({ data: { propertyId, mode: "publish" } }),
    onSuccess: (res) => {
      refresh();
      if (!res.ok && res.results.length === 0) {
        toast.error(res.message ?? "Publicarea nu a putut fi realizată.");
        return;
      }
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length === 0) {
        toast.success(`Trimis către: ${res.results.map((r) => r.portalName).join(", ")}.`);
      } else {
        toast.error(failed.map((r) => `${r.portalName}: ${r.message ?? "eroare"}`).join(" · "));
      }
    },
    onError: (e: Error) => toastError(e),
  });

  const withdraw = useMutation({
    mutationFn: (input: { portalId: string }) =>
      actionFn({ data: { propertyId, portalId: input.portalId, action: "withdraw" } }),
    onSuccess: (res) => {
      refresh();
      setPendingWithdraw(null);
      if (!res.ok) toast.error(res.message);
      else toast.success(res.message ?? "Oferta a fost retrasă de pe portal.");
    },
    onError: (e: Error) => toastError(e),
  });

  const busy = toggle.isPending || publish.isPending || withdraw.isPending;
  const hasSelection = cells.some((c) => c.selected && c.availability === "available" && c.configured);

  return (
    <div className={compact ? "w-full space-y-2" : "w-full space-y-2 lg:w-[300px]"}>
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Portaluri</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {cells.map((cell) => {
          const meta = STATE_META[cell.state];
          const disabled = !canManage || cell.availability !== "available" || busy;
          const icon =
            cell.state === "published" ? (
              <Check className="size-3" />
            ) : cell.state === "error" || cell.state === "not_configured" ? (
              <AlertTriangle className="size-3" />
            ) : cell.state === "syncing" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : cell.state === "coming_soon" ? (
              <Clock className="size-3" />
            ) : (
              <span className={`size-2 rounded-full ${meta.dot}`} aria-hidden />
            );
          return (
            <Tooltip key={cell.portalId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={cell.selected}
                  disabled={disabled}
                  onClick={() =>
                    toggle.mutate({
                      portalId: cell.portalId,
                      portalName: cell.portalName,
                      enabled: !cell.selected,
                    })
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors ${meta.classes} ${
                    disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:brightness-105"
                  } ${cell.selected ? "font-medium" : ""}`}
                >
                  {icon}
                  <span>{cell.portalName}</span>
                  {cell.availability !== "available" ? (
                    <span className="text-[10px] uppercase">În curând</span>
                  ) : null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 space-y-1 text-xs">
                <p className="font-medium">{cell.portalName}</p>
                <p>
                  Status: {meta.label}
                  {cell.availability === "available" ? (cell.selected ? " · selectat" : " · neselectat") : ""}
                </p>
                {cell.state === "coming_soon" ? (
                  <p>Integrarea nu este încă disponibilă. Nu se poate publica pe acest portal.</p>
                ) : null}
                {cell.state === "not_configured" ? (
                  <p>Portalul nu este configurat. Configurează-l din Setări → Integrări.</p>
                ) : null}
                {cell.lastSyncAt ? <p>Ultima sincronizare: {formatDateTime(cell.lastSyncAt)}</p> : null}
                {cell.externalId ? <p>Referință portal: {cell.externalId}</p> : null}
                {cell.lastError ? <p className="text-destructive">{cell.lastError}</p> : null}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasSelection || busy}
            onClick={() => publish.mutate()}
            title={hasSelection ? "Publică pe portalurile selectate" : "Selectează cel puțin un portal configurat"}
          >
            {publish.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Publică
          </Button>
          {cells.some((c) => c.state === "published") ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                const target = cells.find((c) => c.state === "published");
                if (target)
                  setPendingWithdraw({ propertyId, portalId: target.portalId, portalName: target.portalName });
              }}
            >
              <Undo2 className="size-3.5" /> Retrage
            </Button>
          ) : null}
          {cells.some((c) => c.state === "not_configured") ? (
            <Link to="/app/settings" className="text-xs text-primary underline-offset-2 hover:underline">
              Setări → Integrări
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Doar administratorul agenției poate modifica publicarea.</p>
      )}

      <AlertDialog open={pendingWithdraw !== null} onOpenChange={(o) => !o && setPendingWithdraw(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retragi oferta de pe {pendingWithdraw?.portalName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Oferta rămâne în Habitoo. Se retrage doar de pe acest portal; celelalte portaluri nu sunt afectate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingWithdraw && withdraw.mutate({ portalId: pendingWithdraw.portalId })}
            >
              Retrage de pe portal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
