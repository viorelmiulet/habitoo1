import { isKeyRequestPortal, keyRequestLabel } from "@/lib/portals/imospot-key-request";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { FacebookCatalogCard } from "@/components/app/FacebookCatalogCard";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { useCurrentUser } from "@/hooks/use-session";
import {
  getAgencyPortalCatalog,
  requestPortalActivation,
  selfActivatePortal,
} from "@/lib/portal-activation.functions";
import { startStoriaAuthorization } from "@/lib/portals/storia.functions";
import { startOlxAuthorization } from "@/lib/portals/olx.functions";
import { startZupAuthorization, revokeZupAuthorization, testZupAuthorization } from "@/lib/portals/zup.functions";
import { ZUP_MISSING_MESSAGE } from "@/lib/portals/zup/config";
import { LaCheieActivationPanel } from "@/components/app/LaCheieActivationPanel";
import { LACHEIE_PORTAL_KEY } from "@/lib/portals/lacheie/config";
import { agencyGridItems, agencyPortalCardState } from "@/lib/portals/grid-state";

export function AgencyPortalCatalogCard() {
  const queryClient = useQueryClient();
  const loadCatalog = useServerFn(getAgencyPortalCatalog);
  const sendRequest = useServerFn(requestPortalActivation);
  const runActivate = useServerFn(selfActivatePortal);
  const runStoria = useServerFn(startStoriaAuthorization);
  const runOlx = useServerFn(startOlxAuthorization);
  const runZup = useServerFn(startZupAuthorization);
  const revokeZup = useServerFn(revokeZupAuthorization);
  const testZup = useServerFn(testZupAuthorization);
  const { data: currentUser } = useCurrentUser();
  const organizationId = currentUser?.organization?.id ?? null;

  const catalog = useQuery({
    queryKey: ["agency-portal-catalog"],
    queryFn: () => loadCatalog({}),
  });

  const request = useMutation({
    mutationFn: async (portalId: string) => ({ portalId, ...(await sendRequest({ data: { portalId } })) }),
    onSuccess: (result) => {
      toast.success(
        isKeyRequestPortal(result.portalId)
          ? `Cererea a fost trimisă către ${keyRequestLabel(result.portalId)}. Vei primi cheia pe email.`
          : result.alreadyPending
          ? "Cererea era deja trimisă și așteaptă aprobare."
          : "Cererea de activare a fost trimisă.",
      );
      void queryClient.invalidateQueries({ queryKey: ["agency-portal-catalog"] });
    },
    onError: () => toast.error("Cererea nu a fost trimisă. Încearcă din nou."),
  });

  const activate = useMutation({
    mutationFn: async (portalId: string) => {
      const result = await runActivate({ data: { portalId } });
      if (!result.ok) throw new Error("activation_failed");
      return result;
    },
    onSuccess: () => {
      toast.success("Portalul a fost activat.");
      void queryClient.invalidateQueries({ queryKey: ["agency-portal-catalog"] });
    },
    onError: () => {
      toast.error("Activarea nu a reușit acum. Încearcă din nou sau scrie-ne.");
      void queryClient.invalidateQueries({ queryKey: ["agency-portal-catalog"] });
    },
  });

  const connect = useMutation({
    mutationFn: async (portalId: string) => {
      if (!organizationId) throw new Error("no_org");
      if (portalId !== "olx_direct" && portalId !== "zup") await runActivate({ data: { portalId } });
      const { url } =
        portalId === "olx_direct"
          ? await runOlx({ data: { organizationId } })
          : portalId === "zup" ? await runZup({ data: { organizationId } })
          : await runStoria({ data: { organizationId } });
      window.location.assign(url);
    },
    onError: (e: Error) => toast.error(e.message || "Conectarea nu a pornit. Încearcă din nou sau scrie-ne."),
  });

  const busy = request.isPending || activate.isPending || connect.isPending;
  const zupAction = useMutation({
    mutationFn: async (action: "test" | "disconnect") => {
      if (!organizationId) throw new Error("Agenția nu a fost găsită.");
      if (action === "disconnect") { await revokeZup({ data: { organizationId } }); return "Contul ZUP a fost deconectat."; }
      const result = await testZup({ data: { organizationId } });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: message => { toast.success(message); void queryClient.invalidateQueries({ queryKey: ["agency-portal-catalog"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="panel">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Portaluri imobiliare</h2>
        <p className="text-xs text-muted-foreground">
          Cere activarea portalurilor de care ai nevoie. Le activează echipa Habitoo. Unele le poți activa direct.
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
            if (item.id === "facebook_catalog") {
              return (
                <li
                  key={item.id}
                  data-portal-card={item.id}
                  data-portal-state={item.connectionStatus}
                  className="rounded-xl border border-border bg-surface p-4 md:col-span-2 lg:col-span-3"
                >
                  <FacebookCatalogCard portalList />
                </li>
              );
            }
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
                {isKeyRequestPortal(item.id) ? (
                  <div className="space-y-2 text-xs text-muted-foreground">
                    {item.request?.status === "approved" && state.key !== "connected" ? (
                      <p data-imospot-sent className="font-medium text-foreground">
                        Cererea a fost trimisă către {keyRequestLabel(item.id)}. Vei primi cheia pe email.
                      </p>
                    ) : (
                      <p>
                        Cheia API este emisă de {keyRequestLabel(item.id)}, de obicei în aceeași zi lucrătoare, și
                        ajunge pe emailul administratorului.
                      </p>
                    )}
                    {item.companyDataMissing.length > 0 ? (
                      <p data-imospot-incomplete className="text-destructive">
                        Completează datele firmei în{" "}
                        <Link to="/app/settings" search={{ tab: "agency" }} className="underline">
                          Setări → Agenție
                        </Link>{" "}
                        ca să poți solicita cheia {keyRequestLabel(item.id)}.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div data-portal-statuses className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    {item.id === "zup" ? (
                      <>
                        <span className="text-sm">{item.connectionStatus === "connected" ? "Conectat" : item.connectionStatus === "error" ? "Eroare" : "Deconectat"}</span>
                        <Button disabled={busy || zupAction.isPending || item.zupConfigured !== true} onClick={() => connect.mutate("zup")}>
                          {item.zupConfigured !== true ? ZUP_MISSING_MESSAGE : item.zupConnected ? "Reconectează contul ZUP" : "Conectează contul ZUP"}
                        </Button>
                        {item.zupConnected ? <><Button variant="outline" disabled={zupAction.isPending} onClick={() => zupAction.mutate("test")}>Testează conexiunea</Button><Button variant="outline" disabled={zupAction.isPending} onClick={() => zupAction.mutate("disconnect")}>Deconectează</Button></> : null}
                      </>
                    ) : state.key === "connected" ? (
                      <span className="inline-flex items-center gap-2 text-sm font-medium">
                        <span
                          aria-hidden
                          className={
                            state.tone === "success"
                              ? "size-2 rounded-full bg-success"
                              : state.tone === "danger"
                                ? "size-2 rounded-full bg-destructive"
                                : "size-2 rounded-full bg-muted-foreground"
                          }
                        />
                        {state.label}
                      </span>
                    ) : isKeyRequestPortal(item.id) && item.request?.status === "approved" ? null : isLaCheie && organizationId ? (
                      <LaCheieActivationPanel organizationId={organizationId} />
                    ) : (
                      <Button
                        className="h-11 w-full sm:w-auto"
                        variant={state.disabled ? "outline" : "default"}
                        disabled={state.disabled || busy}
                        onClick={() =>
                          state.key === "activate"
                            ? activate.mutate(item.id)
                            : state.key === "oauth"
                              ? connect.mutate(item.id)
                              : request.mutate(item.id)
                        }
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
