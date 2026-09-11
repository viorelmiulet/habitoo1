/**
 * Catalog de portaluri pentru administratorul agenției: READ-ONLY + cerere de
 * activare. Nicio credențială, nicio conexiune, nicio configurare aici —
 * acelea rămân exclusiv la Superadmin.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PortalLogo } from "@/components/app/PortalLogo";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import {
  getAgencyPortalCatalog,
  requestPortalActivation,
} from "@/lib/portal-activation.functions";

export function AgencyPortalCatalogCard() {
  const queryClient = useQueryClient();
  const loadCatalog = useServerFn(getAgencyPortalCatalog);
  const sendRequest = useServerFn(requestPortalActivation);

  const catalog = useQuery({
    queryKey: ["agency-portal-catalog"],
    queryFn: () => loadCatalog({}),
  });

  const request = useMutation({
    mutationFn: (portalId: string) => sendRequest({ data: { portalId } }),
    onSuccess: (result) => {
      toast.success(
        result.alreadyPending
          ? "Cererea era deja trimisă și așteaptă aprobare."
          : "Cererea de activare a fost trimisă.",
      );
      void queryClient.invalidateQueries({ queryKey: ["agency-portal-catalog"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="panel">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Portaluri imobiliare</h2>
        <p className="text-xs text-muted-foreground">
          Configurarea conexiunilor se face de echipa Habitoo. Aici vezi ce portaluri sunt
          disponibile și poți cere activarea lor pentru agenția ta.
        </p>
      </header>

      {catalog.isLoading ? (
        <div className="p-5">
          <InlineLoading label="Se încarcă portalurile…" />
        </div>
      ) : catalog.isError ? (
        <div className="p-5">
          <QueryError error={catalog.error} onRetry={() => catalog.refetch()} />
        </div>
      ) : (
        <ul className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {(catalog.data ?? []).map((item) => {
            const pending = item.request?.status === "pending";
            const rejected = item.request?.status === "rejected";
            return (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
                    <PortalLogo portalId={item.id} name={item.displayName} size={32} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.displayName}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {item.activated ? (
                        <StatusBadge tone="success" dot>
                          Activat
                        </StatusBadge>
                      ) : pending ? (
                        <StatusBadge tone="warning" dot>
                          Cerere trimisă
                        </StatusBadge>
                      ) : rejected ? (
                        <StatusBadge tone="danger" dot>
                          Respins
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Neactivat</StatusBadge>
                      )}
                      {item.availability !== "available" ? (
                        <StatusBadge tone="neutral">În pregătire</StatusBadge>
                      ) : null}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{item.description}</p>
                {rejected ? (
                  <p className="text-xs text-destructive">
                    {item.request?.rejectionReason
                      ? `Motiv: ${item.request.rejectionReason}`
                      : "Cererea a fost respinsă."}
                  </p>
                ) : null}

                <div className="mt-auto pt-1">
                  {item.activated ? (
                    <span className="text-xs text-muted-foreground">Disponibil în publicare</span>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      variant={pending ? "outline" : "default"}
                      disabled={pending || request.isPending}
                      onClick={() => request.mutate(item.id)}
                    >
                      {pending ? "Cerere trimisă" : "Solicită activare"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
