/**
 * Catalog de portaluri pentru administratorul agenției: READ-ONLY + cerere de
 * activare. Nicio credențială, nicio conexiune, nicio configurare aici —
 * acelea rămân exclusiv la Superadmin.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
        <ul className="divide-y divide-border">
          {(catalog.data ?? []).map((item) => {
            const pending = item.request?.status === "pending";
            return (
              <li
                key={item.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <PortalLogo portalId={item.id} name={item.displayName} size={24} />
                    <span className="text-sm font-medium">{item.displayName}</span>
                    {item.activated ? (
                      <Badge variant="default">Activat</Badge>
                    ) : (
                      <Badge variant="secondary">Neactivat</Badge>
                    )}
                    {item.availability !== "available" ? (
                      <Badge variant="outline">În pregătire</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  {item.request?.status === "rejected" ? (
                    <p className="mt-1 text-xs text-destructive">
                      Cerere respinsă
                      {item.request.rejectionReason ? `: ${item.request.rejectionReason}` : "."}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0">
                  {item.activated ? (
                    <span className="text-xs text-muted-foreground">Disponibil în publicare</span>
                  ) : (
                    <Button
                      size="sm"
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
