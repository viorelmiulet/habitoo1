import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { useCurrentUser } from "@/hooks/use-session";
import { getAgencyPortalCatalog, requestPortalActivation } from "@/lib/portal-activation.functions";
import { LaCheieActivationPanel } from "@/components/app/LaCheieActivationPanel";
import { LACHEIE_PORTAL_KEY } from "@/lib/portals/lacheie/config";
import { agencyGridItems, agencyPortalCardState } from "@/lib/portals/grid-state";

export function AgencyPortalCatalogCard() {
  const queryClient = useQueryClient();
  const loadCatalog = useServerFn(getAgencyPortalCatalog);
  const sendRequest = useServerFn(requestPortalActivation);
  const { data: currentUser } = useCurrentUser();
  const organizationId = currentUser?.organization?.id ?? null;

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
    onError: () => toast.error("Cererea nu a fost trimisă. Încearcă din nou."),
  });

  return (
    <section className="panel">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Portaluri imobiliare</h2>
        <p className="text-xs text-muted-foreground">
          Cere activarea portalurilor de care ai nevoie. Le activează echipa Habitoo.
        </p>
      </header>

      {catalog.isLoading ? (
        <div className="p-5">
          <InlineLoading label="Se încarcă portalurile…" />
        </div>
      ) : catalog.isError ? (
        <div className="p-5">
          <QueryError
            error={new Error("Portalurile nu s-au încărcat. Încearcă din nou.")}
            onRetry={() => catalog.refetch()}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">
          {agencyGridItems(catalog.data ?? []).map((item) => {
            const state = agencyPortalCardState(item);
            const isLaCheie = item.id === LACHEIE_PORTAL_KEY;
            return (
              <li
                key={item.id}
                data-portal-card={item.id}
                data-portal-state={state.key}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  <PortalLogoStack
                    portalId={item.id}
                    name={item.displayName}
                    size={40}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] leading-6 font-bold break-words">{item.displayName}</p>
                  </div>
                </div>
                <div data-portal-statuses className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    {state.key === "connected" ? (
                      <span className="inline-flex items-center gap-2 text-sm font-medium">
                        <span aria-hidden className="size-2 rounded-full bg-success" />
                        Conectat
                      </span>
                    ) : isLaCheie && organizationId ? (
                      <LaCheieActivationPanel organizationId={organizationId} />
                    ) : (
                      <Button
                        className="h-11 w-full sm:w-auto"
                        variant={state.disabled ? "outline" : "default"}
                        disabled={state.disabled || request.isPending}
                        onClick={() => request.mutate(item.id)}
                      >
                        {state.buttonLabel}
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
