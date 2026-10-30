/**
 * Superadmin → Portaluri: singurul loc din produs unde se gestionează
 * integrările cu portalurile imobiliare (conectare, test, chei, sincronizare,
 * selecția ofertelor). Agențiile nu au acces la această zonă.
 */
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";

import { PageHeader } from "@/components/app/PageHeader";
import { PortalOrgSelector } from "@/components/superadmin/PortalOrgSelector";
import { appHead } from "@/components/app/app-head";
import { PortalsCard } from "@/components/superadmin/PortalsCard";
import { PortalActivationRequestsCard } from "@/components/superadmin/PortalActivationRequestsCard";
import { listPortalOrganizations } from "@/lib/portals.functions";

export const Route = createFileRoute("/_authenticated/superadmin/portals")({
  head: () => {
    const title = "Habitoo CRM — portaluri imobiliare";
    const description = "Administrarea conexiunilor, activărilor și testelor portalurilor imobiliare pentru agențiile Habitoo.";
    const base = appHead(title);
    return { ...base, meta: [...base.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  // Deep-link din dashboard: `?org=<id>` preselectează agenția vizată.
  // `?storia=` / `?storia_error=` vin de la returnarea autorizării OAuth Storia.
  validateSearch: (
    search: Record<string, unknown>,
  ): { org?: string; storia?: string; storia_error?: string; zup?: string } => ({
    ...(typeof search.zup === "string" ? { zup: search.zup } : {}),
    ...(typeof search.org === "string" ? { org: search.org } : {}),
    ...(typeof search.storia === "string" ? { storia: search.storia } : {}),
    ...(typeof search.storia_error === "string" ? { storia_error: search.storia_error } : {}),
  }),
  component: SuperadminPortalsPage,
});

function SuperadminPortalsPage() {
  const loadOrgs = useServerFn(listPortalOrganizations);
  const navigate = useNavigate({ from: "/superadmin/portals" });
  const { org: orgFromLink, storia, storia_error: storiaError, zup } = Route.useSearch();

  const [organizationId, setOrganizationId] = useState<string>(orgFromLink ?? "");
  const [selectedPortal, setSelectedPortal] = useState<string>("");
  useEffect(() => {
    if (zup === "connected") toast.success("Contul ZUP al agenției a fost conectat.");
    else if (zup) toast.error("Conectarea ZUP nu s-a finalizat. Pornește conectarea din nou.");
  }, [zup]);

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


  return (
    <>
      <PageHeader
        title="Portaluri imobiliare"
        description="Integrările cu portalurile se configurează exclusiv de aici, separat pentru fiecare agenție."
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link to="/superadmin/portal-logs" search={organizationId ? { org: organizationId, ...(selectedPortal ? { portal: selectedPortal } : {}) } : {}}>
              Jurnal portaluri
            </Link>
          </Button>
        }
      />

      <PortalOrgSelector
        value={organizationId}
        orgs={orgs}
        onChange={(v) => {
          setOrganizationId(v);
          void navigate({ search: (prev) => ({ ...prev, org: v }), replace: true });
        }}
      />

      <div className="mt-6">
        <Button asChild variant="outline" className="h-11">
          <Link to="/superadmin/setari-portaluri" search={organizationId ? { org: organizationId } : {}}>
            Setări portaluri
          </Link>
        </Button>
      </div>

      {organizationId ? (
        <div className="mt-6 space-y-6">
          <PortalsCard organizationId={organizationId} onSelectedChange={setSelectedPortal} />
          <PortalActivationRequestsCard
            onOpenOrganization={(orgId) => {
              setOrganizationId(orgId);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>
      ) : null}
    </>
  );
}
