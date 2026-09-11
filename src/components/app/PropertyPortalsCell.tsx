/**
 * Rezumatul publicării pe portaluri, pentru lista de proprietăți.
 *
 * Read-only: bifarea/debifarea reală se face în pagina proprietății (fila
 * Publicare), unde există confirmarea pentru retragere. Aici se vede doar
 * starea reală, și doar pentru portalurile activate agenției.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PortalLogo } from "@/components/app/PortalLogo";
import { getPropertiesPortalMatrix, type PropertyPortalCell } from "@/lib/portals.functions";

const TONE: Record<PropertyPortalCell["state"], "success" | "warning" | "danger" | "neutral"> = {
  in_feed: "success",
  published: "success",
  selected: "warning",
  syncing: "warning",
  error: "danger",
  withdrawn: "neutral",
  not_selected: "neutral",
  not_configured: "neutral",
  coming_soon: "neutral",
};

/** Matricea portalurilor pentru proprietățile din pagina curentă. */
export function usePropertyPortals(propertyIds: string[]) {
  const loadMatrix = useServerFn(getPropertiesPortalMatrix);
  const ids = [...propertyIds].sort();
  const query = useQuery({
    queryKey: ["property-portals-matrix", ids],
    enabled: ids.length > 0,
    queryFn: () => loadMatrix({ data: { propertyIds: ids } }),
  });
  return {
    hasPortals: Object.values(query.data?.properties ?? {}).some((cells) => cells.length > 0),
    cellsFor: (propertyId: string): PropertyPortalCell[] =>
      query.data?.properties[propertyId] ?? [],
  };
}

export function PropertyPortalsCell({ cells }: { cells: PropertyPortalCell[] }) {
  if (cells.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const active = cells.filter((c) => c.selected);
  if (active.length === 0)
    return <span className="text-xs text-muted-foreground">Nepublicată</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {active.map((c) => (
        <StatusBadge key={c.portalId} tone={TONE[c.state]}>
          <PortalLogo
            portalId={c.portalId}
            name={c.portalName}
            size={16}
            className="mr-1 rounded-sm"
          />
          {c.portalName}
        </StatusBadge>
      ))}
    </span>
  );
}
