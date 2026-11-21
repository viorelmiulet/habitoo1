import { useEffect, useRef, useState } from "react";
import { portalLogoIds } from "@/lib/portals/registry";
import { portalLogoLayout } from "./portal-logo-layout";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { portalListingLink } from "@/lib/portals/listing-links";
import { portalDotTone, portalStateLabel } from "@/lib/property-list-row";
import { cn } from "@/lib/utils";

type Cell = Parameters<typeof portalListingLink>[0] & {
  portalId: string;
  portalName: string;
  state: Parameters<typeof portalDotTone>[0];
};

/** Logo-urile portalurilor selectate dintr-un rând al listei, cu link spre anunț și punct de stare. */
export function PortalLogoLinks({ cells, publishingHref }: { cells: Cell[]; publishingHref?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ height: 96, width: Infinity });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const photo = element.closest("[data-property-row]")?.querySelector("[data-property-photo]");
    const measure = () => setBounds({ height: photo?.getBoundingClientRect().height || 96, width: element.getBoundingClientRect().width || Infinity });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (photo) observer.observe(photo);
    measure();
    return () => observer.disconnect();
  }, []);
  const layout = portalLogoLayout(cells.length, bounds.height, bounds.width, cells.map(c => portalLogoIds(c.portalId).length));
  const hidden = cells.slice(layout.visibleCount);
  const error = cells.find(c => c.state === "error");
  const published = cells.filter(c => c.state === "published" || c.state === "in_feed").length;
  const status = error ? `Eroare pe ${error.portalName}` : published > 0 ? `Publicat pe ${published} ${published === 1 ? "portal" : "portaluri"}` : `Nepublicată${publishingHref ? " · Publică pe portaluri" : ""}`;
  if (cells.length === 0 && !publishingHref) return null;
  return (
    <div ref={ref} className="min-w-0" data-portal-cell style={{ maxHeight: bounds.height }}>
      <div className="grid w-fit" data-portal-grid style={{ gridTemplateColumns: layout.widths.map(w => `${w}px`).join(" "), gridAutoRows: layout.boxSize, gap: layout.gap }}>
      {cells.slice(0, layout.visibleCount).map((cell) => {
        const link = portalListingLink(cell);
        const tone = portalDotTone(cell.state);
        const logoBox = (
          <>
            <PortalLogoStack portalId={cell.portalId} name={cell.portalName} size={layout.logoSize} alt={cell.portalName} />
            <span className={cn("absolute right-0 bottom-0 rounded-full border border-surface", {
              "bg-success": tone === "success",
              "bg-warning": tone === "warning",
              "bg-destructive": tone === "danger",
              "bg-muted-foreground": tone === "neutral",
            })} style={{ width: layout.dotSize, height: layout.dotSize }} />
          </>
        );
        const box = "bg-plate relative inline-flex h-full items-center justify-center rounded-lg border border-border";
        return (
          <Tooltip key={cell.portalId}>
            <TooltipTrigger asChild>
              {link.href ? (
                <a href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`Vezi anunțul pe ${cell.portalName}`} className={cn(box, "transition-colors hover:border-primary")}>
                  {logoBox}
                </a>
              ) : (
                <span className={box}>{logoBox}</span>
              )}
            </TooltipTrigger>
            <TooltipContent>{link.tooltip ?? `${cell.portalName}: ${portalStateLabel(cell.state)}`}</TooltipContent>
          </Tooltip>
        );
      })}
      {hidden.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild><span tabIndex={0} aria-label={`${hidden.length} portaluri suplimentare`} className="inline-flex items-center justify-center rounded-lg border border-border bg-plate text-[11px] font-semibold">+{hidden.length}</span></TooltipTrigger>
          <TooltipContent className="max-w-80">{hidden.map(cell => {
            const link = portalListingLink(cell);
            return <div key={cell.portalId}>{link.href ? <a href={link.href} target="_blank" rel="noopener noreferrer" className="underline">{cell.portalName}</a> : cell.portalName}: {link.tooltip ?? portalStateLabel(cell.state)}</div>;
          })}</TooltipContent>
        </Tooltip>
      ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <p title={status} className={cn("truncate text-xs leading-4", error ? "font-semibold text-destructive" : published > 0 ? "font-semibold text-success" : "text-muted-foreground")} style={{ marginTop: layout.statusGap }}>
            {!error && published === 0 && publishingHref ? <>Nepublicată · <a href={publishingHref} className="font-semibold text-primary hover:underline">Publică pe portaluri</a></> : status}
          </p>
        </TooltipTrigger>
        <TooltipContent>{status}</TooltipContent>
      </Tooltip>
    </div>
  );
}
