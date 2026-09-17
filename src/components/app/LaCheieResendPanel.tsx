/**
 * Retrimiterea portofoliului La Cheie după reactivare.
 *
 * La Cheie nu republică ofertele când agenția este reactivată, deci trebuie
 * retrimise explicit. Butonul doar creează jobul; trimiterea reală se face pe
 * server, iar progresul supraviețuiește reîncărcării paginii.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/StatusBadge";
import {
  cancelLaCheieResend,
  getLaCheieResendStatus,
  startLaCheieResend,
} from "@/lib/portals/lacheie.functions";

const JOB_LABEL: Record<string, string> = {
  queued: "În așteptare",
  running: "În curs",
  done: "Încheiată",
  failed: "Oprită",
  cancelled: "Anulată",
};

const JOB_TONE = {
  queued: "warning",
  running: "warning",
  done: "success",
  failed: "danger",
  cancelled: "neutral",
} as const;

export function LaCheieResendPanel({
  organizationId,
  agencyActive,
}: {
  organizationId: string;
  agencyActive: boolean;
}) {
  const queryClient = useQueryClient();
  const loadProgress = useServerFn(getLaCheieResendStatus);
  const start = useServerFn(startLaCheieResend);
  const cancel = useServerFn(cancelLaCheieResend);

  const progress = useQuery({
    queryKey: ["lacheie-resend", organizationId],
    queryFn: () => loadProgress({ data: { organizationId } }),
    // Cât timp jobul lucrează, cifrele se împrospătează singure.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 5_000 : false;
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["lacheie-resend", organizationId] });
  };

  const startJob = useMutation({
    mutationFn: () => start({ data: { organizationId } }),
    onSuccess: (result) => {
      toast.success(`Retrimiterea a fost programată pentru ${result.total} oferte.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelJob = useMutation({
    mutationFn: () => cancel({ data: { organizationId } }),
    onSuccess: () => {
      toast.success("Retrimiterea se oprește.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const job = progress.data ?? null;
  const active = job?.status === "queued" || job?.status === "running";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">Portofoliu la LaCheie.ro</p>
        {job ? (
          <StatusBadge tone={JOB_TONE[job.status]} dot={active}>
            {JOB_LABEL[job.status] ?? job.status}
          </StatusBadge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        După reactivare, ofertele nu revin singure la LaCheie.ro: trebuie retrimise din CRM.
      </p>

      {job ? (
        <p className="text-xs">
          {job.sent} trimise · {job.failed} cu erori · {job.pending} în așteptare (din {job.total})
        </p>
      ) : null}
      {job?.lastError ? <p className="text-xs text-destructive">{job.lastError}</p> : null}
      {job && job.failures.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-destructive">
          {job.failures.slice(0, 5).map((failure) => (
            <li key={failure.propertyId}>{failure.error ?? "Ofertă respinsă de portal."}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!agencyActive || active || startJob.isPending}
          onClick={() => startJob.mutate()}
        >
          {active ? "Retrimitere în curs…" : "Retrimite portofoliul la La Cheie"}
        </Button>
        {active ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={cancelJob.isPending || job?.cancelRequested === true}
            onClick={() => cancelJob.mutate()}
          >
            {job?.cancelRequested === true ? "Se oprește…" : "Anulează"}
          </Button>
        ) : null}
      </div>
      {!agencyActive ? (
        <p className="text-xs text-muted-foreground">
          Retrimiterea este disponibilă doar cât timp agenția este activă la LaCheie.ro.
        </p>
      ) : null}
    </div>
  );
}
