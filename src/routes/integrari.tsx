import { createFileRoute } from "@tanstack/react-router";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PortalGrid } from "@/components/marketing/PortalGrid";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";

const TITLE = "Integrări cu portalurile imobiliare — Habitoo CRM";
const DESCRIPTION = "Introduci anunțul o singură dată în Habitoo și alegi, pentru fiecare anunț, pe ce portaluri apare.";

const deliveryDescriptions = [
  "Trimitere directă: Habitoo trimite anunțul către portal când îl publici; actualizările se trimit când apeși «Publică», iar la Vândut, Închiriat sau Arhivat anunțul este retras automat.",
  "Feed: anunțurile selectate apar în feedul Habitoo, pe care portalul îl citește periodic; modificările și retragerile apar la următoarea citire a portalului.",
  "Catalog Facebook: anunțurile pe care le activezi intră în feedul de catalog citit de Meta Commerce Manager; un anunț dezactivat sau vândut iese din catalog la următoarea citire.",
];

export const Route = createFileRoute("/integrari")({
  head: () => publicHead({
    path: "/integrari",
    title: TITLE,
    description: DESCRIPTION,
    jsonLd: pageJsonLd({ path: "/integrari", name: "Integrări cu portalurile imobiliare", description: DESCRIPTION }),
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <PublicLayout>
      <section className="mk-hero-bg border-b border-border">
        <Container className="py-16 sm:py-20 lg:py-24">
          <SectionHeading as="h1" title="Integrări cu portalurile imobiliare" text={DESCRIPTION} />
        </Container>
      </section>
      <Section>
        <Container><PortalGrid /></Container>
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
      <CtaBand />
    </PublicLayout>
  );
}