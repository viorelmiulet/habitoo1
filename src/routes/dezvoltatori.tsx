import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { DeveloperDocumentation } from "@/components/marketing/DeveloperDocumentation";
import { publicHead } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { developerFaq } from "@/components/marketing/developer-faq";
import { FaqSection, faqPageJsonLd } from "@/components/marketing/FaqSection";

export const Route = createFileRoute("/dezvoltatori")({
  head: () => {
    return publicHead({path: "/dezvoltatori", title: "Integrări Habitoo: Partner API și feed pentru site-ul agenției", description: "Partner API pentru portaluri și feed pentru site-ul propriu al agenției. Află de unde generezi tokenul în Habitoo, cum îl folosești și cum verifici accesul.", jsonLd: [...pageJsonLd({ path: "/dezvoltatori", name: "Documentație Partner API și feed", description: "Integrarea portalurilor și a site-ului agenției cu Habitoo CRM." }), faqPageJsonLd(developerFaq)]});
  },
  component: DeveloperPage,
});
function DeveloperPage() {
  return <PublicLayout footerDescription="API pentru portaluri imobiliare: anunțuri, agenți, fotografii și actualizări din Habitoo."><DeveloperDocumentation /><FaqSection items={developerFaq} title="Întrebări despre Partner API și feed" /></PublicLayout>;
}