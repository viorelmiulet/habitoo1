import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { getPortalBulkJob } from "@/lib/portals/bulk.functions";

export function PortalBulkProgress({ jobId }: { jobId: string | null }) {
  const queryClient = useQueryClient();
  const loadJob = useServerFn(getPortalBulkJob);
  const [visible, setVisible] = useState(true);
  const notified = useRef<string | null>(null);
  const progress = useQuery({
    queryKey: ["portal-bulk-job", jobId],
    enabled: Boolean(jobId),
    queryFn: () => loadJob({ data: { jobId: jobId ?? "" } }),
    refetchInterval: (query) => ["queued", "running"].includes(query.state.data?.job.status ?? "") ? 2_000 : false,
  });
  useEffect(() => {
    if (!jobId || progress.data?.job.status !== "done" || notified.current === jobId) return;
    notified.current = jobId;
    toast.success(`Publicare finalizată: ${progress.data.job.done} reușite, ${progress.data.job.failed} eșuate.`);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["property-portals-matrix"] }),
      queryClient.invalidateQueries({ queryKey: ["portal-filter-options"] }),
      queryClient.invalidateQueries({ queryKey: ["portal-bulk-overview"] }),
    ]);
  }, [jobId, progress.data?.job.status, progress.data?.job.done, progress.data?.job.failed, queryClient]);
  useEffect(() => { if (jobId) setVisible(true); }, [jobId]);
  if (!jobId) return null;
  const completed = (progress.data?.job.done ?? 0) + (progress.data?.job.failed ?? 0);
  const total = progress.data?.job.total ?? 0;
  if (!visible) return <Button className="fixed right-4 bottom-4 z-40 rounded-full bg-sidebar text-sidebar-foreground" onClick={() => setVisible(true)}>Publicare în curs {completed}/{total}</Button>;
  return <aside role="status" aria-live="polite" className="fixed right-4 bottom-4 z-50 w-[min(390px,calc(100vw-2rem))] rounded-[18px] border border-border bg-card p-4">
    <div className="flex justify-between"><div><h3 className="font-display text-lg font-bold">Publicare pe portaluri</h3><p className="text-xs text-muted-foreground">{completed} din {total}</p></div><Button variant="ghost" size="icon" aria-label="Ascunde progresul" onClick={() => setVisible(false)}><X /></Button></div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${total ? completed / total * 100 : 0}%` }} /></div>
    <ul className="mt-3 max-h-64 space-y-2 overflow-auto">{progress.data?.items.map((item) => <li key={item.id} className="rounded-xl border border-border p-2 text-xs"><strong>{item.property?.reference ?? item.property?.title ?? item.property_id}</strong><p className={item.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{item.status === "ok" ? item.enabled ? "Publicat / În feed" : "Retras" : item.status === "failed" || item.status === "skipped" ? item.message : "În curs"}</p></li>)}</ul>
  </aside>;
}