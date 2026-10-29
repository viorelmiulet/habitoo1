/**
 * Superadmin → Setări portaluri: carduri mutate din pagina Portaluri, fără
 * schimbări de funcționalitate. Agenția aleasă circulă prin `?org=`.
 */
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { EmptyState } from "@/components/app/EmptyState";
import { Input } from "@/components/ui/input";
import { appHead } from "@/components/app/app-head";
import { StoriaUnmatchedCard } from "@/components/superadmin/StoriaUnmatchedCard";
import { ImospotSettingsCard } from "@/components/superadmin/ImospotSettingsCard";
import { PortalRelayCard } from "@/components/superadmin/PortalRelayCard";
import { LaCheieCard } from "@/components/superadmin/LaCheieCard";
import { PortalOrgSelector } from "@/components/superadmin/PortalOrgSelector";
import { PropertyPortalsCard } from "@/components/app/PropertyPortalsCard";
import { PortalSlotsCard } from "@/components/app/PortalSlotsCard";
import { listOrgPropertiesForPortals, listPortalOrganizations } from "@/lib/portals.functions";

export const Route = createFileRoute("/_authenticated/superadmin/setari-portaluri")({
  head: () => {
    const title = "Habitoo CRM — setări portaluri";
    const description = "Setări globale și pe agenție pentru portalurile imobiliare: IP fix, chei, sloturi și publicarea ofertelor.";
    const base = appHead(title);
    return { ...base, meta: [...base.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  validateSearch: (search: Record<string, unknown>): { org?: string } =>
    typeof search.org === "string" ? { org: search.org } : {},
  component: PortalSettingsPage,
});

function PortalSettingsPage() {
  const loadOrgs = useServerFn(listPortalOrganizations);
  const loadProperties = useServerFn(listOrgPropertiesForPortals);
  const { org: orgFromLink } = Route.useSearch();
  const navigate = useNavigate({ from: "/superadmin/setari-portaluri" });

  const [organizationId, setOrganizationId] = useState<string>(orgFromLink ?? "");
  const [search, setSearch] = useState("");
  const [propertyId, setPropertyId] = useState<string>("");

  const orgs = useQuery({ queryKey: ["portal-organizations"], queryFn: () => loadOrgs({}) });

  useEffect(() => {
    if (orgFromLink) setOrganizationId(orgFromLink);
  }, [orgFromLink]);

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
        title="Setări portaluri"
        description="Setări globale ale portalurilor și publicarea ofertelor pentru agenția aleasă."
        actions={
          <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link to="/superadmin/portals" search={organizationId ? { org: organizationId } : {}}>
              Portaluri
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link to="/superadmin/portal-logs" search={organizationId ? { org: organizationId } : {}}>
              Jurnal portaluri
            </Link>
          </Button>
          </div>
        }
      />

      <PortalOrgSelector
        value={organizationId}
        orgs={orgs}
        onChange={(v) => {
          setOrganizationId(v);
          setPropertyId("");
          void navigate({ search: { org: v }, replace: true });
        }}
      />

      <div className="mt-6">
        <PortalRelayCard />
      </div>

      <div className="mt-6">
        <StoriaUnmatchedCard />
      </div>

      <div className="mt-6 space-y-6">
        <ImospotSettingsCard portal="imospot" />
        <ImospotSettingsCard portal="vdi" />
      </div>

      {organizationId ? (
        <div className="mt-6 space-y-6">
          <LaCheieCard organizationId={organizationId} />
          <PortalSlotsCard organizationId={organizationId} />

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
                        <PropertyPortalsCard
                          organizationId={organizationId}
                          propertyId={p.id}
                          showPortalJournal
                        />
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
