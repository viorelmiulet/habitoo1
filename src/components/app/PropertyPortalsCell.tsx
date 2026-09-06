/**
 * Selecția de portaluri PER PROPRIETATE, afișată compact în lista de proprietăți.
 *
 * Separă explicit cele patru concepte:
 *  - SELECTAT     = utilizatorul vrea publicarea (portal_publications.enabled);
 *  - PUBLICAT     = oferta există pe portal (portal_listings.status);
 *  - NECONFIGURAT = agenția nu are conexiune activă la portal;
 *  - ÎN CURÂND    = integrarea nu este disponibilă în registry.
 *
 * AFIȘARE DOAR: sursa de adevăr a publicării este checkbox-ul din pagina de
 * editare a proprietății. Aici nu se poate schimba selecția.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Clock, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import { getPropertiesPortalMatrix, type PropertyPortalCell } from "@/lib/portals.functions";

const STATE_META: Record<
  PropertyPortalCell["state"],
  { label: string; classes: string; dot: string }
> = {
  in_feed: {
    label: "În feed",
    classes: "border-success/40 bg-success/10 text-success",
    dot: "bg-success",
  },
  published: {
    label: "Publicat",
    classes: "border-success/40 bg-success/10 text-success",
    dot: "bg-success",
  },
  selected: {
    label: "Selectat pentru publicare",
    classes: "border-primary/40 bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  syncing: {
    label: "În sincronizare",
    classes: "border-warning/50 bg-warning/15 text-foreground",
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
  return (
    <div className={compact ? "w-full space-y-2" : "w-full space-y-2 lg:w-[300px]"}>
      {compact ? null : (
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Portaluri</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {cells.map((cell) => {
          const meta = STATE_META[cell.state];
          const icon =
            cell.state === "published" || cell.state === "in_feed" ? (
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
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${meta.classes} ${
                    cell.selected ? "font-medium" : ""
                  }`}
                >
                  {icon}
                  <span>{cell.portalName}</span>
                  {cell.availability !== "available" ? (
                    <span className="text-[10px] uppercase">În curând</span>
                  ) : null}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 space-y-1 text-xs">
                <p className="font-medium">{cell.portalName}</p>
                <p>
                  Status: {meta.label}
                  {cell.availability === "available" ? (cell.selected ? " · bifat" : " · nebifat") : ""}
                </p>
                {cell.state === "coming_soon" ? (
                  <p>Integrarea nu este încă disponibilă.</p>
                ) : null}
                {!cell.pushSupported && cell.availability === "available" ? (
                  <p>Portalul preia ofertele automat din feedul Habitoo.</p>
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
        <Link
          to="/app/properties/$id"
          params={{ id: propertyId }}
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          Editează publicarea
        </Link>
      ) : (
        <p className="text-[11px] text-muted-foreground">Publicarea se gestionează din pagina proprietății.</p>
      )}
    </div>
  );
}
