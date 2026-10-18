import { createFileRoute, Link } from "@tanstack/react-router";
import { CtaBand } from "@/components/marketing/CtaBand";
import { IntegrationsOverview } from "@/components/marketing/IntegrationsOverview";
import { IntegrationsIllustration } from "@/components/marketing/IntegrationsIllustration";
import { CrmLink } from "@/components/marketing/CrmLink";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { integrationItemListJsonLd } from "@/lib/portals/integration-overview";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";

const TITLE = "Integrări cu portalurile imobiliare — Habitoo CRM";
const DESCRIPTION = "Introduci anunțul o singură dată în Habitoo și alegi, pentru fiecare anunț, pe ce portaluri apare.";
const META_DESCRIPTION = "CRM imobiliar Habitoo publică anunțurile pe Storia, OLX, Imobiliare.ro, Romimo, Imospot, VDI.ro și alte portaluri. Introduci anunțul o dată, alegi unde apare.";

export const MULTI_PORTAL_INTRO = [
  "Fiecare portal aduce alți clienți. Cu Habitoo nu mai copiezi același anunț în fiecare cont: introduci datele și pozele o singură dată, apoi alegi portalurile din fila Publicare.",
  "Apeși Publică și trimiterea continuă chiar dacă închizi pagina. Modifici prețul sau pozele tot în Habitoo; portalurile primesc varianta nouă direct sau la următoarea preluare.",
  "La Vândută, Închiriată sau Arhivată, anunțul se retrage automat de pe portalurile care permit asta. Vezi starea fiecărei publicări și primești o notificare dacă apare o problemă.",
  "Mesajele de pe portalurile compatibile ajung ca lead-uri la agentul proprietății. Administratorul activează fiecare integrare din Setări → Portaluri; detaliile și limitele sunt pe pagina ei.",
];

const deliveryDescriptions = [
  "Publicare directă: apeși Publică pentru a trimite anunțul și modificările. Retragerea automată este disponibilă doar pe portalurile care o permit.",
  "Preluare automată: portalul citește periodic ofertele alese din Habitoo. Modificările și retragerile apar la următoarea preluare.",
  "Catalog Facebook: alegi anunțurile pentru reclame. Cele dezactivate sau vândute ies din catalog la următoarea preluare.",
];

export const Route = createFileRoute("/integrari")({
  head: () => publicHead({
    path: "/integrari",
    title: TITLE,
    description: META_DESCRIPTION,
    jsonLd: [...pageJsonLd({ path: "/integrari", name: "Integrări cu portalurile imobiliare", description: DESCRIPTION }), integrationItemListJsonLd()],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <PublicLayout footerDescription="CRM imobiliar pentru agențiile din România, într-o singură platformă.">
      <section className="overflow-hidden border-b border-border bg-background">
        <Container className="pt-12 pb-8 sm:pt-16 sm:pb-12">
          <SectionHeading as="h1" title="Integrări cu portalurile imobiliare" text={DESCRIPTION} />
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg"><CrmLink to="/register">Creează agenția <ArrowRight /></CrmLink></Button>
            <Button asChild size="lg" variant="outline"><Link to="/contact" search={{ interes: "demo" }}>Solicită o demonstrație</Link></Button>
          </div>
          <IntegrationsIllustration />
        </Container>
      </section>
      <Section className="py-10 sm:py-12 lg:py-16">
        <Container className="max-w-3xl space-y-4 text-base leading-relaxed text-foreground sm:text-lg">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">Publici pe mai multe portaluri dintr-un singur loc</h2>
          {MULTI_PORTAL_INTRO.map((p) => <p key={p}>{p}</p>)}
        </Container>
      </Section>
      <Section className="pt-0 sm:pt-0 lg:pt-0">
        <Container><IntegrationsOverview /></Container>
        <Container className="mt-10 text-center">
          <p className="text-sm text-muted-foreground">
            Ai întrebări despre publicare? Vezi{" "}
            <Link to="/intrebari-frecvente" className="font-medium text-primary underline-offset-4 hover:underline">
              întrebările frecvente
            </Link>
            .
          </p>
        </Container>
      </Section>
      <Section tone="muted">
        <Container>
          <div className="grid gap-8 md:grid-cols-3">
            {deliveryDescriptions.map((description) => (
              <p key={description} className="text-sm leading-relaxed text-foreground sm:text-base">{description}</p>
            ))}
          </div>
        </Container>
      </Section>
      <CtaBand text="Creează agenția în câteva minute, invită echipa și lucrează dintr-un singur sistem." />
    </PublicLayout>
  );
}