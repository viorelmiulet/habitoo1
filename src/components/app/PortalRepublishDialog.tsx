import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { getRepublishBatch, getRepublishPreview, startRepublish } from "@/lib/portals/republish.functions";
import { cn } from "@/lib/utils";

type Scope = "mine" | "all";
const STORAGE_KEY = "habitoo.republish.batch";

export function PortalRepublishButton({ organizationId }: { organizationId?: string }) {
  const [open, setOpen] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  useEffect(() => { setBatchId(window.localStorage.getItem(STORAGE_KEY)); }, []);
  const loadBatch = useServerFn(getRepublishBatch);
  const { data: batch } = useQuery({
    queryKey: ["portal-republish-batch", batchId],
    enabled: Boolean(batchId),
    queryFn: () => loadBatch({ data: { batchId: batchId! } }),
    refetchInterval: (q) => (q.state.data?.status === "done" ? false : 3_000),
  });
  const running = batch?.status === "running";
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RefreshCw className={cn("size-4", running && "animate-spin")} />
        {running ? `Republicare ${batch.succeeded + batch.failed + batch.skipped}/${batch.total}` : "Republică anunțurile"}
      </Button>
      <PortalRepublishDialog
        open={open}
        organizationId={organizationId}
        batch={batch ?? null}
        onClose={() => setOpen(false)}
        onStarted={(id) => { window.localStorage.setItem(STORAGE_KEY, id); setBatchId(id); }}
        onDismiss={() => { window.localStorage.removeItem(STORAGE_KEY); setBatchId(null); }}
      />
    </>
  );
}

type Batch = Awaited<ReturnType<typeof getRepublishBatch>>;

function PortalRepublishDialog({ open, organizationId, batch, onClose, onStarted, onDismiss }: {
  open: boolean; organizationId?: string; batch: Batch | null;
  onClose: () => void; onStarted: (id: string) => void; onDismiss: () => void;
}) {
  const [scope, setScope] = useState<Scope>("mine");
  const [portalFilter, setPortalFilter] = useState<string[]>([]);
  const loadPreview = useServerFn(getRepublishPreview);
  const start = useServerFn(startRepublish);
  const showBatch = Boolean(batch);
  const { data: preview, isLoading } = useQuery({
    queryKey: ["portal-republish-preview", organizationId, scope, portalFilter],
    enabled: open && !showBatch,
    queryFn: () => loadPreview({ data: { organizationId, scope, portalKeys: portalFilter.length ? portalFilter : null } }),
  });
  const { data: allPortals } = useQuery({
    queryKey: ["portal-republish-preview", organizationId, scope, "all-portals"],
    enabled: open && !showBatch,
    queryFn: () => loadPreview({ data: { organizationId, scope, portalKeys: null } }),
  });
  const mutation = useMutation({
    mutationFn: () => start({ data: { organizationId, scope, portalKeys: portalFilter.length ? portalFilter : null } }),
    onSuccess: (result) => { onStarted(result.batchId); toast.success("Republicarea rulează în fundal. Poți închide pagina."); },
    onError: (error: Error) => toastError(error),
  });
  const toggle = (id: string) => setPortalFilter((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const blocked = Boolean(preview?.activeBatchId) || mutation.isPending || (preview?.listings ?? 0) + (preview?.perPortal.reduce((s, p) => s + p.autoPull, 0) ?? 0) === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl rounded-[18px] bg-card">
        <DialogHeader>
          <DialogTitle className="font-display">Republică anunțurile</DialogTitle>
          <DialogDescription>Retrimite pe portaluri anunțurile deja publicate, cu datele actuale. Nu publică nimic nou, nu retrage și nu folosește promovări plătite.</DialogDescription>
        </DialogHeader>
        {batch ? (
          <div className="space-y-3 text-sm">
            <p className="font-semibold">{batch.status === "done" ? "Republicare terminată" : "Republicare în curs…"}</p>
            <p>{batch.succeeded} reușite · {batch.failed} erori · {batch.skipped} sărite{batch.pending ? ` · ${batch.pending} în așteptare` : ""} (din {batch.total})</p>
            {batch.errors.length ? <section><p className="font-semibold text-destructive">Erori</p><ul className="max-h-40 space-y-1 overflow-auto">{batch.errors.map((e, i) => <li key={i}>{e.listing} · {e.portal}: {e.message}</li>)}</ul></section> : null}
            {batch.skippedItems.length ? <section><p className="font-semibold">Sărite</p><ul className="max-h-40 space-y-1 overflow-auto text-muted-foreground">{batch.skippedItems.map((e, i) => <li key={i}>{e.listing} · {e.portal}: {e.message}</li>)}</ul></section> : null}
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {preview?.canChooseScope ? (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ce anunțuri">
                {([["mine", "Anunțurile mele"], ["all", "Toate anunțurile agenției"]] as const).map(([value, text]) => (
                  <Button key={value} type="button" size="sm" variant={scope === value ? "default" : "outline"} role="radio" aria-checked={scope === value} onClick={() => setScope(value)}>{text}</Button>
                ))}
              </div>
            ) : null}
            {allPortals?.perPortal.length ? (
              <div>
                <p className="mb-2 text-muted-foreground">Portaluri (implicit toate)</p>
                <div className="flex flex-wrap gap-2">
                  {allPortals.perPortal.map((p) => (
                    <Button key={p.portalId} type="button" size="sm" variant={portalFilter.includes(p.portalId) ? "default" : "outline"} aria-pressed={portalFilter.includes(p.portalId)} onClick={() => toggle(p.portalId)}>{p.name}</Button>
                  ))}
                </div>
              </div>
            ) : null}
            {isLoading ? <p>Se calculează…</p> : preview ? (
              <div className="rounded-2xl border border-border p-3">
                <p className="font-semibold">{preview.listings} anunțuri pe {preview.portals} portaluri vor fi republicate</p>
                <ul className="mt-2 space-y-1">
                  {preview.perPortal.map((p) => (
                    <li key={p.portalId}>{p.name}: {p.queued > 0 ? `${p.queued} anunțuri` : `${p.autoPull} anunțuri · se actualizează automat la următoarea preluare`}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {preview?.activeBatchId ? <p className="font-semibold text-destructive">O republicare rulează deja pentru agenție.</p> : null}
          </div>
        )}
        <DialogFooter>
          {batch?.status === "done" ? <Button variant="outline" onClick={onDismiss}>Republicare nouă</Button> : null}
          <Button variant="outline" onClick={onClose}>Închide</Button>
          {!batch ? <Button disabled={blocked} onClick={() => mutation.mutate()}>Republică</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
