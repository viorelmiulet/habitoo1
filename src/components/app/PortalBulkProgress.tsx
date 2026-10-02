import { useEffect, useSyncExternalStore } from "react";
import { useQueries, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { getPortalBulkJob } from "@/lib/portals/bulk.functions";

/** Joburile de publicare în masă urmărite în fundal (doar în memorie). */
let activeJobs: string[] = [];
const finished = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const BULK_STARTED_MESSAGE = "Publicarea rulează în fundal. Poți continua să lucrezi.";

export function trackPortalBulkJob(jobId: string) {
  if (!jobId || activeJobs.includes(jobId) || finished.has(jobId)) return;
  activeJobs = [...activeJobs, jobId];
  toast.success(BULK_STARTED_MESSAGE);
  emit();
}

export function activePortalBulkJobs() {
  return activeJobs;
}

export function bulkFinishedMessage(done: number, failed: number) {
  return failed > 0
    ? `Publicare finalizată: ${done} reușite, ${failed} eșuate. Verifică ofertele marcate «Refuzat».`
    : `Publicare finalizată: ${done} reușite.`;
}

/** Marchează jobul terminat: un singur toast final + invalidări. */
export function finishPortalBulkJob(
  jobId: string,
  job: { done: number; failed: number },
  queryClient: Pick<QueryClient, "invalidateQueries">,
) {
  if (finished.has(jobId)) return;
  finished.add(jobId);
  activeJobs = activeJobs.filter((id) => id !== jobId);
  const message = bulkFinishedMessage(job.done, job.failed);
  if (job.failed > 0) toast.error(message);
  else toast.success(message);
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: ["property-portals-matrix"] }),
    queryClient.invalidateQueries({ queryKey: ["portal-filter-options"] }),
    queryClient.invalidateQueries({ queryKey: ["portal-bulk-overview"] }),
  ]);
  emit();
}

/** Doar pentru teste. */
export function resetPortalBulkJobs() {
  activeJobs = [];
  finished.clear();
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Watcher global, montat o singură dată în layout-ul autentificat. Nu afișează nimic. */
export function PortalBulkWatcher() {
  const queryClient = useQueryClient();
  const loadJob = useServerFn(getPortalBulkJob);
  const jobs = useSyncExternalStore(subscribe, activePortalBulkJobs, activePortalBulkJobs);
  const results = useQueries({
    queries: jobs.map((jobId) => ({
      queryKey: ["portal-bulk-job", jobId],
      queryFn: () => loadJob({ data: { jobId } }),
      refetchInterval: (query: { state: { data?: { job: { status: string } } } }) =>
        ["queued", "running"].includes(query.state.data?.job.status ?? "queued") ? 2_000 : false,
    })),
  });
  useEffect(() => {
    results.forEach((result, index) => {
      const jobId = jobs[index];
      const job = result.data?.job;
      if (jobId && job?.status === "done") finishPortalBulkJob(jobId, job, queryClient);
    });
  });
  return null;
}
