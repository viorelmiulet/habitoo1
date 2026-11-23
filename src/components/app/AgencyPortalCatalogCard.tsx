import { StoriaAccountControls } from "@/components/app/StoriaAccountControls";
import { isKeyRequestPortal, keyRequestLabel } from "@/lib/portals/imospot-key-request";
import { useEffect } from "react";
import type * as React from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HOUSERA_APPROVAL_NOTE } from "@/lib/portals/housera/config";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { PortalLogoStack } from "@/components/app/PortalLogo";
import { FacebookCatalogCard } from "@/components/app/FacebookCatalogCard";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { useCurrentUser } from "@/hooks/use-session";
import {
  getAgencyPortalCatalog,
  selfActivatePortal,
} from "@/lib/portal-activation.functions";
import { startStoriaAuthorization } from "@/lib/portals/storia.functions";
import { startOlxAuthorization } from "@/lib/portals/olx.functions";
import { startZupAuthorization, revokeZupAuthorization, testZupAuthorization } from "@/lib/portals/zup.functions";
import { ZUP_MISSING_MESSAGE } from "@/lib/portals/zup/config";
import { HouseraConnectionControls, useHouseraCallbackToast } from "@/components/app/HouseraConnectionControls";
import { agencyGridItems, agencyPortalCardState } from "@/lib/portals/grid-state";

export function AgencyPortalCatalogCard() {
  useHouseraCallbackToast();
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("zup");
    if (result === "connected") toast.success("Contul ZUP al agenției a fost conectat.");
    else if (result) toast.error("Conectarea ZUP nu s-a finalizat. Pornește conectarea din nou.");
  }, []);
  const queryClient = useQueryClient();
  const loadCatalog = useServerFn(getAgencyPortalCatalog);
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

  const busy = connect.isPending;
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
      <header className="space-y-1 border-b border-border px-4 py-4 sm:px-5">
        <h2 className="text-base font-bold text-foreground">Portaluri imobiliare</h2>
        <p className="text-[13px] text-muted-foreground">
          Cere activarea portalurilor de care ai nevoie: pe pagina fiecărui portal introduci datele de acces și îl activezi singur.
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
        <ul className="divide-y divide-border">
          {agencyGridItems(catalog.data ?? []).map((item) => {
            const state = agencyPortalCardState(item);
            if (item.id === "facebook_catalog") {
              return (
                <li
                  key={item.id}
                  data-portal-card={item.id}
                  data-portal-state={item.connectionStatus}
                  className="min-w-0 px-4 py-3 sm:px-5"
                >
                  <FacebookCatalogCard portalList />
                </li>
              );
            }
            const info = portalInfo(item, state.key);
            const statusBadge = (label: string, tone: "success" | "danger" | "neutral" | "warning") => (
              <StatusBadge className="h-7 text-[13px]" tone={tone} dot>
                {label}
              </StatusBadge>
            );
            const btn = "h-11 w-full min-w-44 sm:w-auto";
            let actions: React.ReactNode;
            if (item.id === "storia" && organizationId) actions = null;
            else if (item.id === "housera" && organizationId) {
              actions = (
                <HouseraConnectionControls
                  layout="row"
                  organizationId={organizationId}
                  configured={item.houseraConfigured === true}
                  connected={item.houseraConnected === true}
                  oauth={item.houseraOAuth}
                  beforeConnect={() => runActivate({ data: { portalId: "housera" } })}
                  onChanged={() => void queryClient.invalidateQueries({ queryKey: ["agency-portal-catalog"] })}
                />
              );
            } else if (item.id === "zup") {
              actions = item.zupConfigured !== true ? (
                statusBadge("Indisponibil", "neutral")
              ) : (
                <>
                  {statusBadge(
                    item.connectionStatus === "connected" ? "Conectat" : item.connectionStatus === "error" ? "Eroare" : "Deconectat",
                    item.connectionStatus === "connected" ? "success" : item.connectionStatus === "error" ? "danger" : "neutral",
                  )}
                  <Button className={btn} disabled={busy || zupAction.isPending} onClick={() => connect.mutate("zup")}>
                    {item.zupConnected ? "Reconectează" : "Conectează"}
                  </Button>
                  {item.zupConnected ? <><Button variant="outline" className="h-11" disabled={zupAction.isPending} onClick={() => zupAction.mutate("test")}>Testează conexiunea</Button><Button variant="outline" className="h-11" disabled={zupAction.isPending} onClick={() => zupAction.mutate("disconnect")}>Deconectează</Button></> : null}
                </>
              );
            } else if (state.key === "connected") {
              actions = (
                <>
                  {statusBadge(state.label, state.tone === "muted" ? "neutral" : state.tone)}
                  <Button asChild variant="outline" className={btn}>
                    <Link to="/app/portaluri/$portalId" params={{ portalId: item.id }} data-portal-settings>Setări portal</Link>
                  </Button>
                </>
              );
            } else if (state.key === "oauth") {
              actions = (
                <>
                  {statusBadge("Deconectat", "neutral")}
                  <Button className={btn} disabled={busy} onClick={() => connect.mutate(item.id)}>{state.buttonLabel}</Button>
                </>
              );
            } else {
              actions = (
                <>
                  {state.key === "pending" || (isKeyRequestPortal(item.id) && item.request?.status === "approved")
                    ? statusBadge("În așteptare", "warning")
                    : statusBadge("Deconectat", "neutral")}
                  <Button asChild className={btn} variant="default">
                    <Link to="/app/portaluri/$portalId" params={{ portalId: item.id }} data-portal-activate>{state.buttonLabel}</Link>
                  </Button>
                </>
              );
            }
            return (
              <li
                key={item.id}
                data-portal-card={item.id}
                data-portal-state={state.key}
                className="min-h-16 min-w-0 px-4 py-3 sm:px-5"
              >
                <div data-portal-row className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div data-portal-identity className="flex min-w-0 items-center gap-3">
                    <PortalLogoStack portalId={item.id} name={item.displayName} size={32} className="shrink-0" />
                    <p className="shrink-0 whitespace-nowrap text-[15px] leading-6 font-semibold">{item.displayName}</p>
                    {info ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" aria-label={`Informații ${item.displayName}`} data-portal-info className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                            <Info className="size-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{info}</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                  {actions ? (
                    <div data-portal-statuses className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
                  ) : null}
                </div>
                {item.id === "storia" && organizationId ? (
                  <div data-storia-accounts className="mt-3 space-y-2 border-t border-border pt-3 sm:pl-11">
                    <StoriaAccountControls organizationId={organizationId} layout="rows" />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type CatalogItem = Awaited<ReturnType<typeof getAgencyPortalCatalog>>[number];

/** Explicațiile scurte ale portalului: doar în tooltip, niciodată sub nume. */
function portalInfo(item: CatalogItem, stateKey: string): string | null {
  if (item.id === "housera") return HOUSERA_APPROVAL_NOTE;
  if (item.id === "zup" && item.zupConfigured !== true) return ZUP_MISSING_MESSAGE;
  if (isKeyRequestPortal(item.id)) {
    const label = keyRequestLabel(item.id);
    const base = item.request?.status === "approved" && stateKey !== "connected"
      ? `Cererea a fost trimisă către ${label}. Vei primi cheia pe email.`
      : `Cheia API este emisă de ${label}, de obicei în aceeași zi lucrătoare, și ajunge pe emailul administratorului.`;
    return item.companyDataMissing.length > 0 ? `${base} Completează datele firmei în Setări → Agenție ca să poți solicita cheia.` : base;
  }
  return null;
}
