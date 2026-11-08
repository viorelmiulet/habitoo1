import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { DeveloperDocumentation } from "@/components/marketing/DeveloperDocumentation";
import { publicHead } from "@/components/marketing/public-head";

export const Route = createFileRoute("/dezvoltatori")({
  head: () => {
    const head = publicHead({path: "/dezvoltatori", title: "Integrări Habitoo: Partner API și feed pentru site-ul agenției", description: "Partner API pentru portaluri și feed pentru site-ul propriu al agenției. Află de unde generezi tokenul în Habitoo, cum îl folosești și cum verifici accesul."});
    // A technical reference has no cover image; omit the marketing fallback and subscription-price graph.
    return {...head, meta: head.meta.filter(m => !["og:image", "og:image:width", "og:image:height", "twitter:image"].includes(m.property ?? m.name ?? "")), scripts: []};
  },
  component: DeveloperPage,
});
function DeveloperPage() {
  return <PublicLayout footerDescription="API pentru portaluri imobiliare: anunțuri, agenți, fotografii și actualizări din Habitoo."><DeveloperDocumentation /></PublicLayout>;
}