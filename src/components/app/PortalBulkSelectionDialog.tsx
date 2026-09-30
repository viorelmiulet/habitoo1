import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import type { PropertyPortalCell } from "@/lib/portals.functions";
import { getPortalBulkOverview, startPortalBulkJob } from "@/lib/portals/bulk.functions";
import { previewBulkSelection } from "@/lib/portals/bulk";
import { cn } from "@/lib/utils";

export function PortalBulkSelectionDialog({ mode, propertyIds, cellsFor, organizationId, onClose, onStarted }: {
  mode: "publish" | "withdraw" | null;
  propertyIds: string[];
  cellsFor: (id: string) => PropertyPortalCell[];
  organizationId?: string;
  onClose: () => void;
  onStarted: (jobId: string) => void;
}) {
  const enabled = mode === "publish";
  const loadOverview = useServerFn(getPortalBulkOverview);
  const startJob = useServerFn(startPortalBulkJob);
  const [selectedPortals, setSelectedPortals] = useState<Record<string, boolean>>({});
  const [promotions, setPromotions] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!mode) {
      setSelectedPortals({});
      setPromotions({});
    }
  }, [mode]);
  const { data: portals = [] } = useQuery({ queryKey: ["portal-bulk-overview", organizationId], enabled: Boolean(mode && organizationId), queryFn: () => loadOverview({ data: { organizationId } }) });
  const previews = useMemo(() => portals.map((portal) => ({
    ...portal,
    preview: previewBulkSelection({ enabled, used: portal.used, selected: propertyIds.map((propertyId) => ({ enabled: cellsFor(propertyId).find((cell) => cell.portalId === portal.portalId)?.selected ?? false })) }),
  })), [portals, propertyIds, cellsFor, enabled]);
  const chosen = previews.filter((portal) => selectedPortals[portal.portalId] && portal.configured);
  const exceeded = chosen.find((portal) => portal.limit !== null && portal.preview.after > portal.limit);
  const changed = chosen.reduce((sum, portal) => sum + portal.preview.changed, 0);
  const mutation = useMutation({
    mutationFn: () => startJob({ data: { organizationId, items: chosen.flatMap((portal) => propertyIds.flatMap((propertyId) => {
      const cell = cellsFor(propertyId).find((entry) => entry.portalId === portal.portalId);
      if ((cell?.selected ?? false) === enabled) return [];
      return [{ propertyId, portalId: portal.portalId, enabled, promoted: enabled && portal.promotionFlag ? Boolean(promotions[portal.portalId]) : false }];
    })) } }),
    onSuccess: (result) => { onStarted(result.jobId); onClose(); toast.success(`${result.queued} modificări rulează în fundal.`); },
    onError: (error: Error) => toastError(error),
  });
  return <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-2xl rounded-[18px] bg-card"><DialogHeader><DialogTitle className="font-display">{enabled ? "Publică pe portaluri" : "Retrage de pe portaluri"}</DialogTitle><DialogDescription>Alege portalurile pentru cele {propertyIds.length} anunțuri selectate.</DialogDescription></DialogHeader>
    <div className="max-h-[55vh] space-y-3 overflow-auto">{previews.map((portal) => { const checked = Boolean(selectedPortals[portal.portalId]); return <section key={portal.portalId} className={cn("rounded-2xl border border-border p-3", !portal.configured && "opacity-55")}><div className="flex items-center gap-3"><Button type="button" variant="ghost" disabled={!portal.configured} aria-label={`Selectează ${portal.name}`} aria-pressed={checked} onClick={() => setSelectedPortals((current) => ({ ...current, [portal.portalId]: !checked }))} className={cn("size-[26px] min-h-0 rounded-lg border p-0", checked ? "border-sidebar bg-sidebar text-sidebar-foreground" : "border-border")}>{checked ? <Check className="size-4" /> : null}</Button><PortalLogoStack portalId={portal.portalId} name={portal.name} size={30} className="rounded-lg border border-border bg-card p-1" /><div className="min-w-0 flex-1"><strong>{portal.name}</strong>{!portal.configured ? <p className="text-xs text-muted-foreground">Neconfigurat</p> : checked ? <><p className="text-sm">{portal.preview.changed} {enabled ? "se publică" : "se retrag"}{portal.preview.skipped ? ` · ${portal.preview.skipped} sunt deja ${enabled ? "publicate" : "retrase"}` : ""}</p>{portal.limit !== null ? <p className={cn("text-xs text-muted-foreground", portal.preview.after > portal.limit && "text-destructive")}>Locuri: {portal.preview.before} → {portal.preview.after} din {portal.limit}</p> : null}</> : null}</div></div>{enabled && checked && portal.promotionFlag ? <Button type="button" variant="ghost" aria-pressed={Boolean(promotions[portal.portalId])} onClick={() => setPromotions((current) => ({ ...current, [portal.portalId]: !current[portal.portalId] }))} className={cn("mt-3 h-7 rounded-full border border-border px-3 text-xs", promotions[portal.portalId] && "bg-sidebar text-sidebar-primary")}>{promotions[portal.portalId] ? "★ și promovează" : "☆ și promovează"}</Button> : null}</section>; })}</div>
    {!enabled ? <p className="rounded-2xl border border-destructive bg-destructive/5 p-3 text-sm">Retragerea scoate anunțul de pe portal. Dacă îl publici din nou, poate primi un anunț nou pe portal, cu alt link.</p> : null}
    {exceeded ? <p className="text-sm font-semibold text-destructive">Depășești limita de locuri pe {exceeded.name}.</p> : null}<DialogFooter><Button variant="outline" onClick={onClose}>Înapoi</Button><Button disabled={changed === 0 || Boolean(exceeded) || mutation.isPending} onClick={() => mutation.mutate()}>Aplică {changed} modificări</Button></DialogFooter>
  </DialogContent></Dialog>;
}