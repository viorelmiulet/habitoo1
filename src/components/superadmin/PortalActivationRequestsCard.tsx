/**
 * Superadmin → Portaluri: cererile de activare trimise de agenții.
 * De aici se ajunge direct la ecranul de activare al agenției respective sau
 * se respinge cererea, cu motiv opțional.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { EmptyState } from "@/components/app/EmptyState";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import {
  listPortalActivationRequests,
  resolvePortalActivationRequest,
} from "@/lib/portal-activation.functions";

export function PortalActivationRequestsCard({
  onOpenOrganization,
}: {
  onOpenOrganization: (organizationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const loadRequests = useServerFn(listPortalActivationRequests);
  const resolveRequest = useServerFn(resolvePortalActivationRequest);

  const [showAll, setShowAll] = useState(false);
  const [reasonFor, setReasonFor] = useState<string>("");
  const [reason, setReason] = useState("");

  const requests = useQuery({
    queryKey: ["portal-activation-requests", showAll ? "all" : "pending"],
    queryFn: () => loadRequests({ data: { status: showAll ? "all" : "pending" } }),
  });

  const resolve = useMutation({
    mutationFn: (input: { requestId: string; status: "approved" | "rejected"; reason?: string }) =>
      resolveRequest({ data: input }),
    onSuccess: () => {
      toast.success("Cererea a fost actualizată.");
      setReasonFor("");
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["portal-activation-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pendingCount = (requests.data ?? []).filter((r) => r.status === "pending").length;

  return (
    <section className="panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
            Cereri de activare portal
            {pendingCount > 0 ? <Badge variant="destructive">{pendingCount}</Badge> : null}
          </h2>
          <p className="text-xs text-muted-foreground">
            Cererile trimise de administratorii de agenție. Activarea se face mai jos, pe agenția
            selectată.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Doar în așteptare" : "Toate cererile"}
        </Button>
      </header>

      {requests.isLoading ? (
        <div className="p-5">
          <InlineLoading label="Se încarcă cererile…" />
        </div>
      ) : requests.isError ? (
        <div className="p-5">
          <QueryError error={requests.error} onRetry={() => requests.refetch()} />
        </div>
      ) : (requests.data ?? []).length === 0 ? (
        <EmptyState icon={BellRing} title="Nicio cerere de activare" />
      ) : (
        <ul className="divide-y divide-border">
          {(requests.data ?? []).map((r) => (
            <li key={r.id} className="space-y-2 px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <PortalLogoStack portalId={r.portalId} name={r.portalName} size={32} />
                <span className="font-medium">{r.portalName}</span>
                <span className="text-muted-foreground">·</span>
                <span className="truncate">{r.organizationName}</span>
                {r.status === "pending" ? (
                  <StatusBadge tone="warning" dot>
                    În așteptare
                  </StatusBadge>
                ) : r.status === "approved" ? (
                  <StatusBadge tone="success" dot>
                    Aprobată
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="danger" dot>
                    Respinsă
                  </StatusBadge>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Cerut de {r.requestedByName ?? "administrator agenție"} pe{" "}
                {new Date(r.requestedAt).toLocaleString("ro-RO")}
                {r.rejectionReason ? ` · Motiv respingere: ${r.rejectionReason}` : ""}
              </p>

              {r.status === "pending" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => onOpenOrganization(r.organizationId)}>
                    Deschide activarea
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolve.mutate({ requestId: r.id, status: "approved" })}
                    disabled={resolve.isPending}
                  >
                    Marchează rezolvată
                  </Button>
                  {reasonFor === r.id ? (
                    <>
                      <Input
                        className="h-9 w-56"
                        placeholder="Motiv (opțional)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={resolve.isPending}
                        onClick={() =>
                          resolve.mutate({
                            requestId: r.id,
                            status: "rejected",
                            reason: reason || undefined,
                          })
                        }
                      >
                        Confirmă respingerea
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setReasonFor(r.id)}>
                      Respinge
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
