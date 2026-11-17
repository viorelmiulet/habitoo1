/**
 * Cardul „Publicare” din coloana fișei: doar starea, citită din aceeași interogare ca fila
 * de publicare. Selecția se schimbă numai în filă (starea bifelor e locală acolo).
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPropertiesPortalMatrix } from "@/lib/portals.functions";
import { PortalLogo } from "@/components/app/PortalLogo";
import { cn } from "@/lib/utils";
import { publishSummary, shortPortalState, SHORT_STATE_LABEL, type SheetPortalCell } from "./sheet-publish";

const DOT: Record<string, string> = { published: "bg-success", pending: "bg-gold", error: "bg-destructive", none: "bg-muted-foreground/40" };

export function PublishSummaryView({ cells, onOpenAll }: { cells: SheetPortalCell[]; onOpenAll: () => void }) {
  const { active, selected, total } = publishSummary(cells);
  return (
    <section className="rounded-[14px] border border-border bg-card p-[18px]" data-form-card data-sheet-publish>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-[17px] font-bold">Publicare</h2>
        <span className="font-mono text-xs text-muted-foreground">{selected} din {total} selectate</span>
      </div>
      <ul className="mt-3 space-y-2">
        {active.map((c) => {
          const s = shortPortalState(c.state);
          return (
            <li key={c.portalId} className="flex items-center gap-2 text-sm">
              <span className="bg-plate rounded-md p-0.5"><PortalLogo portalId={c.portalId} name={c.portalName} fallback={c.portalName.slice(0, 2)} size={24} /></span>
              <span className="min-w-0 flex-1 truncate">{c.portalName}</span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <span className={cn("size-2 rounded-full", DOT[s])} aria-hidden />{c.selected || s !== "none" ? SHORT_STATE_LABEL[s] : "neselectat"}
              </span>
            </li>
          );
        })}
      </ul>
      <button type="button" className="mt-3 text-sm font-medium text-ai hover:underline" onClick={onOpenAll}>Toate portalurile →</button>
    </section>
  );
}

export function PropertyPublishSummaryCard({ propertyId, onOpenAll }: { propertyId: string; onOpenAll: () => void }) {
  const loadMatrix = useServerFn(getPropertiesPortalMatrix);
  // Aceeași cheie ca PropertyPortalsCard (fără organizationId), deci același cache.
  const matrix = useQuery({
    queryKey: ["property-portals-selection", undefined, propertyId] as const,
    queryFn: () => loadMatrix({ data: { propertyIds: [propertyId] } }),
  });
  const cells = (matrix.data?.properties[propertyId] ?? []) as SheetPortalCell[];
  if (!matrix.data) return null;
  return <PublishSummaryView cells={cells} onOpenAll={onOpenAll} />;
}
