/**
 * Superadmin → Portaluri: singurul loc din produs unde se gestionează
 * integrările cu portalurile imobiliare (conectare, test, chei, sincronizare,
 * selecția ofertelor). Agențiile nu au acces la această zonă.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/PageHeader";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { EmptyState } from "@/components/app/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appHead } from "@/components/app/app-head";
import { PortalsCard } from "@/components/superadmin/PortalsCard";
import { PortalActivationRequestsCard } from "@/components/superadmin/PortalActivationRequestsCard";
import { PropertyPortalsCard } from "@/components/app/PropertyPortalsCard";
import {
  listOrgPropertiesForPortals,
  listPortalOrganizations,
} from "@/lib/portals.functions";

export const Route = createFileRoute("/_authenticated/superadmin/portals")({
  head: () => appHead("Habitoo CRM — portaluri imobiliare"),
  // Deep-link din dashboard: `?org=<id>` preselectează agenția vizată.
  // `?storia=` / `?storia_error=` vin de la returnarea autorizării OAuth Storia.
  validateSearch: (
    search: Record<string, unknown>,
  ): { org?: string; storia?: string; storia_error?: string } => ({
    ...(typeof search.org === "string" ? { org: search.org } : {}),
    ...(typeof search.storia === "string" ? { storia: search.storia } : {}),
    ...(typeof search.storia_error === "string" ? { storia_error: search.storia_error } : {}),
  }),
  component: SuperadminPortalsPage,
});


function SuperadminPortalsPage() {
  const loadOrgs = useServerFn(listPortalOrganizations);
  const loadProperties = useServerFn(listOrgPropertiesForPortals);
  const { org: orgFromLink, storia, storia_error: storiaError } = Route.useSearch();

  const [organizationId, setOrganizationId] = useState<string>(orgFromLink ?? "");
  const [search, setSearch] = useState("");
  const [propertyId, setPropertyId] = useState<string>("");

  const orgs = useQuery({ queryKey: ["portal-organizations"], queryFn: () => loadOrgs({}) });

  useEffect(() => {
    if (orgFromLink) setOrganizationId(orgFromLink);
  }, [orgFromLink]);

  // Rezultatul autorizării Storia (returnat de ruta publică de callback).
  useEffect(() => {
    if (storia === "connected") {
      toast.success("Contul Storia al agenției a fost conectat.");
    } else if (storiaError) {
      toast.error(
        storiaError === "invalid_state"
          ? "Autorizarea Storia nu a putut fi validată. Pornește conectarea din nou."
          : storiaError === "missing_code"
            ? "Storia nu a trimis codul de autorizare. Reia conectarea."
            : "Autorizarea Storia nu s-a finalizat. Codul este valabil doar un minut — reia conectarea.",
      );
    }
  }, [storia, storiaError]);


  useEffect(() => {
    if (!organizationId && orgs.data && orgs.data.length > 0) {
      setOrganizationId(orgs.data[0]!.id);
    }
  }, [orgs.data, organizationId]);


  const properties = useQuery({
    queryKey: ["portal-org-properties", organizationId, search],
    enabled: organizationId !== "",
    queryFn: () =>
      loadProperties({ data: { organizationId, search: search || undefined, limit: 25 } }),
  });

  return (
    <>
      <PageHeader
        title="Portaluri imobiliare"
        description="Integrările cu portalurile se configurează exclusiv de aici, separat pentru fiecare agenție."
      />

      <div className="panel space-y-3 p-5">
        <Label htmlFor="portal-org">Agenție</Label>
        {orgs.isLoading ? (
          <InlineLoading label="Se încarcă agențiile…" />
        ) : orgs.isError ? (
          <QueryError error={orgs.error} onRetry={() => orgs.refetch()} />
        ) : (
          <Select
            value={organizationId}
            onValueChange={(v) => {
              setOrganizationId(v);
              setPropertyId("");
            }}
          >
            <SelectTrigger id="portal-org" className="max-w-md">
              <SelectValue placeholder="Alege agenția" />
            </SelectTrigger>
            <SelectContent>
              {(orgs.data ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {organizationId ? (
        <div className="mt-6 space-y-6">
          <PortalActivationRequestsCard
            onOpenOrganization={(orgId) => {
              setOrganizationId(orgId);
              setPropertyId("");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
          <PortalsCard organizationId={organizationId} />


          <section className="panel">
            <header className="space-y-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold tracking-wide uppercase">
                  Publicarea ofertelor pe portaluri
                </h2>
                <p className="text-xs text-muted-foreground">
                  Alege o ofertă a agenției și bifează portalurile pe care trebuie publicată.
                </p>
              </div>
              <div className="relative max-w-md">
                <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Caută ofertă după titlu"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </header>

            {properties.isLoading ? (
              <div className="p-5">
                <InlineLoading label="Se încarcă ofertele…" />
              </div>
            ) : properties.isError ? (
              <div className="p-5">
                <QueryError error={properties.error} onRetry={() => properties.refetch()} />
              </div>
            ) : (properties.data ?? []).length === 0 ? (
              <EmptyState icon={Search} title="Nicio ofertă găsită" />
            ) : (
              <ul className="divide-y divide-border">
                {(properties.data ?? []).map((p) => (
                  <li key={p.id} className="px-5 py-3 text-sm">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setPropertyId((cur) => (cur === p.id ? "" : p.id))}
                    >
                      <span className="font-medium">{p.title}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{p.city ?? "—"}</span>
                    </button>
                    {propertyId === p.id ? (
                      <div className="mt-3">
                        <PropertyPortalsCard organizationId={organizationId} propertyId={p.id} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
