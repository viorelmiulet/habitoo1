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
import { useCurrentUser } from "@/hooks/use-session";

type Scope = "mine" | "all";
const STORAGE_KEY = "habitoo.republish.batch";

export function PortalRepublishButton({ organizationId, reportBatchId }: { organizationId?: string; reportBatchId?: string }) {
  const user = useCurrentUser().data;
  const storageKey = `${STORAGE_KEY}:${user?.userId ?? ""}:${organizationId ?? user?.organization?.id ?? ""}`;
  const [open, setOpen] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.userId) return;
    setBatchId(reportBatchId ?? window.localStorage.getItem(storageKey));
    if (reportBatchId) setOpen(true);
  }, [storageKey, reportBatchId, user?.userId]);
  useEffect(() => {
    const onStarted = (event: Event) => {
      const detail = (event as CustomEvent<{batchId:string; storageKey:string}>).detail;
      if (detail.storageKey === storageKey) setBatchId(detail.batchId);
    };
    window.addEventListener("habitoo:republish-started", onStarted);
    return () => window.removeEventListener("habitoo:republish-started", onStarted);
  }, [storageKey]);
  const loadBatch = useServerFn(getRepublishBatch);
  const { data: batch } = useQuery({
    queryKey: ["portal-republish-batch", batchId],
    enabled: Boolean(batchId),
    queryFn: () => {
      if (!batchId) throw new Error("Republicarea nu a fost găsită.");
      return loadBatch({ data: { batchId } });
    },
    refetchInterval: (q) => (q.state.data?.status === "done" ? false : 3_000),
  });
  const running = batch?.status === "running";
  useEffect(() => {
    if (!batchId || batch?.status !== "done") return;
    const key = `${storageKey}:reported:${batchId}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "true");
    toast.success(`Republicare terminată: ${batch.succeeded} reușite, ${batch.failed} erori`);
  }, [batch, batchId, storageKey]);
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
        onStarted={(id) => {
          window.localStorage.setItem(storageKey, id);
          setBatchId(id);
          window.dispatchEvent(new CustomEvent("habitoo:republish-started", { detail: {batchId:id,storageKey} }));
        }}
        onDismiss={() => { window.localStorage.removeItem(storageKey); setBatchId(null); }}
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
    onSuccess: (result) => { onStarted(result.batchId); onClose(); toast.success("Republicarea a pornit în fundal"); },
    onError: (error: Error) => toastError(error),
  });
  const toggle = (id: string) => setPortalFilter((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const blocked = Boolean(preview?.activeBatchId) || mutation.isPending || (preview?.listings ?? 0) + (preview?.perPortal.reduce((s, p) => s + p.autoPull, 0) ?? 0) === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xl flex-col gap-4 overflow-hidden rounded-[18px] bg-card p-4 sm:w-full sm:p-6">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle className="font-display">Republică anunțurile</DialogTitle>
          <DialogDescription>Retrimite pe portaluri anunțurile deja publicate, cu datele actuale. Nu publică nimic nou, nu retrage și nu folosește promovări plătite.</DialogDescription>
        </DialogHeader>
        {batch ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 text-sm">
            <p className="font-semibold">{batch.status === "done" ? "Republicare terminată" : "Republicare în curs…"}</p>
            <p>{batch.succeeded} reușite · {batch.failed} erori · {batch.skipped} sărite{batch.pending ? ` · ${batch.pending} în așteptare` : ""} (din {batch.total})</p>
            {batch.errors.length ? <section><p className="font-semibold text-destructive">Erori</p><ul className="max-h-40 space-y-1 overflow-auto">{batch.errors.map((e, i) => <li key={i}>{e.listing} · {e.portal}: {e.message}</li>)}</ul></section> : null}
            {batch.skippedItems.length ? <section><p className="font-semibold">Sărite</p><ul className="max-h-40 space-y-1 overflow-auto text-muted-foreground">{batch.skippedItems.map((e, i) => <li key={i}>{e.listing} · {e.portal}: {e.message}</li>)}</ul></section> : null}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 text-sm">
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
                    <Button key={p.portalId} type="button" size="sm" variant={portalFilter.includes(p.portalId) ? "default" : "outline"} aria-pressed={portalFilter.includes(p.portalId)} className="h-9 max-w-full px-3 text-[13px] sm:h-9 sm:text-sm" onClick={() => toggle(p.portalId)}>{p.name}</Button>
                  ))}
                </div>
              </div>
            ) : null}
            {isLoading ? <p>Se calculează…</p> : preview ? (
              <div className="rounded-2xl border border-border p-3">
                <p className="font-semibold">{preview.listings} anunțuri pe {preview.portals} portaluri vor fi republicate</p>
                <ul className="mt-2 space-y-1">
                  {preview.perPortal.filter((p) => p.queued > 0).map((p) => (
                    <li key={p.portalId} className="flex items-start justify-between gap-3"><span className="min-w-0 flex-1">{p.name}</span><span className="shrink-0 text-right tabular-nums">{p.queued} anunțuri</span></li>
                  ))}
                </ul>
                {(() => { const auto = preview.perPortal.filter((p) => p.queued === 0 && p.autoPull > 0); return auto.length ? <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">Se actualizează automat la următoarea preluare: {auto.map((p) => `${p.name} (${p.autoPull})`).join(", ")}</p> : null; })()}
              </div>
            ) : null}
            {mutation.error ? <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 font-medium text-destructive">{startErrorText(mutation.error)}</p> : null}
            {preview?.activeBatchId ? <p className="font-semibold text-destructive">O republicare rulează deja pentru agenție.</p> : null}
          </div>
        )}
        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          {batch?.status === "done" ? <Button variant="outline" className="w-full sm:w-auto" onClick={onDismiss}>Republicare nouă</Button> : null}
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>Închide</Button>
          {!batch ? <Button disabled={blocked} className="w-full sm:w-auto" onClick={() => mutation.mutate()}>{mutation.isPending ? "Se pornește…" : "Republică"}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function startErrorText(error: unknown): string {
  const msg = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/republish_running|rulează deja|23505/i.test(msg)) return "O republicare rulează deja pentru agenție. Așteaptă să se termine, apoi încearcă din nou.";
  if (/Nu există anunțuri/i.test(msg)) return msg;
  if (/^[A-ZĂÂÎȘȚ][^{}<>]*[.!]$/.test(msg) && !/[_]|fetch|HTTP|status|error/i.test(msg)) return msg;
  return "Republicarea nu a putut fi pornită. Încearcă din nou peste câteva minute; dacă problema continuă, anunță-ne.";
}
