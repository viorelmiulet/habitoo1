import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AllocateResult } from "./AllocateToDevelopmentDialog";
import type { CloneResult } from "@/lib/developments/clone";

type Job = { id: string; status: string; total: number; processed: number; result: CloneResult; last_error: string | null; finished_at: string | null };

export function LastCloneJobView({ job }: { job: Job }) {
  const r: CloneResult = { copies: job.result?.copies ?? [], skipped: job.result?.skipped ?? [], portalSkipped: job.result?.portalSkipped ?? [], photoErrors: job.result?.photoErrors ?? 0 };
  const running = job.status === "queued" || job.status === "running";
  return (
    <section className="ds-card space-y-2 p-4" data-testid="last-clone-job">
      <h3 className="font-medium">Ultima alocare</h3>
      <p className="text-sm text-muted-foreground">
        {running ? `În curs: ${job.processed} din ${job.total} anunțuri procesate.` : job.status === "error" ? `Eșuată: ${job.last_error ?? "motiv necunoscut"} (${job.processed} din ${job.total}).` : `Finalizată: ${job.processed} din ${job.total} anunțuri procesate.`}
        {r.photoErrors ? ` Erori la ${r.photoErrors} poze.` : ""}
      </p>
      {running && !r.copies.length && !r.skipped.length ? null : <AllocateResult result={r} />}
    </section>
  );
}

/** Rezultatul ultimului job de alocare vizibil utilizatorului (RLS), reîmprospătat cât timp rulează. */
export function LastCloneJob({ developmentId, onFinished }: { developmentId: string; onFinished?: () => void }) {
  const { data: job } = useQuery({
    queryKey: ["development-clone-job", developmentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("development_clone_jobs").select("id,status,total,processed,result,last_error,finished_at").eq("development_id", developmentId).eq('operation','clone').order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data as unknown as Job | null) ?? null;
    },
    refetchInterval: (q) => (q.state.data && ["queued", "running"].includes(q.state.data.status) ? 5000 : false),
  });
  const last = useRef<string | null>(null);
  useEffect(() => {
    const key = job ? `${job.id}:${job.status}:${job.processed}` : null;
    if (last.current && key !== last.current) onFinished?.();
    last.current = key;
  }, [job, onFinished]);
  return job ? <LastCloneJobView job={job} /> : null;
}
