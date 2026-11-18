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
export function PortalLogoLinks({ cells }: { cells: Cell[] }) {
  if (cells.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {cells.map((cell) => {
        const link = portalListingLink(cell);
        const tone = portalDotTone(cell.state);
        const logoBox = (
          <>
            <PortalLogoStack portalId={cell.portalId} name={cell.portalName} size={24} alt={cell.portalName} />
            <span className={cn("absolute -right-0.5 -bottom-0.5 size-[11px] rounded-full border-2 border-surface", {
              "bg-success": tone === "success",
              "bg-warning": tone === "warning",
              "bg-destructive": tone === "danger",
              "bg-muted-foreground": tone === "neutral",
            })} />
          </>
        );
        const box = "bg-plate relative inline-flex rounded-lg border border-border p-1";
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
    </div>
  );
}
