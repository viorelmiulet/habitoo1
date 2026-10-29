import { createFileRoute } from "@tanstack/react-router";
import { appHead } from "@/components/app/app-head";
import { AgencyPortalSetupPage } from "@/components/app/AgencyPortalSetupPage";

export const Route = createFileRoute("/_authenticated/app/portaluri/$portalId")({
  head: () => {
    const title = "Habitoo CRM — activare portal";
    const description = "Introdu datele de acces, testează conexiunea și activează portalul pentru agenția ta.";
    const head = appHead(title);
    return {
      ...head,
      meta: [
        ...head.meta,
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: PortalSetupRoute,
});

function PortalSetupRoute() {
  const { portalId } = Route.useParams();
  return <AgencyPortalSetupPage portalId={portalId} />;
}
