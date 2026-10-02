import { useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { PropertyThumb } from "@/components/app/PropertyThumb";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PortalBulkProgress } from "@/components/app/PortalBulkProgress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { propertyStatusLabels, propertyStatusTone, transactionLabels } from "@/lib/labels";
import { formatPropertyListPrice, portalDotTone, portalStateLabel } from "@/lib/property-list-row";
import type { PropertyPortalCell } from "@/lib/portals.functions";
import { getPortalBulkOverview, startPortalBulkJob } from "@/lib/portals/bulk.functions";
import { bulkDraftKey, bulkLimitExceeded, bulkSlotProjection, reconcileBulkDraft, toggleBulkPage, type BulkCellValue, type BulkDraft } from "@/lib/portals/bulk";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { ContactBlockNotice } from "@/components/app/ContactBlockNotice";
import { FEED_EXCLUDED_NO_PHONE, FEED_PORTALS_REQUIRING_AGENT_PHONE } from "@/lib/portals/listing-contact";

type Row = { id: string; reference: string | null; title: string; status: string; transaction_kind: string; price: number | null; currency: string | null; surface: number | null };

export function PropertyPublishView({ rows, coverOf, cellsFor, contactBlockOf = () => null, drafts, setDrafts, organizationId, isAdmin }: {
  contactBlockOf?: (id: string) => string | null;
  rows: Row[];
  coverOf: (id: string) => unknown;
  cellsFor: (id: string) => PropertyPortalCell[];
  drafts: Record<string, BulkDraft>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, BulkDraft>>>;
  organizationId?: string;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const loadOverview = useServerFn(getPortalBulkOverview);
  const startJob = useServerFn(startPortalBulkJob);
  const [confirming, setConfirming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: portals = [] } = useQuery({ queryKey: ["portal-bulk-overview", organizationId], enabled: Boolean(organizationId), queryFn: () => loadOverview({ data: { organizationId } }) });
  const initial = useMemo(() => Object.fromEntries(rows.flatMap((row) => cellsFor(row.id).map((cell) => [bulkDraftKey(row.id, cell.portalId), { enabled: cell.selected, promoted: cell.promoted } satisfies BulkCellValue]))), [rows, cellsFor]);
  const initialRef = useRef<Record<string, BulkCellValue>>({});
  Object.assign(initialRef.current, initial);
  const changes = Object.values(drafts);
  const projections = portals.map((portal) => ({ ...portal, projected: bulkSlotProjection(portal.used, portal.portalId, drafts, initialRef.current) }));
  const exceeded = projections.find((portal) => bulkLimitExceeded(portal.used, portal.limit, portal.projected));
  const withdrawals = changes.filter((change) => !change.enabled);
  const publications = changes.filter((change) => change.enabled && !initialRef.current[bulkDraftKey(change.propertyId, change.portalId)]?.enabled);
  const mutation = useMutation({ mutationFn: () => startJob({ data: { organizationId, items: changes.map((item) => ({ propertyId: item.propertyId, portalId: item.portalId, enabled: item.enabled, promoted: item.promoted })) } }), onSuccess: (result) => { setConfirming(false); setDrafts({}); setJobId(result.jobId); toast.success(`${result.queued} modificări rulează în fundal.`); void queryClient.invalidateQueries({ queryKey: ["property-portals-matrix"] }); }, onError: (error: Error) => toastError(error) });
  const updateCell = (propertyId: string, cell: PropertyPortalCell, value: BulkCellValue) => setDrafts((current) => reconcileBulkDraft(current, { enabled: cell.selected, promoted: cell.promoted }, { propertyId, portalId: cell.portalId, ...value }));
  const columnTemplate = `minmax(300px,1.65fr) repeat(${Math.max(portals.length, 1)}, minmax(170px,1fr))`;

  return <>
    <div className="overflow-x-auto"><div className="min-w-max">
      <div className="grid border-b border-border" style={{ gridTemplateColumns: columnTemplate }}>
        <div className="sticky left-0 z-20 bg-card px-4 py-4 text-xs font-bold uppercase text-muted-foreground">Proprietate</div>
        {portals.map((portal) => {
          const pageCells = rows.map((row) => { const cell = cellsFor(row.id).find((entry) => entry.portalId === portal.portalId); return { propertyId: row.id, enabled: cell?.selected ?? false, promoted: cell?.promoted ?? false, eligible: Boolean(cell?.configured) && (!contactBlockOf(row.id) || (cell?.selected ?? false)) }; });
          const eligible = pageCells.filter((cell) => cell.eligible);
          const checked = eligible.filter((cell) => drafts[bulkDraftKey(cell.propertyId, portal.portalId)]?.enabled ?? cell.enabled).length;
          return <div key={portal.portalId} className={cn("flex flex-col items-center gap-1.5 px-3 py-3 text-center", !portal.configured && "opacity-55")}><PortalLogoStack portalId={portal.portalId} name={portal.name} size={32} className="rounded-lg border border-border bg-white p-1" /><strong className="text-sm">{portal.name}</strong><span className="text-xs text-muted-foreground">{portal.limit !== null ? `${portal.used} / ${portal.limit} locuri` : `${portal.used} publicate`}</span>{portal.configured ? <Button variant="outline" size="sm" className={cn("h-7 rounded-full px-3 text-xs", checked === eligible.length && eligible.length > 0 && "bg-sidebar text-sidebar-foreground")} onClick={() => setDrafts((current) => toggleBulkPage({ drafts: current, portalId: portal.portalId, cells: pageCells }))}>Toată pagina</Button> : <><span className="text-xs font-semibold">Neconfigurat</span>{isAdmin ? <Link to="/app/settings" search={{ tab: "portals" } as never} className="text-xs font-semibold text-primary hover:underline">Configurează</Link> : null}</>}</div>;
        })}
      </div>
      {rows.map((row) => { const price = formatPropertyListPrice(row.price, row.currency, row.transaction_kind, row.surface); return <div key={row.id} className="grid border-b border-border last:border-0" style={{ gridTemplateColumns: columnTemplate }}>
        <div className="sticky left-0 z-10 flex gap-3 bg-card px-4 py-3"><PropertyThumb propertyId={row.id} title={row.title} cover={coverOf(row.id) as never} className="h-[76px] w-[104px] shrink-0 rounded-xl" /><div className="min-w-0"><div className="flex flex-wrap gap-1"><StatusBadge tone={propertyStatusTone[row.status as keyof typeof propertyStatusTone]} dot>{propertyStatusLabels[row.status as keyof typeof propertyStatusLabels] ?? row.status}</StatusBadge><span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold">{transactionLabels[row.transaction_kind as keyof typeof transactionLabels] ?? row.transaction_kind}</span></div><Link to="/app/properties/$id" params={{ id: row.id }} className="mt-1 line-clamp-1 font-display text-[15px] font-bold">{row.title}</Link><p className="font-display text-base font-semibold">{price.main}</p><p className="text-xs text-muted-foreground">{[row.reference, row.surface ? `${row.surface} m²` : null].filter(Boolean).join(" · ")}</p>{contactBlockOf(row.id) ? <ContactBlockNotice message={contactBlockOf(row.id) as string} isAdmin={isAdmin} className="mt-1" /> : null}</div></div>
        {portals.map((portal) => { const cell = cellsFor(row.id).find((entry) => entry.portalId === portal.portalId); if (!cell || !portal.configured) return <div key={portal.portalId} className="flex items-center justify-center text-muted-foreground">—</div>; const key = bulkDraftKey(row.id, portal.portalId); const draft = drafts[key]; const enabled = draft?.enabled ?? cell.selected; const promoted = draft?.promoted ?? cell.promoted; const withdrawing = draft && !draft.enabled; const publishing = draft?.enabled && !cell.selected; const tone = portalDotTone(cell.state); const contactBlock = contactBlockOf(row.id); const feedExcluded = Boolean(contactBlock) && enabled && FEED_PORTALS_REQUIRING_AGENT_PHONE.has(portal.portalId); return <div key={portal.portalId} className={cn("m-1 flex min-h-28 flex-col items-center justify-center rounded-xl px-2 py-2", publishing && "bg-primary/5 ring-1 ring-inset ring-primary", withdrawing && "bg-destructive/5 ring-1 ring-inset ring-destructive")}><Button variant="ghost" aria-label={`${enabled ? "Retrage" : "Publică"} ${row.reference ?? row.title} pe ${portal.name}`} disabled={Boolean(contactBlock) && !enabled} title={contactBlock && !enabled ? contactBlock : undefined} onClick={() => updateCell(row.id, cell, { enabled: !enabled, promoted: !enabled && promoted })} className={cn("size-[26px] min-h-0 rounded-lg border p-0", enabled && !draft && "border-sidebar bg-sidebar text-sidebar-foreground", enabled && draft && "border-primary bg-primary text-primary-foreground", !enabled && !withdrawing && "border-border", withdrawing && "border-destructive text-destructive")} >{enabled ? <Check className="size-4" /> : withdrawing ? <X className="size-4" /> : null}</Button><div className="mt-2 flex items-center gap-1 text-xs"><span className={cn("size-2 rounded-full", tone === "success" && "bg-success", tone === "warning" && "bg-warning", tone === "danger" && "bg-destructive", tone === "neutral" && "bg-muted-foreground")} />{draft ? draft.enabled ? "Se publică" : "Se retrage" : portalStateLabel(cell.state)}</div>{feedExcluded ? <p className="mt-1 text-center text-xs font-semibold text-destructive">{FEED_EXCLUDED_NO_PHONE}</p> : null}{cell.state === "error" ? <Tooltip><TooltipTrigger asChild><a href={`/app/properties/${row.id}?tab=publishing`} className="mt-1 text-xs font-semibold text-primary">Vezi</a></TooltipTrigger><TooltipContent>{cell.lastError ?? "Eroare portal"}</TooltipContent></Tooltip> : null}{portal.promotionFlag ? <Button variant="ghost" disabled={!enabled} onClick={() => updateCell(row.id, cell, { enabled, promoted: !promoted })} className={cn("mt-2 h-7 rounded-full border border-border px-2 text-xs", promoted && "border-sidebar bg-sidebar text-sidebar-primary")}>{promoted ? "★ Promovat" : "☆ Promovează"}</Button> : null}</div>; })}
      </div>; })}
    </div></div>

    {changes.length > 0 ? <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-5xl flex-wrap items-center gap-3 rounded-2xl bg-sidebar px-4 py-3 text-sidebar-foreground"><span className="flex size-8 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{changes.length}</span><div><strong>modificări nesalvate</strong><p className="text-xs opacity-75">{publications.length} publicări · {withdrawals.length} retrageri</p></div><div className="min-w-0 flex-1 text-xs">{projections.filter((portal) => portal.limit !== null).map((portal) => <span key={portal.portalId} className={cn("mr-3", bulkLimitExceeded(portal.used, portal.limit, portal.projected) && "text-destructive")}>{portal.name}: {portal.used} → {portal.projected} din {portal.limit}</span>)}{exceeded ? <p className="font-semibold text-destructive">Depășești limita de locuri pe {exceeded.name}</p> : null}</div><Button variant="ghost" className="text-sidebar-foreground" onClick={() => setDrafts({})}>Renunță</Button><Button disabled={Boolean(exceeded)} onClick={() => setConfirming(true)}>Aplică modificările</Button></div> : null}

    <PortalBulkProgress jobId={jobId} onRetry={(failed) => setDrafts(Object.fromEntries(failed.map((item) => [bulkDraftKey(item.property_id, item.portal_key), { propertyId: item.property_id, portalId: item.portal_key, enabled: item.enabled, promoted: item.promoted ?? false }]))) } />

    <Dialog open={confirming} onOpenChange={setConfirming}><DialogContent className="max-w-2xl rounded-[18px]"><DialogHeader><DialogTitle className="font-display">Aplici {changes.length} modificări pe portaluri?</DialogTitle><DialogDescription>{new Set(changes.map((change) => change.propertyId)).size} anunțuri sunt afectate. Operațiile rulează în fundal; poți închide pagina.</DialogDescription></DialogHeader><div className="max-h-[55vh] space-y-3 overflow-auto">{portals.map((portal) => { const items = changes.filter((item) => item.portalId === portal.portalId); if (!items.length) return null; const refs = (enabled: boolean) => items.filter((item) => item.enabled === enabled).map((item) => rows.find((row) => row.id === item.propertyId)?.reference ?? item.propertyId); const pub = refs(true); const withdraw = refs(false); const promo = items.filter((item) => item.promoted).map((item) => rows.find((row) => row.id === item.propertyId)?.reference ?? item.propertyId); const projection = projections.find((entry) => entry.portalId === portal.portalId); return <section key={portal.portalId} className="rounded-2xl border border-border p-3"><div className="mb-2 flex items-center gap-2"><PortalLogoStack portalId={portal.portalId} name={portal.name} size={28} /><strong>{portal.name}</strong></div>{pub.length ? <p className="text-sm">Publici {pub.length}: {pub.join(", ")}</p> : null}{withdraw.length ? <p className="text-sm">Retragi {withdraw.length}: {withdraw.join(", ")}</p> : null}{promo.length ? <p className="text-sm">Promovezi {promo.length}: {promo.join(", ")}</p> : null}{portal.limit !== null ? <p className="mt-1 text-xs text-muted-foreground">Locuri: {portal.used} → {projection?.projected ?? portal.used} din {portal.limit}</p> : null}</section>; })}{withdrawals.length ? <p className="rounded-2xl border border-destructive bg-destructive/5 p-3 text-sm">Retragerea scoate anunțul de pe portal. Dacă îl publici din nou, poate primi un anunț nou pe portal, cu alt link.</p> : null}</div><DialogFooter><Button variant="outline" onClick={() => setConfirming(false)}>Înapoi</Button><Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>Aplică {changes.length} modificări</Button></DialogFooter></DialogContent></Dialog>
  </>;
}