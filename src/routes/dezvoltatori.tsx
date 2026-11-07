import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { DeveloperDocs } from "@/components/marketing/DeveloperDocs";
import { publicHead } from "@/components/marketing/public-head";

export const Route = createFileRoute("/dezvoltatori")({
  head: () => {
    const head = publicHead({path: "/dezvoltatori", title: "API Habitoo pentru portaluri imobiliare", description: "Documentația API Habitoo pentru portaluri imobiliare: indexul agențiilor, feed JSON și XML Kyero, fotografii, lead-uri, autentificare și exemple curl."});
    // A technical reference has no cover image; omit the marketing fallback and subscription-price graph.
    return {...head, meta: head.meta.filter(m => !["og:image", "og:image:width", "og:image:height", "twitter:image"].includes(m.property ?? m.name ?? "")), scripts: []};
  },
  component: DeveloperPage,
});
function DeveloperPage() {
  return <PublicLayout footerDescription="API pentru portaluri imobiliare: anunțuri, agenți, fotografii și actualizări din Habitoo."><DeveloperDocs /></PublicLayout>;
}